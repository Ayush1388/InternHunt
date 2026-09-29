import './env.js';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getMeta, setMeta, companyKey, syncDb, dbInfo } from './db.js';
import { refreshAll, isRefreshing, fillDescription, enrichDescriptions } from './ingest.js';
import { SOURCES, TRUST } from './sources/index.js';
import { checkPrograms, programsView, removeUserProgram, governmentView, syncProgramListings } from './programs.js';
import { CATEGORIES, LANGUAGES } from './lib/classify.js';
import { addFromLink } from './addLink.js';
import { discoverDefault, discoveryAgeDays } from './discovery.js';
import { background, ON_VERCEL } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 5000);
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS || 6);
const MANUAL_REFRESH_COOLDOWN_MIN = 10;

const LEVELS = ['intern', 'job'];
const EXPS = ['0', '1', '3', '5'];
const LOC_TAGS = ['india_onsite', 'remote_india', 'remote_worldwide'];
const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected', 'no_reply'];
const REPORT_REASONS = ['scam', 'fake', 'no_reply', 'expired'];
// Jobs hidden from browsing: companies you blocked, and jobs you reported as scam/fake/expired.
const HIDDEN_SQL = `j.company_key NOT IN (SELECT company_key FROM blocked_companies)
  AND j.id NOT IN (SELECT job_id FROM job_reports WHERE reason IN ('scam','fake','expired'))`;
const NO_REPLY_SQL = `(SELECT COUNT(DISTINCT job_id) FROM job_reports r WHERE r.company_key = j.company_key AND r.reason = 'no_reply') AS company_no_reply`;

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => {
  syncDb();
  next();
});

// Counts and the government list change only when data is refreshed, so let Vercel's CDN serve
// them for a minute (and a stale copy while it re-fetches) instead of recomputing every page load.
const cdnCache = (req, res, next) => {
  res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  next();
};

const csv = (v, allowed) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && (!allowed || allowed.includes(s)));

function toJob(r, full = false) {
  return {
    id: r.id,
    company: r.company,
    title: r.title,
    url: r.url,
    locations: r.locations,
    locTag: r.loc_tag,
    city: r.city,
    category: r.category,
    level: r.level,
    minYears: r.min_years,
    exp: r.exp ?? 0,
    languages: JSON.parse(r.languages || '[]'),
    deadline: r.deadline || null,
    closedAt: r.closed_at || null,
    appStatus: r.app_status || null,
    isProgram: r.source === 'program',
    employmentType: r.employment_type,
    salary: r.salary,
    tags: JSON.parse(r.tags || '[]'),
    postedAt: r.posted_at,
    firstSeen: r.first_seen,
    source: r.source,
    isActive: Boolean(r.is_active),
    status: r.status || null,
    notes: r.notes || '',
    trackedAt: r.tracked_at || null,
    trust: r.trust || TRUST[r.source] || 'board',
    flags: JSON.parse(r.flags || '[]'),
    reposts: r.reposts || 0,
    companyNoReply: r.company_no_reply || 0,
    ...(full ? { description: r.description } : { snippet: (r.description || '').slice(0, 260) }),
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ...dbInfo(), lastRefresh: getMeta('last_refresh'), refreshing: isRefreshing() });
});

