// The daily run: funding news -> YC hiring companies -> job boards -> board discovery -> embeddings.
// Everything is bounded by a time budget so it fits in one serverless call; whatever doesn't fit
// is picked up first next time (boards are read oldest-first).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, getMeta, setMeta } from '../db/index.js';
import { config } from '../config.js';
import { mapLimit } from '../lib/http.js';
import { companyKey } from '../lib/names.js';
import { fetchBoard, ATS } from '../sources/ats.js';
import { ycHiring, ycCompanyPage, ycJobToPosting, batchRank } from '../sources/yc.js';
import { fundingNews } from '../sources/funding.js';
import { upsertCompany, addSignal, selectRelevant, storeBoardJobs, recordBoardRun, addBoard, companyById } from './store.js';
import { findBoard, websiteFromArticle } from './discover.js';
import { saveFounders } from '../contacts.js';
import { embedPendingJobs } from '../embed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(path.join(here, '..', 'config', f), 'utf8'));

let running = null;
export const isRefreshing = () => running !== null;

/** Hand-picked boards and the startup list, written once (and again whenever the files change). */
export async function seedOnce() {
  const rev = 'seed-2';
  if ((await getMeta('seed_rev')) === rev) return;
  const boards = readJson('boards.json');
  for (const ats of Object.keys(ATS)) {
    for (const b of boards[ats] || []) {
      const c = await upsertCompany({ name: b.name, website: b.website || '' });
      await addBoard({ ats, token: b.token, label: b.name, how: 'manual', companyId: c.id });
    }
  }
  const STARTUP_GROUPS = /fintech|consumer|edtech|saas|^ai|healthtech|mobility|gaming|quant|semiconductors/i;
  for (const c of readJson('seed-companies.json').companies || []) {
    if (!STARTUP_GROUPS.test(c.group || '')) continue;
    await upsertCompany({ name: c.name, website: c.domain ? `https://${c.domain}` : '', industry: c.group });
  }
  await setMeta('seed_rev', rev);
}

async function fundingStep(log) {
  const { items, errors } = await fundingNews();
  let added = 0;
  for (const it of items) {
    const c = await upsertCompany({ name: it.company });
    const before = (await q('SELECT COUNT(*)::int AS n FROM signals WHERE company_id = $1', [c.id]))[0].n;
    await addSignal(c.id, {
      kind: 'funding', title: it.title, summary: it.summary, amount: it.amount, round: it.round, url: it.url, source: it.source, publishedAt: it.publishedAt,
    });
    const after = (await q('SELECT COUNT(*)::int AS n FROM signals WHERE company_id = $1', [c.id]))[0].n;
    if (after > before) added++;
    // News only gives a name: the article usually links the company's site, which we need for contacts.
    const row = await companyById(c.id);
    if (!row.domain) {
      const site = await websiteFromArticle(it.url, it.company);
      if (site) await upsertCompany({ name: row.name, website: site });
    }
  }
  log(`[refresh] funding: ${items.length} raises in the feeds, ${added} new${errors.length ? `; ${errors.join('; ')}` : ''}`);
  return { raises: items.length, newRaises: added, errors };
}

