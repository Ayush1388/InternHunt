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
import { DISCOVERED_PATH, storeTargetJobs } from './ingest.js';
import { classifyCategory, detectLanguages } from './lib/classify.js';
import { extractDeadline } from './lib/dates.js';

export { extractDeadline };

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
  const { stored } = syncProgramListings();
  log(`[programs] ${stored} program listings`);
}

const DAY = 86400000;
const ymd = (d) => d.toISOString().slice(0, 10);
const startOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Each application window [startMonth, endMonth] as concrete date ranges around `year`. */
function windowRanges(windows, year) {
  const out = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const [a, b] of windows) {
      const start = new Date(Date.UTC(y, a - 1, 1));
      const end = new Date(Date.UTC(b < a ? y + 1 : y, b, 0)); // last day of month b
      out.push({ start, end });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * Whether a program is accepting applications, and until when.
 * status: 'open' | 'closed' | 'rolling' | 'unknown'. Dates the official page states win; otherwise the
 * program's usual window is used and `estimated` is true.
 */
export function programStatus(p, state = {}, now = new Date()) {
  const today = startOfDay(now);
  const t = ymd(today);
  const out = { status: 'unknown', deadline: null, estimated: false, opensOn: null, endedOn: null };
  if (state.deadline && state.deadline >= t) return { ...out, status: 'open', deadline: state.deadline };

  let usual = null;
  if (p.monthlyDays) {
    const [from, to] = p.monthlyDays;
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const day = today.getUTCDate();
    if (day >= from && day <= to) usual = { status: 'open', deadline: ymd(new Date(Date.UTC(y, m, to))) };
    else if (day < from) usual = { status: 'closed', opensOn: ymd(new Date(Date.UTC(y, m, from))), endedOn: ymd(new Date(Date.UTC(y, m - 1, to))) };
    else usual = { status: 'closed', opensOn: ymd(new Date(Date.UTC(y, m + 1, from))), endedOn: ymd(new Date(Date.UTC(y, m, to))) };
  } else if (p.windows?.length) {
    const ranges = windowRanges(p.windows, today.getUTCFullYear());
    const cur = ranges.find((r) => r.start <= today && today <= r.end);
    const prev = ranges.filter((r) => r.end < today).pop();
    const next = ranges.find((r) => r.start > today);
    usual = cur
      ? { status: 'open', deadline: ymd(cur.end) }
      : { status: 'closed', endedOn: prev ? ymd(prev.end) : null, opensOn: next ? ymd(next.start) : null };
  }

  if (state.status === 'closed') return { ...out, status: 'closed', opensOn: usual?.status === 'closed' ? usual.opensOn : null, endedOn: usual?.endedOn || null };
  if (usual?.status === 'open' && state.status !== 'open') return { ...out, ...usual, estimated: true };
  if (state.status === 'open') return { ...out, status: 'open', deadline: usual?.status === 'open' ? usual.deadline : null, estimated: usual?.status === 'open' };
  if (p.rolling) return { ...out, status: 'rolling' };
  if (usual) return { ...out, ...usual, estimated: true };
  return out;
}

const CATEGORY_LABEL = {
  company_program: 'Company program', fresher_drive: 'Fresher hiring drive', open_source: 'Open-source program',
  research: 'Research internship', added: 'Program you added',
};

function programText(p, st) {
  const lines = [p.window, '', 'About', `${CATEGORY_LABEL[p.category] || 'Program'} run by ${p.org}.`];
  if (st.status === 'closed' && st.opensOn) {
    const next = new Date(`${st.opensOn}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    lines.push(`Applications are closed now; the next round usually opens in ${next}.`);
  }
  if (p.eligibility) lines.push('', 'Eligibility', p.eligibility);
  if (p.stipend) lines.push('', 'Stipend / pay', p.stipend);
  if (p.note) lines.push('', 'Good to know', p.note);
  if (st.estimated) lines.push('', 'Dates shown are the usual application window. Check the official page for this year\'s exact dates.');
  return lines.join('\n');
}

/**
 * Non-government programs are internships or jobs too, so they're stored as listings (source 'program')
 * that the same filters, deadlines and tracker apply to. LFX projects open right now are listed one by one.
 */
export function syncProgramListings(now = new Date()) {
  const state = Object.fromEntries(db.prepare('SELECT * FROM programs_state').all().map((s) => [s.id, s]));
  const t = ymd(startOfDay(now));
  const jobs = [];
  for (const p of loadPrograms()) {
    if (p.category === 'government') continue;
    const st = programStatus(p, state[p.id], now);
    const remote = p.category === 'open_source';
    jobs.push({
      source: 'program',
      sourceJobId: p.id,
      company: p.org,
      title: p.name,
      description: programText(p, st),
      url: p.url,
      locations: [remote ? 'Remote' : 'India'],
      locTag: remote ? 'remote_worldwide' : 'india_onsite',
      city: null,
      category: p.role || 'software',
      level: p.kind || 'intern',
      exp: 0,
      languages: [],
      minYears: null,
      deadline: st.deadline,
      employmentType: CATEGORY_LABEL[p.category] || 'Program',
      salary: p.stipend && p.stipend !== '—' ? p.stipend : null,
      tags: [CATEGORY_LABEL[p.category] || 'Program'],
      postedAt: null,
      trust: 'company',
      flags: st.estimated && st.deadline ? ['deadline_estimated'] : [],
      appStatus: st.status,
      isActive: st.status !== 'closed',
      closedAt: st.endedOn,
    });
    if (p.live) {
      const items = db.prepare('SELECT data FROM program_items WHERE program_id = ?').all(p.id).map((r) => JSON.parse(r.data));
      for (const it of items) {
        if (it.deadline && it.deadline < t) continue;
        const skills = it.skills || [];
        jobs.push({
          source: 'program',
          sourceJobId: `${p.id}:${it.id}`,
          company: it.org || p.org,
          title: `${it.title} (${p.name})`,
          description: [`${p.name} project${it.org ? ` with ${it.org}` : ''}. Paid, remote mentorship.`, '',
            'Skills needed', skills.join(', ') || 'See the project page', '', 'When', p.window].join('\n'),
          url: it.url,
          locations: ['Remote'],
          locTag: 'remote_worldwide',
          city: null,
          category: classifyCategory(it.title, skills) || 'software',
          level: 'intern',
          exp: 0,
          languages: detectLanguages({ title: it.title, tags: skills }),
          minYears: null,
          deadline: it.deadline || null,
          employmentType: 'Open-source mentorship',
          salary: p.stipend && p.stipend !== '—' ? p.stipend : null,
          tags: skills.slice(0, 6),
          postedAt: null,
          trust: 'company',
          flags: [],
          appStatus: 'open',
        });
      }
    }
  }
  return storeTargetJobs({ key: 'programs', label: 'Programs' }, jobs, { now: now.toISOString() });
}

/** Government programs with whether they're accepting applications now. Open ones first. */
export function governmentView(now = new Date()) {
  const state = Object.fromEntries(db.prepare('SELECT * FROM programs_state').all().map((s) => [s.id, s]));
  const order = { open: 0, rolling: 1, unknown: 2, closed: 3 };
  return loadPrograms()
    .filter((p) => p.category === 'government')
    .map((p) => {
      const s = state[p.id] || {};
      return { ...p, ...programStatus(p, s, now), checkedAt: s.checked_at || null, changedAt: s.changed_at || null, error: s.error || null };
    })
    .sort((a, b) => order[a.status] - order[b.status] || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
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