app.get('/api/jobs', (req, res) => {
  const where = [];
  const params = {};
  const add = (sql, values) => {
    where.push(sql);
    Object.assign(params, values);
  };
  const inList = (col, name, list) => {
    if (!list.length) return;
    const keys = list.map((v, i) => `${name}${i}`);
    add(`${col} IN (${keys.map((k) => '@' + k).join(',')})`, Object.fromEntries(keys.map((k, i) => [k, list[i]])));
  };

  const tracked = String(req.query.tracked || '');
  const today = new Date().toISOString().slice(0, 10);
  if (!tracked) {
    where.push(HIDDEN_SQL);
    const d = String(req.query.deadline || '');
    if (d === 'ended') add('(j.is_active = 0 OR j.deadline < @today)', { today });
    else if (req.query.showClosed !== '1') add('j.is_active = 1 AND (j.deadline IS NULL OR j.deadline >= @today)', { today });
    if (d === 'week') add("j.deadline BETWEEN @today AND date(@today, '+7 days')", { today });
    if (d === 'month') add("j.deadline BETWEEN @today AND date(@today, '+30 days')", { today });
    if (d === 'has') where.push('j.deadline IS NOT NULL');
  }
  if (req.query.companyOnly === '1') where.push("j.trust = 'company'");
  if (req.query.type === 'programs') where.push("j.source = 'program'");
  if (req.query.type === 'roles') where.push("j.source != 'program'");
  inList('j.level', 'lvl', csv(req.query.kind || req.query.level, LEVELS));
  inList('j.category', 'cat', csv(req.query.category, CATEGORIES));
  inList('j.exp', 'exp', csv(req.query.exp, EXPS).map(Number));
  inList('j.loc_tag', 'loc', csv(req.query.loc, LOC_TAGS));
  inList('j.source', 'src', csv(req.query.source));
  const langs = csv(req.query.lang, LANGUAGES);
  if (langs.length) {
    const keys = langs.map((_, i) => `lang${i}`);
    add(`(${keys.map((k) => `j.languages LIKE @${k}`).join(' OR ')})`, Object.fromEntries(keys.map((k, i) => [k, `%"${langs[i]}"%`])));
  }
  if (req.query.city) add('j.city = @city', { city: String(req.query.city) });
  if (tracked === 'any') where.push('t.status IS NOT NULL');
  else if (STATUSES.includes(tracked)) add('t.status = @tracked', { tracked });
  if (req.query.hideApplied === '1') where.push("(t.status IS NULL OR t.status = 'saved')");
  if (req.query.q) {
    const words = String(req.query.q).trim().split(/\s+/).slice(0, 6);
    words.forEach((w, i) =>
      add(`(j.title LIKE @q${i} OR j.company LIKE @q${i} OR j.tags LIKE @q${i} OR j.locations LIKE @q${i} OR j.description LIKE @q${i})`, {
        [`q${i}`]: `%${w.replace(/[%_]/g, '')}%`,
      })
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order =
    req.query.sort === 'company'
      ? 'j.company COLLATE NOCASE ASC, j.title ASC'
      : req.query.sort === 'deadline'
        ? "CASE WHEN j.deadline IS NULL THEN 1 ELSE 0 END, j.deadline ASC, COALESCE(j.posted_at, j.first_seen) DESC"
        : req.query.deadline === 'ended'
          ? 'COALESCE(j.deadline, j.closed_at) DESC'
          : tracked
            ? 't.updated_at DESC'
            : // Newest company postings first; programs (no posting date) after them, soonest last date first.
              "CASE WHEN j.source = 'program' THEN 1 ELSE 0 END, CASE WHEN j.source = 'program' THEN COALESCE(j.deadline, '9999') END ASC, COALESCE(j.posted_at, j.first_seen) DESC";
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const from = 'FROM jobs j LEFT JOIN tracking t ON t.job_id = j.id';
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${whereSql}`).get(params).n;
  const rows = db
    .prepare(
      `SELECT j.*, t.status, t.notes, t.updated_at AS tracked_at, ${NO_REPLY_SQL} ${from} ${whereSql} ORDER BY ${order} LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset: (page - 1) * limit });

  res.json({ total, page, limit, jobs: rows.map((r) => toJob(r)) });
});

const jobById = (id) =>
  db
    .prepare(`SELECT j.*, t.status, t.notes, t.updated_at AS tracked_at, ${NO_REPLY_SQL} FROM jobs j LEFT JOIN tracking t ON t.job_id = j.id WHERE j.id = ?`)
    .get(id);

app.get('/api/jobs/:id', async (req, res) => {
  let row = jobById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  // Some sources list jobs without descriptions: fetch this one now (bounded so the page never hangs).
  if (!row.description) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(''), 8000));
    const got = await Promise.race([fillDescription(row).catch(() => ''), timeout]);
    if (got) row = jobById(req.params.id);
  }
  res.json(toJob(row, true));
});

app.put('/api/jobs/:id/track', (req, res) => {
  const { status, notes = '' } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  if (!db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Job not found' });
  db.prepare(
    `INSERT INTO tracking (job_id, status, notes, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_at = excluded.updated_at`
  ).run(req.params.id, status, String(notes).slice(0, 2000), new Date().toISOString());
  res.json({ ok: true });
});

// Report a job. scam/fake → the whole company is blocked; no_reply → marked on your tracker and
// shown as a warning on that company's other jobs; expired → hidden.
app.post('/api/jobs/:id/report', (req, res) => {
  const reason = req.body?.reason;
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: `reason must be one of ${REPORT_REASONS.join(', ')}` });
  const job = db.prepare('SELECT id, company FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const now = new Date().toISOString();
  const key = companyKey(job.company);
  db.prepare('INSERT OR IGNORE INTO job_reports (job_id, company_key, reason, created_at) VALUES (?, ?, ?, ?)').run(job.id, key, reason, now);
  if (reason === 'scam' || reason === 'fake') {
    db.prepare('INSERT OR IGNORE INTO blocked_companies (company_key, company, reason, created_at) VALUES (?, ?, ?, ?)').run(key, job.company, reason, now);
  }
  if (reason === 'no_reply') {
    db.prepare(
      `INSERT INTO tracking (job_id, status, notes, updated_at) VALUES (?, 'no_reply', '', ?)
       ON CONFLICT(job_id) DO UPDATE SET status = 'no_reply', updated_at = excluded.updated_at`
    ).run(job.id, now);
  }
  res.json({ ok: true, blockedCompany: reason === 'scam' || reason === 'fake' ? job.company : null });
});

