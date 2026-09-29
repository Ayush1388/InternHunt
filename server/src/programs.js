// Watches official program pages (government internships, company hiring programs, fresher drives).
// These aren't posted as normal jobs, so we fetch each official page, and track:
//   - when its application-related text last changed,
//   - the nearest upcoming deadline written on the page,
//   - whether it says applications are open or closed.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { getText, getJson, mapLimit } from './lib/http.js';
import { htmlToText, sha1 } from './lib/text.js';
import { DISCOVERED_PATH } from './ingest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAMS_PATH = path.join(here, 'config', 'programs.json');
const CHECK_EVERY_HOURS = 20;

db.exec(`
  CREATE TABLE IF NOT EXISTS programs_state (
    id          TEXT PRIMARY KEY,
    hash        TEXT,
    checked_at  TEXT,
    changed_at  TEXT,
    deadline    TEXT,
    status      TEXT,
    error       TEXT
  );

  -- Live items under a program card (e.g. open LFX mentorship projects).
  CREATE TABLE IF NOT EXISTS program_items (
    program_id TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (program_id, item_id)
  );

  -- Programs you added with "Add from link".
  CREATE TABLE IF NOT EXISTS user_programs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    url        TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

export function loadPrograms() {
  const builtIn = JSON.parse(readFileSync(PROGRAMS_PATH, 'utf8')).programs;
  const added = db.prepare('SELECT * FROM user_programs ORDER BY created_at DESC').all().map((u) => ({
    id: u.id,
    name: u.name,
    org: new URL(u.url).hostname.replace(/^www\./, ''),
    category: 'added',
    url: u.url,
    window: 'Watched for changes and deadlines',
    stipend: '—',
    eligibility: 'See the page',
    watch: true,
    userAdded: true,
  }));
  return [...added, ...builtIn];
}

export function addUserProgram(name, url) {
  const id = `user-${sha1(url).slice(0, 10)}`;
  db.prepare('INSERT OR IGNORE INTO user_programs (id, name, url, created_at) VALUES (?, ?, ?, ?)').run(id, name.slice(0, 120), url, new Date().toISOString());
  return id;
}

export function removeUserProgram(id) {
  db.prepare('DELETE FROM user_programs WHERE id = ?').run(id);
  db.prepare('DELETE FROM programs_state WHERE id = ?').run(id);
}

// ---------- Live feeds ----------
// LFX Mentorship publishes its project list as JSON; we keep the ones accepting applications now.
async function lfxOpenProjects() {
  const now = Date.now() / 1000;
  const items = [];
  for (let from = 0; from < 600; from += 100) {
    const res = await getJson(
      `https://api.mentorship.lfx.linuxfoundation.org/projects/cache/paginate?from=${from}&size=100&sortby=updatedStamp&order=desc`,
      { timeoutMs: 30000 }
    );
    const hits = res?.hits?.hits || [];
    for (const { _source: p } of hits) {
      if (!p || p.status !== 'Published') continue;
      const term = (p.programTerms || []).find(
        (t) => t.applicationStartDate <= now && t.applicationEndDate >= now && t.active !== 'closed'
      );
      if (!term && !p.acceptApplications) continue;
      items.push({
        id: p.projectId,
        title: p.name,
        org: p.lfProjectName || p.industry || '',
        skills: (p.apprenticeNeeds?.skills || []).slice(0, 6),
        deadline: term ? new Date(term.applicationEndDate * 1000).toISOString().slice(0, 10) : null,
        url: `https://mentorship.lfx.linuxfoundation.org/project/${p.projectId}`,
      });
    }
    if (hits.length < 100) break;
  }
  return items;
}
const LIVE_FEEDS = { lfx: lfxOpenProjects };

