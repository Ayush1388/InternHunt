// The HTTP API. Served by `node src/index.js` locally and as one Vercel function in production (api/index.js).
import express from 'express';
import cors from 'cors';
import { q, one, ready, dbKind, getMeta, iso } from './db/index.js';
import { config, features, PUBLIC_URL, BRAND } from './config.js';
import { background } from './runtime.js';
import { listJobs, jobById, facets, STATUSES, REPORT_REASONS, signalOf } from './jobs.js';
import { matchJobs } from './match.js';
import { attachUser, requireUser, verifyGoogleIdToken, signInWithGoogle, signOut, saveProfile, cleanProfile, cleanList, settings, updateSettings, exportData, deleteUser, telegramLinkCode, unlinkTelegram } from './users.js';
import { findContacts, contactsFor } from './contacts.js';
import { createDraft, listDrafts, getDraft, editDraft, skipDraft, approveDraft, markReplied, processQueue, runFollowups } from './drafts/service.js';
import { refreshAll, isRefreshing, addFromLink } from './pipeline/refresh.js';
import { companyKey } from './lib/names.js';
import * as gmail from './gmail.js';
import { handleUpdate, runDigest } from './telegram/bot.js';
import { scanUser, scanAll } from './tracking.js';
import { webhookSecret, setupWebhook, botUsername } from './telegram/api.js';
import { CATEGORIES } from './lib/classify.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use('/api', async (req, res, next) => {
  try {
    await ready();
    next();
  } catch (err) {
    res.status(503).json({ error: `Database unavailable: ${err.message}` });
  }
});
app.use('/api', attachUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const cdn = (seconds = 60) => (req, res, next) => {
  res.set('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=600`);
  next();
};

/* ---------------- config and health */
app.get('/api/config', wrap(async (req, res) => {
  const f = features();
  res.json({ brand: BRAND, googleClientId: config.google.clientId || null, ...f, telegramBot: f.telegram ? await botUsername() : null });
}));
app.get('/api/auth/config', (req, res) => res.json({ googleClientId: config.google.clientId || null }));

app.get('/api/health', wrap(async (req, res) => {
  res.json({
    ok: true, db: await dbKind(), features: features(), refreshing: isRefreshing(),
    lastRefresh: await getMeta('last_refresh'), lastSummary: JSON.parse((await getMeta('last_summary')) || 'null'),
    jobs: (await one('SELECT COUNT(*)::int AS n FROM jobs WHERE is_active'))?.n ?? 0,
  });
}));

/* ---------------- accounts */
app.post('/api/auth/google', wrap(async (req, res) => {
  try {
    res.json(await signInWithGoogle(await verifyGoogleIdToken(req.body?.credential)));
  } catch (err) {
    res.status(401).json({ error: `Sign-in failed: ${err.message}` });
  }
}));
app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', wrap(async (req, res) => {
  await signOut(req.sessionToken);
  res.json({ ok: true });
}));

app.get('/api/me', requireUser, wrap(async (req, res) => res.json(await settings(req.user.id))));
app.patch('/api/me', requireUser, wrap(async (req, res) => res.json(await updateSettings(req.user.id, req.body || {}))));
app.get('/api/me/export', requireUser, wrap(async (req, res) => {
  res.set('Content-Disposition', `attachment; filename="${BRAND.toLowerCase()}-my-data.json"`);
  res.json(await exportData(req.user.id));
}));
app.delete('/api/me', requireUser, wrap(async (req, res) => res.json(await deleteUser(req.user.id))));

/* ---------------- profile (only what the browser extracted: skills, links, summary, proof points) */
app.get('/api/profile', requireUser, wrap(async (req, res) => {
  const u = await one('SELECT profile, embedded_at FROM users WHERE id = $1', [req.user.id]);
  const p = u?.profile || {};
  res.json({ profile: Object.keys(p).length ? p : null, updatedAt: iso(u?.embedded_at) });
}));
app.put('/api/profile', requireUser, wrap(async (req, res) => res.json({ ok: true, profile: await saveProfile(req.user.id, req.body?.profile) })));
app.delete('/api/profile', requireUser, wrap(async (req, res) => {
  await q("UPDATE users SET profile = '{}'::jsonb, embedding = NULL WHERE id = $1", [req.user.id]);
  res.json({ ok: true });
}));