app.get('/api/blocked', (req, res) => {
  res.json(db.prepare('SELECT company_key AS key, company, reason, created_at AS createdAt FROM blocked_companies ORDER BY created_at DESC').all());
});

app.delete('/api/blocked/:key', (req, res) => {
  db.prepare('DELETE FROM blocked_companies WHERE company_key = ?').run(req.params.key);
  db.prepare("DELETE FROM job_reports WHERE company_key = ? AND reason IN ('scam','fake')").run(req.params.key);
  res.json({ ok: true });
});

app.delete('/api/jobs/:id/track', (req, res) => {
  db.prepare('DELETE FROM tracking WHERE job_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Counts for the filter panel of one tab (internships or jobs), over what's currently open.
app.get('/api/facets', cdnCache, (req, res) => {
  const kind = LEVELS.includes(req.query.kind) ? req.query.kind : 'intern';
  const today = new Date().toISOString().slice(0, 10);
  const base = `FROM jobs j WHERE j.level = @kind AND ${HIDDEN_SQL}`;
  const open = `${base} AND j.is_active = 1 AND (j.deadline IS NULL OR j.deadline >= @today)`;
  const p = { kind, today };
  const count = (col) =>
    Object.fromEntries(db.prepare(`SELECT ${col} AS k, COUNT(*) AS n ${open} GROUP BY ${col}`).all(p).map((r) => [r.k, r.n]));
  const byLanguage = {};
  for (const r of db.prepare(`SELECT j.languages ${open} AND j.languages != '[]'`).all(p)) {
    for (const l of JSON.parse(r.languages)) byLanguage[l] = (byLanguage[l] || 0) + 1;
  }
  const n = (sql, extra = {}) => db.prepare(`SELECT COUNT(*) AS n ${sql}`).get({ ...p, ...extra }).n;
  res.json({
    total: n(open),
    programs: n(`${open} AND j.source = 'program'`),
    newToday: n(`${open} AND j.first_seen >= datetime('now', '-1 day')`),
    byCategory: count('category'),
    byExp: count('exp'),
    byLocation: count('loc_tag'),
    byLanguage,
    cities: db.prepare(`SELECT city, COUNT(*) AS n ${open} AND city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 15`).all(p),
    closingThisWeek: n(`${open} AND j.deadline BETWEEN @today AND date(@today, '+7 days')`),
    closingThisMonth: n(`${open} AND j.deadline BETWEEN @today AND date(@today, '+30 days')`),
    withDeadline: n(`${open} AND j.deadline IS NOT NULL`),
    ended: n(`${base} AND (j.is_active = 0 OR j.deadline < @today)`),
  });
});

app.get('/api/government', cdnCache, (req, res) => {
  res.json({ programs: governmentView() });
});

app.get('/api/meta', (req, res) => {
  const count = (col) =>
    Object.fromEntries(
      db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM jobs j WHERE j.is_active = 1 AND ${HIDDEN_SQL} GROUP BY ${col}`).all().map((r) => [r.k, r.n])
    );
  const cities = db
    .prepare(
      `SELECT city, COUNT(*) AS n FROM jobs j WHERE j.is_active = 1 AND ${HIDDEN_SQL} AND city IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 15`
    )
    .all();
  const trackedCounts = Object.fromEntries(
    db.prepare('SELECT status AS k, COUNT(*) AS n FROM tracking GROUP BY status').all().map((r) => [r.k, r.n])
  );
  const runs = db.prepare('SELECT * FROM source_runs ORDER BY ok ASC, source, label').all();
  res.json({
    total: db.prepare(`SELECT COUNT(*) AS n FROM jobs j WHERE j.is_active = 1 AND ${HIDDEN_SQL}`).get().n,
    newToday: db
      .prepare(`SELECT COUNT(*) AS n FROM jobs j WHERE j.is_active = 1 AND ${HIDDEN_SQL} AND j.first_seen >= datetime('now', '-1 day')`)
      .get().n,
    byKind: count('level'),
    byCategory: count('category'),
    byTrust: count('trust'),
    blockedCompanies: db.prepare('SELECT COUNT(*) AS n FROM blocked_companies').get().n,
    byLevel: count('level'),
    byLocation: count('loc_tag'),
    bySource: count('source'),
    cities,
    trackedCounts,
    lastRefresh: getMeta('last_refresh'),
    lastSummary: JSON.parse(getMeta('last_summary') || 'null'),
    refreshing: isRefreshing(),
    refreshHours: REFRESH_HOURS,
    sources: runs.map((r) => ({
      key: r.target_key, source: r.source, label: r.label, ok: Boolean(r.ok), error: r.error,
      fetched: r.fetched, kept: r.kept, blocked: r.blocked || 0, finishedAt: r.finished_at, trust: TRUST[r.source] || 'board',
    })),
    attributions: SOURCES.filter((s) => s.attribution).map((s) => s.attribution),
  });
});

app.get('/api/programs', (req, res) => {
  res.json(programsView());
});

app.post('/api/programs/check', (req, res) => {
  background(checkPrograms({ force: true }).catch((err) => console.error('[programs] failed', err)));
  res.status(202).json({ started: true });
});

app.post('/api/add', async (req, res, next) => {
  try {
    const result = await addFromLink(req.body?.url, String(req.body?.name || '').trim());
    if (result.ok && result.kind === 'company' && result.targetKey) {
      background(refreshAll({ onlyKeys: [result.targetKey], force: true }).catch((err) => console.error('[add] refresh failed', err)));
    }
    if (result.ok && result.kind === 'program') {
      background(checkPrograms({ force: true, onlyIds: [result.id] }).catch(() => {}));
    }
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/programs/:id', (req, res) => {
  if (!req.params.id.startsWith('user-')) return res.status(400).json({ error: 'Only programs you added can be removed' });
  removeUserProgram(req.params.id);
  res.json({ ok: true });
});

app.get('/api/discovery', (req, res) => {
  res.json({ running: discovering, ageDays: Number.isFinite(discoveryAgeDays()) ? Math.round(discoveryAgeDays()) : null });
});

app.post('/api/refresh', (req, res) => {
  if (isRefreshing()) return res.status(202).json({ started: false, message: 'A refresh is already running' });
  const last = getMeta('last_refresh');
  const minutesAgo = last ? (Date.now() - Date.parse(last)) / 60000 : Infinity;
  if (minutesAgo < MANUAL_REFRESH_COOLDOWN_MIN) {
    return res.status(429).json({
      started: false,
      message: `Refreshed ${Math.floor(minutesAgo)} min ago. Wait ${Math.ceil(MANUAL_REFRESH_COOLDOWN_MIN - minutesAgo)} min so job boards aren't hammered.`,
    });
  }
  background(runRefresh());
  res.status(202).json({ started: true });
});

const runRefresh = () =>
  refreshAll()
    .then(() => checkPrograms())
    .then(() => enrichDescriptions())
    .catch((err) => console.error('[refresh] failed', err));

// Vercel Cron: GET /api/cron/refresh (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET" when set.
app.get('/api/cron/refresh', async (req, res) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  await runRefresh();
  res.json({ ok: true, lastRefresh: getMeta('last_refresh') });
});