async function refreshLiveFeeds(programs, log) {
  for (const p of programs.filter((x) => x.live && LIVE_FEEDS[x.live])) {
    try {
      const items = await LIVE_FEEDS[p.live]();
      const now = new Date().toISOString();
      db.exec('BEGIN');
      db.prepare('DELETE FROM program_items WHERE program_id = ?').run(p.id);
      const ins = db.prepare('INSERT OR REPLACE INTO program_items (program_id, item_id, data, updated_at) VALUES (?, ?, ?, ?)');
      for (const it of items) ins.run(p.id, String(it.id), JSON.stringify(it), now);
      db.exec('COMMIT');
      log(`[programs] ${p.name}: ${items.length} open`);
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
      log(`[programs] ${p.name} live list failed: ${err.message}`);
    }
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_RES = [
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(?:of\\s+)?${MON}\\.?,?[\\s-]+(\\d{4})\\b`, 'gi'), f: (m) => [m[3], m[2], m[1]] },
  { re: new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'), f: (m) => [m[3], m[1], m[2]] },
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, f: (m) => [m[3], Number(m[2]), m[1]] }, // dd/mm/yyyy (Indian format)
];
const DEADLINE_WORDS = /(last date|deadline|apply by|apply before|closes? on|closing date|applications? close|till|until|due date|registration (ends|closes)|last day)/i;

function toDate([y, mon, d]) {
  const month = typeof mon === 'number' ? mon - 1 : MONTHS.indexOf(String(mon).slice(0, 3).toLowerCase());
  const date = new Date(Date.UTC(Number(y), month, Number(d)));
  return month >= 0 && month < 12 && date.getUTCDate() === Number(d) ? date : null;
}

/** Nearest future date that appears right after a deadline phrase, as YYYY-MM-DD, or null. */
export function extractDeadline(text = '', now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best = null;
  const lower = text;
  let m;
  const kw = new RegExp(DEADLINE_WORDS.source, 'gi');
  while ((m = kw.exec(lower)) !== null) {
    const windowText = lower.slice(m.index, m.index + 120);
    for (const { re, f } of DATE_RES) {
      re.lastIndex = 0;
      let d;
      while ((d = re.exec(windowText)) !== null) {
        const date = toDate(f(d));
        if (date && date.getTime() >= today && date.getTime() - today < 400 * 86400000 && (!best || date < best)) best = date;
      }
    }
  }
  return best ? best.toISOString().slice(0, 10) : null;
}

/** 'open' | 'closed' | null, from wording on the page. */
export function detectStatus(text = '') {
  if (/\b(applications?|registrations?|portal)\s+(are\s+|is\s+|has\s+been\s+|have\s+been\s+)?(now\s+)?closed\b|\bno longer accepting\b/i.test(text)) return 'closed';
  if (/\b(applications?|registrations?)\s+(are\s+|is\s+)?(now\s+)?(open|live|invited|started|begun)\b|\bapply now\b|\bregister now\b|\bapply online\b/i.test(text)) return 'open';
  return null;
}

// Only lines about applying are hashed, so rotating banners and footers don't count as changes.
const RELEVANT = /(intern|apply|application|registration|last date|deadline|eligib|batch|stipend|round|cycle|20\d\d|open|closed|notice|advertisement|schedule)/i;
export function relevantText(html) {
  return htmlToText(html)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.length < 400 && RELEVANT.test(l))
    .join('\n');
}

const upsert = db.prepare(`
  INSERT INTO programs_state (id, hash, checked_at, changed_at, deadline, status, error)
  VALUES (@id, @hash, @checked_at, @changed_at, @deadline, @status, @error)
  ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, checked_at = excluded.checked_at, changed_at = excluded.changed_at,
    deadline = excluded.deadline, status = excluded.status, error = excluded.error
`);

export async function checkPrograms({ force = false, log = console.log, onlyIds = null } = {}) {
  const all = loadPrograms().filter((p) => !onlyIds || onlyIds.includes(p.id));
  if (!onlyIds) await refreshLiveFeeds(all, log);
  const programs = all.filter((p) => p.watch);
  const state = Object.fromEntries(db.prepare('SELECT * FROM programs_state').all().map((s) => [s.id, s]));
  let checked = 0;
  await mapLimit(programs, 4, async (p) => {
    const prev = state[p.id];
    if (!force && prev?.checked_at && Date.now() - Date.parse(prev.checked_at) < CHECK_EVERY_HOURS * 3600000) return;
    const now = new Date().toISOString();
    try {
      const html = await getText(p.url, { timeoutMs: 20000, retries: 0 });
      const text = relevantText(html);
      const hash = sha1(text);
      upsert.run({
        id: p.id,
        hash,
        checked_at: now,
        changed_at: prev?.hash && prev.hash !== hash ? now : prev?.changed_at || null,
        deadline: extractDeadline(text),
        status: detectStatus(text),
        error: null,
      });
    } catch (err) {
      upsert.run({ ...(prev || { id: p.id, hash: null, changed_at: null, deadline: null, status: null }), id: p.id, checked_at: now, error: err.message.slice(0, 200) });
    }
    checked++;
  });
  if (checked) log(`[programs] checked ${checked} official pages`);
}

/** Programs with their latest state, plus careers pages discovery couldn't read. */
export function programsView() {
  const state = Object.fromEntries(db.prepare('SELECT * FROM programs_state').all().map((s) => [s.id, s]));
  const today = new Date().toISOString().slice(0, 10);
  const programs = loadPrograms().map((p) => {
    const s = state[p.id] || {};
    const items = p.live
      ? db
          .prepare('SELECT data FROM program_items WHERE program_id = ?')
          .all(p.id)
          .map((r) => JSON.parse(r.data))
          .filter((it) => !it.deadline || it.deadline >= today)
          .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
      : undefined;
    return {
      ...p,
      items,
      checkedAt: s.checked_at || null,
      changedAt: s.changed_at || null,
      deadline: s.deadline && s.deadline >= today ? s.deadline : null,
      status: s.status || null,
      error: s.error || null,
    };
  });
  const discovered = existsSync(DISCOVERED_PATH) ? JSON.parse(readFileSync(DISCOVERED_PATH, 'utf8')) : {};
  return { programs, checkDirectly: discovered._unreadable || [] };
}
