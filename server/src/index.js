import './env.js';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, getMeta, companyKey } from './db.js';
import { refreshAll, isRefreshing } from './ingest.js';
import { SOURCES, TRUST } from './sources/index.js';
import { checkPrograms, programsView, removeUserProgram } from './programs.js';
import { addFromLink } from './addLink.js';
import { discoverDefault, discoveryAgeDays } from './discovery.js';
import { background, ON_VERCEL } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 5000);
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS || 6);
const MANUAL_REFRESH_COOLDOWN_MIN = 10;

const CATEGORIES = ['sde', 'web', 'data'];
const LEVELS = ['intern', 'entry', 'unspecified'];
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
  if (req.query.showClosed !== '1' && !tracked) where.push('j.is_active = 1');
  if (!tracked) where.push(HIDDEN_SQL);
  if (req.query.companyOnly === '1') where.push("j.trust = 'company'");
  inList('j.category', 'cat', csv(req.query.category, CATEGORIES));
  inList('j.level', 'lvl', csv(req.query.level, LEVELS));
  inList('j.loc_tag', 'loc', csv(req.query.loc, LOC_TAGS));
  inList('j.source', 'src', csv(req.query.source));
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
      : tracked
        ? 't.updated_at DESC'
        : 'COALESCE(j.posted_at, j.first_seen) DESC';
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

app.get('/api/jobs/:id', (req, res) => {
  const row = db
    .prepare(`SELECT j.*, t.status, t.notes, t.updated_at AS tracked_at, ${NO_REPLY_SQL} FROM jobs j LEFT JOIN tracking t ON t.job_id = j.id WHERE j.id = ?`)
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });
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
  res.status(500).json({ error: 'Something went wrong' });
});

// On Vercel the app is exported as a serverless function (api/index.js) instead of listening on a port.
// Its database lives in /tmp and starts empty on a cold start, so fetch jobs right away when it's empty.
if (ON_VERCEL) {
  if (!getMeta('last_refresh') && !isRefreshing()) background(runRefresh());
} else {
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
