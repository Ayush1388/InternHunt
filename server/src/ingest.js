import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, setMeta, transaction, companyKey } from './db.js';
import { SOURCES, TRUST, BOARD_TYPES } from './sources/index.js';
import { classify, experienceBucket, detectLanguages, extractMinYears } from './lib/classify.js';
import { extractDeadline } from './lib/dates.js';
import { trustCheck } from './lib/trust.js';
import { getJson, mapLimit, HttpError } from './lib/http.js';
import { norm, sha1 } from './lib/text.js';
import { WRITABLE_DIR, ON_VERCEL } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const COMPANIES_PATH = process.env.COMPANIES_PATH || path.join(here, 'config', 'companies.json');
export const DISCOVERED_PATH = process.env.DISCOVERED_PATH || path.join(WRITABLE_DIR || path.join(here, 'config'), 'discovered.json');

/** companies.json (hand-picked) merged with discovered.json (from `npm run discover`). */
export function loadCompanies() {
  const manual = JSON.parse(readFileSync(COMPANIES_PATH, 'utf8'));
  const found = existsSync(DISCOVERED_PATH) ? JSON.parse(readFileSync(DISCOVERED_PATH, 'utf8')) : {};
  const merged = {};
  for (const type of BOARD_TYPES) {
    const seen = new Set();
    merged[type] = [...(manual[type] || []), ...(found[type] || [])].filter((c) => {
      const id = `${c.token || c.host}:${c.site || ''}`.toLowerCase();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return merged;
}

export function dedupKey(company, title, locTag) {
  return sha1(`${norm(company)}|${norm(title)}|${locTag}`);
}

/**
 * Classify raw postings and keep only relevant, trustworthy ones
 * (tech role, intern/entry level, open to India, passes the scam / ghost-job checks).
 * Pass a `blocked` object to collect counts of what the trust checks removed, by reason.
 */
export function selectRelevant(rawJobs, { now = Date.now(), blocked = null } = {}) {
  const kept = [];
  for (const raw of rawJobs) {
    if (!raw.title || !raw.url || !raw.sourceJobId) continue;
    if (!/^https:\/\//i.test(raw.url)) continue; // never link out over plain http
    const c = classify(raw);
    if (!c) continue;
    const job = { ...raw, ...c };
    const trust = TRUST[raw.source] || 'board';
    const t = trustCheck(job, trust, now);
    if (t.drop) {
      if (blocked) blocked[t.drop] = (blocked[t.drop] || 0) + 1;
      continue;
    }
    kept.push({ ...job, trust, flags: t.flags });
  }
  return kept;
}

const upsert = db.prepare(`
  INSERT INTO jobs (id, dedup_key, source, target_key, company, title, description, url, locations, loc_tag, city,
                    category, level, min_years, employment_type, salary, tags, posted_at, first_seen, last_seen, is_active,
                    trust, flags, reposts, company_key, exp, languages, deadline, app_status, closed_at)
  VALUES (@id, @dedup_key, @source, @target_key, @company, @title, @description, @url, @locations, @loc_tag, @city,
          @category, @level, @min_years, @employment_type, @salary, @tags, @posted_at, @now, @now, @is_active,
          @trust, @flags, @reposts, @company_key, @exp, @languages, @deadline, @app_status, @closed_at)
  ON CONFLICT(id) DO UPDATE SET
    dedup_key = excluded.dedup_key, company = excluded.company, title = excluded.title,
    url = excluded.url, locations = excluded.locations,
    loc_tag = excluded.loc_tag, city = excluded.city, category = excluded.category, level = excluded.level,
    min_years = excluded.min_years, employment_type = excluded.employment_type, salary = excluded.salary,
    tags = excluded.tags, posted_at = COALESCE(excluded.posted_at, jobs.posted_at),
    last_seen = excluded.last_seen, is_active = excluded.is_active, trust = excluded.trust, flags = excluded.flags,
    reposts = excluded.reposts, company_key = excluded.company_key, exp = excluded.exp, languages = excluded.languages,
    deadline = COALESCE(excluded.deadline, jobs.deadline), app_status = excluded.app_status,
    description = CASE WHEN excluded.description = '' THEN jobs.description ELSE excluded.description END,
    closed_at = excluded.closed_at
`);
// Same company + title + location seen before under a different posting id that has since closed.
const countReposts = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE dedup_key = ? AND id != ? AND is_active = 0');
const findDuplicate = db.prepare(
  'SELECT id FROM jobs WHERE dedup_key = ? AND id != ? AND target_key != ? AND is_active = 1 LIMIT 1'
);
const closeMissing = db.prepare(
  'UPDATE jobs SET is_active = 0, closed_at = @now WHERE target_key = @key AND last_seen < @now AND is_active = 1'
);
const recordRun = db.prepare(`
  INSERT INTO source_runs (target_key, source, label, ok, error, fetched, kept, blocked, finished_at)
  VALUES (@target_key, @source, @label, @ok, @error, @fetched, @kept, @blocked, @finished_at)
  ON CONFLICT(target_key) DO UPDATE SET source = excluded.source, label = excluded.label, ok = excluded.ok,
    error = excluded.error, fetched = excluded.fetched, kept = excluded.kept, blocked = excluded.blocked,
    finished_at = excluded.finished_at
`);

/** Write one target's relevant jobs; jobs from that target not seen this run are marked closed. */
export function storeTargetJobs(target, jobs, { now = new Date().toISOString(), closeOthers = true } = {}) {
  let stored = 0;
  let duplicates = 0;
  transaction(() => {
    for (const j of jobs) {
      const id = `${j.source}:${j.sourceJobId}`;
      const key = dedupKey(j.company, j.title, j.locTag);
      if (findDuplicate.get(key, id, target.key)) {
        duplicates++;
        continue;
      }
      const reposts = countReposts.get(key, id).n;
      const flags = [...(j.flags || []), ...(reposts ? ['reposted'] : [])];
      upsert.run({
        id,
        dedup_key: key,
        source: j.source,
        target_key: target.key,
        company: j.company || target.label || 'Unknown',
        title: j.title,
        description: (j.description || '').slice(0, 15000),
        url: j.url,
        locations: [...new Set(j.locations || [])].join(' · '),
        loc_tag: j.locTag,
        city: j.city,
        category: j.category,
        level: j.level,
        min_years: j.minYears,
        employment_type: j.employmentType || null,
        salary: j.salary || null,
        tags: JSON.stringify((j.tags || []).slice(0, 12)),
        posted_at: j.postedAt,
        now,
        trust: j.trust || TRUST[j.source] || 'board',
        flags: JSON.stringify(flags),
        reposts,
        company_key: companyKey(j.company || target.label),
        exp: j.exp ?? 0,
        languages: JSON.stringify(j.languages || []),
        deadline: j.deadline || null,
        app_status: j.appStatus || null,
        is_active: j.isActive === false ? 0 : 1,
        closed_at: j.isActive === false ? j.closedAt || now : null,
      });
      stored++;
    }
    if (closeOthers) closeMissing.run({ key: target.key, now });
  });
  return { stored, duplicates };
}

// ---------- Descriptions some sources only give per posting ----------
const saveDetail = db.prepare(
  'UPDATE jobs SET description = @description, exp = @exp, languages = @languages, min_years = @min_years, deadline = COALESCE(deadline, @deadline) WHERE id = @id'
);

/** Fetch and store the description of a job whose source lists postings without one. Returns it ('' if unavailable). */
export async function fillDescription(row) {
  if (row.description) return row.description;
  const source = SOURCES.find((s) => s.id === row.source);
  if (!source?.detail) return '';
  const description = String((await source.detail(row)) || '').slice(0, 15000);
  if (!description) return '';
  const tags = JSON.parse(row.tags || '[]');
  saveDetail.run({
    id: row.id,
    description,
    exp: experienceBucket({ title: row.title, description }, row.level),
    languages: JSON.stringify(detectLanguages({ title: row.title, tags, description })),
    min_years: extractMinYears(description),
    deadline: extractDeadline(description),
  });
  return description;
}

/** After a refresh, fill in a batch of missing descriptions (newest first) so filters and cards have them. */
export async function enrichDescriptions({ limit = 60, log = console.log } = {}) {
  const ids = SOURCES.filter((s) => s.detail).map((s) => `'${s.id}'`).join(',');
  if (!ids) return 0;
  const rows = db
    .prepare(`SELECT * FROM jobs WHERE is_active = 1 AND (description IS NULL OR description = '') AND source IN (${ids})
              ORDER BY COALESCE(posted_at, first_seen) DESC LIMIT ?`)
    .all(limit);
  let filled = 0;
  await mapLimit(rows, 4, async (row) => {
    try {
      if (await fillDescription(row)) filled++;
    } catch {
      /* try again next refresh */
    }
  });
  if (rows.length) log(`[refresh] filled ${filled}/${rows.length} missing descriptions`);
  return filled;
}

let running = null;

export function isRefreshing() {
  return running !== null;
}

/** Fetch every configured source, classify, and store. Concurrent calls share one run. */
export function refreshAll({ log = console.log, force = false, onlyKeys = null } = {}) {
  if (running && !onlyKeys) return running; // a full refresh is already under way
  if (running) return running.then(() => refreshAll({ log, force, onlyKeys }));
  running = (async () => {
    const started = Date.now();
    const cfg = loadCompanies();
    const targets = SOURCES.flatMap((s) => s.targets(cfg).map((t) => ({ ...t, source: s }))).filter(
      (t) => !onlyKeys || onlyKeys.includes(t.key)
    );
    log(`[refresh] fetching ${targets.length} boards/feeds…`);

    const lastOk = Object.fromEntries(
      db.prepare('SELECT target_key, finished_at FROM source_runs WHERE ok = 1').all().map((r) => [r.target_key, r.finished_at])
    );
    const summary = { boards: targets.length, failed: 0, skipped: 0, deferred: 0, fetched: 0, kept: 0, stored: 0, duplicates: 0, blocked: {}, errors: [] };
    // A serverless function is stopped after vercel.json's maxDuration (300s): stop starting new
    // fetches in time, so what was fetched is saved and the summary gets written.
    const stopAt = ON_VERCEL ? started + 230 * 1000 : Infinity;

    const record = (t, fields) => {
      try {
        recordRun.run({ target_key: t.key, source: t.source.id, label: t.label, finished_at: new Date().toISOString(), ...fields });
      } catch (err) {
        summary.errors.push(`${t.label}: could not record run: ${err.message}`);
      }
    };

    // Each target is stored as soon as it arrives, so a run that gets cut off still keeps its data.
    const runTarget = async (t) => {
      // Respect each feed's polling limits (e.g. Jobicy: max once an hour).
      const minGap = (t.source.minIntervalMinutes || 0) * 60000;
      if (!force && minGap && lastOk[t.key] && Date.now() - Date.parse(lastOk[t.key]) < minGap) {
        summary.skipped++;
        return;
      }
      if (Date.now() > stopAt) {
        summary.deferred++;
        return;
      }
      let parsed;
      try {
        const raw = t.fetch ? await t.fetch() : await getJson(t.url);
        parsed = t.source.parse(raw, t);
      } catch (err) {
        const error = err instanceof HttpError && err.status === 404 ? 'Board not found (404) — check the token' : err.message;
        summary.failed++;
        record(t, { ok: 0, error, fetched: 0, kept: 0, blocked: 0 });
        log(`[refresh] ✗ ${t.label}: ${error}`);
        return;
      }
      try {
        const blocked = {};
        const relevant = selectRelevant(parsed, { blocked });
        for (const [k, v] of Object.entries(blocked)) summary.blocked[k] = (summary.blocked[k] || 0) + v;
        const blockedCount = Object.values(blocked).reduce((a, b) => a + b, 0);
        const { stored, duplicates } = storeTargetJobs(t, relevant, { now: new Date().toISOString() });
        summary.fetched += parsed.length;
        summary.kept += relevant.length;
        summary.stored += stored;
        summary.duplicates += duplicates;
        record(t, { ok: 1, error: null, fetched: parsed.length, kept: stored, blocked: blockedCount });
        log(`[refresh] ✓ ${t.label}: ${parsed.length} postings → ${stored} relevant${blockedCount ? `, ${blockedCount} blocked as untrustworthy` : ''}`);
      } catch (err) {
        summary.failed++;
        summary.errors.push(`${t.label}: saving failed: ${err.message}`);
        record(t, { ok: 0, error: `Saving failed: ${err.message}`, fetched: parsed.length, kept: 0, blocked: 0 });
        log(`[refresh] ✗ ${t.label}: saving failed`, err);
      }
    };

    // Company boards first, then job boards and HN, so a company's own posting wins when the
    // same job appears in both places.
    // Within each group, least recently fetched first, so boards a cut-off run didn't reach go first next time.
    const isCompany = (t) => TRUST[t.source.id] === 'company';
    const stalest = (list) => list.sort((a, b) => (lastOk[a.key] || '').localeCompare(lastOk[b.key] || ''));
    await mapLimit(stalest(targets.filter(isCompany)), 8, runTarget);
    await mapLimit(stalest(targets.filter((t) => !isCompany(t))), 8, runTarget);

    summary.seconds = Math.round((Date.now() - started) / 1000);
    summary.errors = summary.errors.slice(0, 10);
    // Only count it as a refresh if something actually came back (e.g. not when offline).
    if (!onlyKeys) {
      if (summary.failed < summary.boards - summary.skipped - summary.deferred) setMeta('last_refresh', new Date().toISOString());
      setMeta('last_summary', JSON.stringify(summary));
    }
    log(`[refresh] done in ${summary.seconds}s — ${summary.stored} relevant jobs from ${summary.fetched} postings`);
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}