async function ycStep(log, deadline) {
  const list = await ycHiring();
  const minRank = new Date().getFullYear() - 3; // recent batches: the startups most likely to answer a cold email
  const recent = list.filter((c) => batchRank(c.batch) >= minRank);
  for (const c of recent) {
    const row = await upsertCompany({
      name: c.name, website: c.website, oneLiner: c.oneLiner, description: c.description, industry: c.industry, teamSize: c.teamSize,
      location: c.location, logo: c.logo, ycBatch: c.batch, ycSlug: c.slug, hiring: true,
    });
    await addBoard({ ats: 'yc', token: c.slug, label: c.name, how: 'yc', companyId: row.id });
  }
  // Read the YC pages that have waited longest: founders, open roles, launches.
  const due = await q("SELECT b.*, c.name AS cname FROM boards b JOIN companies c ON c.id = b.company_id WHERE b.ats = 'yc' ORDER BY b.last_run NULLS FIRST LIMIT $1", [config.refresh.ycPagesPerRun]);
  let roles = 0;
  await mapLimit(due, 6, async (b) => {
    if (Date.now() > deadline) return;
    try {
      const page = await ycCompanyPage(b.token);
      const company = await companyById(b.company_id);
      if (page.website && !company.domain) await upsertCompany({ name: company.name, website: page.website, linkedin: page.linkedin, twitter: page.twitter });
      const fresh = await companyById(b.company_id);
      await saveFounders(fresh, page.founders, page.url);
      for (const l of page.launches) {
        const d = l.date ? new Date(l.date) : null;
        if (d && !Number.isNaN(d.getTime()) && Date.now() - d.getTime() < 180 * 86400000) {
          await addSignal(fresh.id, { kind: 'launch', title: l.title, summary: l.tagline, url: l.url || page.url, source: 'yc', publishedAt: d.toISOString() });
        }
      }
      const blocked = {};
      const jobs = selectRelevant(page.jobs.map((j) => ycJobToPosting(j, fresh.name)), { source: 'yc', blocked });
      const r = await storeBoardJobs(b, fresh, jobs);
      roles += r.stored;
      await recordBoardRun(b.key, { ok: true, fetched: page.jobs.length, kept: r.stored, blocked: Object.values(blocked).reduce((a, n) => a + n, 0) });
    } catch (err) {
      await recordBoardRun(b.key, { ok: false, error: err.message });
    }
  });
  log(`[refresh] yc: ${recent.length} hiring companies from recent batches, read ${due.length} pages, ${roles} roles`);
  return { companies: recent.length, pages: due.length, roles };
}

async function boardsStep(log, deadline) {
  const due = await q(
    "SELECT b.*, c.id AS cid FROM boards b LEFT JOIN companies c ON c.id = b.company_id WHERE b.ats <> 'yc' ORDER BY b.last_run NULLS FIRST LIMIT $1",
    [config.refresh.boardsPerRun]
  );
  let stored = 0;
  let fresh = 0;
  let read = 0;
  await mapLimit(due, 8, async (b) => {
    if (Date.now() > deadline) return;
    read++;
    try {
      let company = b.cid ? await companyById(b.cid) : null;
      if (!company) {
        const c = await upsertCompany({ name: b.label });
        await q('UPDATE boards SET company_id = $2 WHERE key = $1', [b.key, c.id]);
        company = await companyById(c.id);
      }
      const raw = await fetchBoard(b.ats, b.token, company.name);
      const blocked = {};
      const jobs = selectRelevant(raw, { source: b.ats, company: company.name, blocked });
      const r = await storeBoardJobs(b, company, jobs);
      if (raw.length) await q('UPDATE companies SET hiring = true WHERE id = $1', [company.id]);
      stored += r.stored;
      fresh += r.fresh;
      await recordBoardRun(b.key, { ok: true, fetched: raw.length, kept: r.stored, blocked: Object.values(blocked).reduce((a, n) => a + n, 0) });
    } catch (err) {
      await recordBoardRun(b.key, { ok: false, error: err.message });
    }
  });
  log(`[refresh] boards: read ${read}/${due.length}, ${stored} relevant roles, ${fresh} new`);
  return { boards: read, roles: stored, newRoles: fresh };
}