/* ---------------- roles */
app.get('/api/jobs', wrap(async (req, res) => res.json(await listJobs(req.query, req.user?.id))));
app.get('/api/jobs/:id', wrap(async (req, res) => {
  const job = await jobById(req.params.id, req.user?.id);
  if (!job) return res.status(404).json({ error: 'Role not found' });
  res.json(job);
}));
app.get('/api/facets', cdn(60), wrap(async (req, res) => res.json(await facets(String(req.query.kind || 'all')))));

app.post('/api/match', wrap(async (req, res) => {
  const b = req.body || {};
  const profile = cleanProfile(b);
  let userVector = null;
  if (req.user) userVector = (await one('SELECT embedding::text AS v FROM users WHERE id = $1', [req.user.id]))?.v || null;
  const backed = ['any', 'yc', 'techstars'].includes(b.backed) ? b.backed : '';
  res.json(await matchJobs(profile, { backed, limit: Math.min(Math.max(Number(b.limit) || 40, 1), 100), userVector, uid: req.user?.id }));
}));

app.put('/api/jobs/:id/track', requireUser, wrap(async (req, res) => {
  const { status, notes = '' } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  if (!(await one('SELECT 1 FROM jobs WHERE id = $1', [req.params.id]))) return res.status(404).json({ error: 'Role not found' });
  await q(
    `INSERT INTO tracking (user_id, job_id, status, notes, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, job_id) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_at = now()`,
    [req.user.id, req.params.id, status, String(notes).slice(0, 2000)]
  );
  res.json({ ok: true });
}));
app.delete('/api/jobs/:id/track', requireUser, wrap(async (req, res) => {
  await q('DELETE FROM tracking WHERE user_id = $1 AND job_id = $2', [req.user.id, req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/jobs/:id/report', requireUser, wrap(async (req, res) => {
  const reason = req.body?.reason;
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: `reason must be one of ${REPORT_REASONS.join(', ')}` });
  const job = await one('SELECT id, company, company_key FROM jobs WHERE id = $1', [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Role not found' });
  await q('INSERT INTO reports (user_id, job_id, company_key, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [req.user.id, job.id, job.company_key, reason]);
  if (reason === 'scam' || reason === 'fake') await q('INSERT INTO blocked (user_id, company_key, company, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [req.user.id, job.company_key, job.company, reason]);
  if (reason === 'no_reply') {
    await q(
      `INSERT INTO tracking (user_id, job_id, status, updated_at) VALUES ($1, $2, 'no_reply', now())
       ON CONFLICT (user_id, job_id) DO UPDATE SET status = 'no_reply', updated_at = now()`,
      [req.user.id, job.id]
    );
  }
  res.json({ ok: true, blockedCompany: reason === 'scam' || reason === 'fake' ? job.company : null });
}));

app.get('/api/blocked', wrap(async (req, res) => {
  if (!req.user) return res.json([]);
  res.json(await q('SELECT company_key AS key, company, reason, created_at AS "createdAt" FROM blocked WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]));
}));
app.delete('/api/blocked/:key', requireUser, wrap(async (req, res) => {
  await q('DELETE FROM blocked WHERE user_id = $1 AND company_key = $2', [req.user.id, req.params.key]);
  await q("DELETE FROM reports WHERE user_id = $1 AND company_key = $2 AND reason IN ('scam','fake')", [req.user.id, req.params.key]);
  res.json({ ok: true });
}));

/* ---------------- companies, signals, founders */
const companyView = (c) => ({
  id: c.id, key: c.key, name: c.name, domain: c.domain, website: c.website, oneLiner: c.one_liner, description: c.description,
  industry: c.industry, teamSize: c.team_size, location: c.location, logo: c.logo_url, backed: c.backed ? c.backed.split(',') : [],
  ycBatch: c.yc_batch, ycUrl: c.yc_slug ? `https://www.ycombinator.com/companies/${c.yc_slug}` : null, linkedin: c.linkedin, twitter: c.twitter,
  contactsCheckedAt: iso(c.contacts_checked_at),
});

app.get('/api/companies/:key', wrap(async (req, res) => {
  const c = await one('SELECT * FROM companies WHERE key = $1', [companyKey(req.params.key) || req.params.key]);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  const signals = await q('SELECT * FROM signals WHERE company_id = $1 ORDER BY published_at DESC LIMIT 10', [c.id]);
  const roles = await listJobs({ companyKey: c.key, limit: 50 }, req.user?.id);
  res.json({
    company: companyView(c),
    signals: signals.map((s) => ({ kind: s.kind, title: s.title, summary: s.summary, amount: s.amount, round: s.round, url: s.url, source: s.source, date: iso(s.published_at) })),
    contacts: req.user ? await contactsFor(c.id) : null, // people's details only for signed-in users
    roles: roles.jobs,
  });
}));

const lookups = new Map(); // uid -> recent lookups, to keep founder lookups polite
app.post('/api/companies/:key/contacts', requireUser, wrap(async (req, res) => {
  const recent = (lookups.get(req.user.id) || []).filter((t) => Date.now() - t < 3600_000);
  if (recent.length >= 30) return res.status(429).json({ error: 'That’s a lot of lookups for one hour. Try again a little later.' });
  lookups.set(req.user.id, [...recent, Date.now()]);
  const c = await one('SELECT id FROM companies WHERE key = $1', [req.params.key]);
  if (!c) return res.status(404).json({ error: 'Company not found' });
  res.json(await findContacts(c.id, { verify: Boolean(req.body?.verify) }));
}));

// Startups with something worth writing about: funded, launched or new YC batch, newest first.
app.get('/api/fresh', cdn(300), wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 120);
  const rows = await q(
    `SELECT DISTINCT ON (c.id) c.*, s.kind AS sig_kind, s.title AS sig_title, s.amount AS sig_amount, s.round AS sig_round, s.url AS sig_url,
            s.source AS sig_source, s.published_at AS sig_at,
            (SELECT COUNT(*)::int FROM jobs j WHERE j.company_id = c.id AND j.is_active) AS roles
     FROM signals s JOIN companies c ON c.id = s.company_id
     WHERE s.published_at > now() - ($1 || ' days')::interval
     ORDER BY c.id, s.published_at DESC`,
    [String(days)]
  );
  rows.sort((a, b) => new Date(b.sig_at) - new Date(a.sig_at));
  res.json({ startups: rows.slice(0, Number(req.query.limit) || 24).map((r) => ({ ...companyView(r), roles: r.roles, signal: signalOf(r) })) });
}));

/* ---------------- drafts and sending */
app.get('/api/drafts', requireUser, wrap(async (req, res) => res.json(await listDrafts(req.user.id, { status: String(req.query.status || '') }))));
app.post('/api/drafts', requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  const company = b.companyKey ? await one('SELECT id FROM companies WHERE key = $1', [b.companyKey]) : null;
  res.json(await createDraft(req.user, { jobId: b.jobId || null, companyId: company?.id || null, contactId: b.contactId || null, regenerate: Boolean(b.regenerate) }));
}));
// Write emails for several selected roles at once (the "Write the emails" tray on For you).
app.post('/api/drafts/batch', requireUser, wrap(async (req, res) => {
  const ids = cleanList(req.body?.jobIds, 10, 200);
  const out = [];
  const errors = [];
  for (const id of ids) {
    try {
      out.push(await createDraft(req.user, { jobId: id }));
    } catch (err) {
      errors.push({ jobId: id, error: err.message });
    }
  }
  res.json({ drafts: out, errors });
}));
app.get('/api/drafts/:id', requireUser, wrap(async (req, res) => {
  const d = await getDraft(req.user.id, Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Draft not found' });
  res.json(d);
}));
app.patch('/api/drafts/:id', requireUser, wrap(async (req, res) => res.json(await editDraft(req.user.id, Number(req.params.id), req.body || {}))));
app.post('/api/drafts/:id/approve', requireUser, wrap(async (req, res) => {
  const mode = ['send', 'gmail_draft', 'self'].includes(req.body?.mode) ? req.body.mode : 'send';
  res.json(await approveDraft(req.user.id, Number(req.params.id), { mode }));
}));
app.post('/api/drafts/:id/skip', requireUser, wrap(async (req, res) => res.json(await skipDraft(req.user.id, Number(req.params.id)))));
app.post('/api/drafts/:id/replied', requireUser, wrap(async (req, res) => res.json(await markReplied(req.user.id, { draftId: Number(req.params.id) }))));

/* ---------------- pipeline (Found -> Drafted -> Sent -> Replied -> Interview) */
app.get('/api/pipeline', requireUser, wrap(async (req, res) => {
  const tracked = await listJobs({ tracked: 'any', limit: 100 }, req.user.id);
  const mail = Object.fromEntries(
    (await q('SELECT DISTINCT ON (job_id) job_id, subject, from_addr, status, at FROM mail_events WHERE user_id = $1 AND job_id IS NOT NULL ORDER BY job_id, at DESC', [req.user.id]))
      .map((r) => [r.job_id, { subject: r.subject, from: r.from_addr, status: r.status, at: iso(r.at) }])
  );
  tracked.jobs.forEach((j) => { j.mail = mail[j.id] || null; });
  const counts = Object.fromEntries((await q('SELECT status, COUNT(*)::int AS n FROM tracking WHERE user_id = $1 GROUP BY status', [req.user.id])).map((r) => [r.status, r.n]));
  const stats = await one(
    `SELECT (SELECT COUNT(*)::int FROM sends WHERE user_id = $1 AND status = 'sent' AND root_send_id IS NULL) AS sent,
            (SELECT COUNT(*)::int FROM sends WHERE user_id = $1 AND replied_at IS NOT NULL) AS replied,
            (SELECT COUNT(*)::int FROM drafts WHERE user_id = $1 AND status = 'draft') AS waiting`,
    [req.user.id]
  );
  res.json({ jobs: tracked.jobs, counts, stats });
}));

/* ---------------- Gmail */
app.get('/api/gmail/connect', requireUser, wrap(async (req, res) => {
  if (!gmail.gmailEnabled()) return res.status(400).json({ error: 'Gmail isn’t set up on this server yet (GOOGLE_CLIENT_SECRET).' });
  res.json({ url: await gmail.connectUrl(req.user) });
}));
app.get('/api/gmail/callback', wrap(async (req, res) => {
  const back = (qs) => res.redirect(`${PUBLIC_URL}/#/app/settings?${qs}`);
  if (req.query.error) return back(`gmail=error&reason=${encodeURIComponent(String(req.query.error))}`);
  try {
    await gmail.finishConnect({ code: String(req.query.code || ''), state: String(req.query.state || '') });
    back('gmail=connected');
  } catch (err) {
    back(`gmail=error&reason=${encodeURIComponent(err.message)}`);
  }
}));
app.post('/api/gmail/scan', requireUser, wrap(async (req, res) => res.json(await scanUser(req.user.id))));
app.delete('/api/gmail', requireUser, wrap(async (req, res) => {
  await gmail.disconnect(req.user.id);
  res.json({ ok: true });
}));

/* ---------------- Telegram */
app.post('/api/telegram/link', requireUser, wrap(async (req, res) => {
  const bot = await botUsername();
  if (!bot) return res.status(400).json({ error: 'The Telegram bot isn’t set up on this server yet.' });
  const code = await telegramLinkCode(req.user.id);
  res.json({ url: `https://t.me/${bot}?start=${code}`, code, bot });
}));
app.delete('/api/telegram/link', requireUser, wrap(async (req, res) => {
  await unlinkTelegram(req.user.id);
  res.json({ ok: true });
}));
app.post('/api/telegram/webhook', wrap(async (req, res) => {
  if (req.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret()) return res.status(401).end();
  // Answer Telegram right away; the work continues in the background.
  res.json({ ok: true });
  await background(handleUpdate(req.body || {}));
}));

/* ---------------- waitlist (Pro, recruiting directly) */
app.post('/api/waitlist', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const kind = ['pro', 'recruiting'].includes(req.body?.kind) ? req.body.kind : 'pro';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'That email doesn’t look right.' });
  await q('INSERT INTO waitlist (email, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING', [email, kind]);
  const n = (await one('SELECT COUNT(*)::int AS n FROM waitlist WHERE kind = $1', [kind])).n;
  res.json({ ok: true, position: n });
}));