// Serve the built React app in production.
const clientDist = path.join(here, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: `Server error: ${err.message}` });
});

// On Vercel, data is refreshed by the cron in vercel.json and the Refresh button, never as a side
// effect of a visitor's request: a refresh scrapes every source and would stall the pages being served.

// Programs are listings too; make sure they exist before the first refresh has run.
if (!db.prepare("SELECT 1 FROM jobs WHERE source = 'program' LIMIT 1").get()) {
  try {
    syncProgramListings();
  } catch (err) {
    console.error('[programs] could not list programs', err.message);
  }
}

// On Vercel the app is exported as a serverless function (api/index.js) instead of listening on a port.
if (!ON_VERCEL) {
  app.listen(PORT, () => {
    console.log(`InternHunt API on http://localhost:${PORT}`);
    scheduleRefreshes();
  });
}

export default app;

// Weekly: re-scan the built-in company list + YC companies for job boards, then refresh.
let discovering = false;
async function autoDiscover() {
  if (process.env.AUTO_DISCOVER === '0' || discovering || discoveryAgeDays() < 7) return;
  discovering = true;
  try {
    const r = await discoverDefault();
    if (r?.added) await refreshAll();
  } catch (err) {
    console.error('[discover] failed', err.message);
  } finally {
    discovering = false;
  }
}

function scheduleRefreshes() {
  if (process.env.DISABLE_AUTO_REFRESH !== '1') {
    setTimeout(autoDiscover, 60 * 1000); // give the first refresh a head start
    setInterval(autoDiscover, 24 * 3600000);
  }
  if (process.env.DISABLE_AUTO_REFRESH === '1') return;
  const everyMs = REFRESH_HOURS * 3600000;
  const last = getMeta('last_refresh');
  const dueIn = last ? Math.max(0, Date.parse(last) + everyMs - Date.now()) : 0;
  setTimeout(() => {
    runRefresh();
    setInterval(runRefresh, everyMs);
  }, dueIn);
  console.log(`Auto-refresh every ${REFRESH_HOURS}h (next in ${Math.round(dueIn / 60000)} min)`);
}