/** Look for job boards of companies that don't have one yet: recently funded first, then YC, then the startup list. */
async function discoverStep(log, deadline) {
  const todo = await q(
    `SELECT c.* FROM companies c
     LEFT JOIN discovery d ON d.company_key = c.key
     WHERE NOT EXISTS (SELECT 1 FROM boards b WHERE b.company_id = c.id AND b.ats <> 'yc')
       AND (d.checked_at IS NULL OR d.checked_at < now() - interval '30 days')
     ORDER BY (SELECT MAX(published_at) FROM signals s WHERE s.company_id = c.id) DESC NULLS LAST,
              (c.yc_slug IS NOT NULL) DESC, c.created_at
     LIMIT $1`,
    [config.refresh.discoverPerRun]
  );
  let found = 0;
  await mapLimit(todo, 6, async (c) => {
    if (Date.now() > deadline) return;
    let result = 'none';
    try {
      const b = await findBoard({ name: c.name, domain: c.domain || '', slug: c.yc_slug || '' });
      if (b) {
        await addBoard({ ats: b.ats, token: b.token, label: c.name, how: b.how, companyId: c.id });
        result = `${b.ats}:${b.token}`;
        found++;
      }
    } catch (err) {
      result = `error: ${err.message}`.slice(0, 200);
    }
    await q(
      'INSERT INTO discovery (company_key, checked_at, result) VALUES ($1, now(), $2) ON CONFLICT (company_key) DO UPDATE SET checked_at = now(), result = excluded.result',
      [c.key, result]
    );
  });
  log(`[refresh] discovery: checked ${todo.length} companies, found ${found} boards`);
  return { checked: todo.length, found };
}

/** One full run. Steps are independent: one failing doesn't stop the rest. */
export function refreshAll({ log = console.log, steps = ['funding', 'yc', 'boards', 'discover', 'embed'] } = {}) {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const deadline = started + config.refresh.budgetMs;
    const summary = { startedAt: new Date(started).toISOString() };
    await seedOnce();
    const run = async (name, fn) => {
      if (!steps.includes(name)) return;
      try {
        summary[name] = await fn();
      } catch (err) {
        summary[name] = { error: err.message };
        log(`[refresh] ${name} failed: ${err.message}`);
      }
    };
    await run('funding', () => fundingStep(log));
    await run('yc', () => ycStep(log, deadline - 60_000));
    await run('boards', () => boardsStep(log, deadline - 30_000));
    await run('discover', () => discoverStep(log, deadline - 10_000));
    await run('embed', () => embedPendingJobs({ limit: config.refresh.embedPerRun, log }));
    // Roles not seen for three weeks on boards we've stopped reaching are closed too.
    await q("UPDATE jobs SET is_active = false, closed_at = now() WHERE is_active AND last_seen < now() - interval '21 days'");
    summary.seconds = Math.round((Date.now() - started) / 1000);
    await setMeta('last_refresh', new Date().toISOString());
    await setMeta('last_summary', JSON.stringify(summary));
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** A careers link someone pasted: detect its board and read it now. */
export async function addFromLink(url, name = '') {
  const { detectAts } = await import('../lib/detectAts.js');
  let board = detectAts(String(url || ''));
  let label = name;
  if (!board) {
    const { domainOf } = await import('../lib/names.js');
    const domain = domainOf(url);
    if (!domain) return { ok: false, error: 'That doesn’t look like a web address.' };
    label = label || domain.split('.')[0].replace(/^./, (c) => c.toUpperCase());
    const found = await findBoard({ name: label, domain });
    if (!found) return { ok: false, error: 'Couldn’t find a job board we can read on that page. Try the link to their job list.' };
    board = { type: found.ats, token: found.token };
  }
  if (!ATS[board.type]) return { ok: false, error: 'We can’t read that kind of job board yet.' };
  label = label || board.token.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const c = await upsertCompany({ name: label });
  const key = await addBoard({ ats: board.type, token: board.token, label, how: 'link', companyId: c.id });
  const b = (await q('SELECT * FROM boards WHERE key = $1', [key]))[0];
  const raw = await fetchBoard(b.ats, b.token, label);
  const jobs = selectRelevant(raw, { source: b.ats, company: label });
  const r = await storeBoardJobs(b, await companyById(c.id), jobs);
  await recordBoardRun(key, { ok: true, fetched: raw.length, kept: r.stored });
  return { ok: true, kind: 'company', company: label, companyKey: companyKey(label), board: key, fetched: raw.length, kept: r.stored };
}