/* ---------------- sources, adding a company, refresh */
app.get('/api/meta', wrap(async (req, res) => {
  const boards = await q("SELECT ats, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE ok)::int AS ok, COALESCE(SUM(kept), 0)::int AS kept FROM boards GROUP BY ats ORDER BY n DESC");
  const signals = await q("SELECT source, COUNT(*)::int AS n FROM signals WHERE published_at > now() - interval '30 days' GROUP BY source");
  const f = await facets('all');
  res.json({
    total: f.total, newToday: f.newToday, companies: f.companies, byKind: f.byKind, byCategory: f.byCategory, byLocation: f.byLocation, bySource: f.bySource,
    boards, signals, lastRefresh: await getMeta('last_refresh'), lastSummary: JSON.parse((await getMeta('last_summary')) || 'null'), refreshing: isRefreshing(),
  });
}));

app.post('/api/add', wrap(async (req, res) => {
  const r = await addFromLink(req.body?.url, String(req.body?.name || '').trim());
  res.status(r.ok ? 200 : 400).json(r);
}));

app.post('/api/refresh', wrap(async (req, res) => {
  if (isRefreshing()) return res.status(202).json({ started: false, message: 'Already refreshing' });
  const last = await getMeta('last_refresh');
  const min = last ? (Date.now() - Date.parse(last)) / 60000 : Infinity;
  if (min < 30) return res.status(429).json({ started: false, message: `Refreshed ${Math.floor(min)} min ago. Job boards get read again in ${Math.ceil(30 - min)} min.` });
  background(refreshAll({ steps: ['boards', 'embed'] }));
  res.status(202).json({ started: true });
}));

/* ---------------- cron (Vercel sends "Authorization: Bearer $CRON_SECRET") */
const cronOnly = (req, res, next) => {
  if (config.cronSecret && req.headers.authorization !== `Bearer ${config.cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
};
// Morning run (03:00 UTC = 08:30 IST): refresh, then everyone's Telegram digest.
app.get('/api/cron/daily', cronOnly, wrap(async (req, res) => {
  const refresh = await refreshAll();
  const digest = await runDigest();
  const queue = await processQueue({ budgetMs: 20_000 });
  res.json({ ok: true, refresh, digest, queue });
}));
// Afternoon run: follow-ups and any sends still queued.
app.get('/api/cron/followups', cronOnly, wrap(async (req, res) => {
  const followups = await runFollowups();
  const tracking = await scanAll();
  const queue = await processQueue({ budgetMs: 120_000 });
  res.json({ ok: true, followups, tracking, queue });
}));
app.post('/api/admin/telegram/setup', cronOnly, wrap(async (req, res) => {
  res.json(await setupWebhook(`${PUBLIC_URL}/api/telegram/webhook`));
}));
app.get('/api/admin/stats', cronOnly, wrap(async (req, res) => {
  const ev = await q("SELECT kind, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week FROM events GROUP BY kind");
  const users = await one("SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE last_seen_at > now() - interval '7 days')::int AS active FROM users");
  const waitlist = await q('SELECT kind, COUNT(*)::int AS n FROM waitlist GROUP BY kind');
  res.json({ users, events: ev, waitlist });
}));

app.get('/api/categories', (req, res) => res.json(CATEGORIES));

// Local development only (DEV_LOGIN=1, never on Vercel): sign in as a test user without Google.
if (process.env.DEV_LOGIN === '1' && !process.env.VERCEL) {
  app.post('/api/dev/login', wrap(async (req, res) => {
    const { randomId, sha256 } = await import('./lib/secrets.js');
    await q("INSERT INTO users (id, email, name) VALUES ('dev', 'dev@example.com', 'Riya Sharma') ON CONFLICT (id) DO NOTHING");
    const token = randomId(24);
    await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, 'dev', now() + interval '7 days')", [sha256(token)]);
    res.json({ token });
  }));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return console.error(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? `Server error: ${err.message}` : err.message, ...(err.code ? { code: err.code } : {}) });
});

export default app;
