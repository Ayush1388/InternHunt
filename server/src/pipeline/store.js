// Writing what the sources found: companies, their signals, and their open roles.
import { q, one, tx } from '../db/index.js';
import { backedFor } from '../lib/backed.js';
import { classify } from '../lib/classify.js';
import { trustCheck } from '../lib/trust.js';
import { companyKey, domainOf } from '../lib/names.js';
import { norm, sha1 } from '../lib/text.js';

/**
 * Create or update a company. Non-empty new values win; empty ones never wipe what we had.
 * @returns {Promise<{id:number, key:string}>}
 */
export async function upsertCompany(c, run = q) {
  const key = companyKey(c.name);
  if (!key) throw new Error('Company has no name');
  const fromList = backedFor(c.name);
  const backed = [...new Set([...(c.backed ? String(c.backed).split(',') : []), ...(fromList.backed ? fromList.backed.split(',') : []), ...(c.ycBatch ? ['yc'] : [])])]
    .filter(Boolean)
    .sort()
    .join(',');
  const website = c.website || null;
  const rows = await run(
    `INSERT INTO companies (key, name, domain, website, one_liner, description, industry, team_size, location, logo_url,
                            backed, yc_batch, yc_slug, linkedin, twitter, hiring)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (key) DO UPDATE SET
       name = companies.name,
       domain = COALESCE(NULLIF(excluded.domain, ''), companies.domain),
       website = COALESCE(NULLIF(excluded.website, ''), companies.website),
       one_liner = COALESCE(NULLIF(excluded.one_liner, ''), companies.one_liner),
       description = COALESCE(NULLIF(excluded.description, ''), companies.description),
       industry = COALESCE(NULLIF(excluded.industry, ''), companies.industry),
       team_size = COALESCE(excluded.team_size, companies.team_size),
       location = COALESCE(NULLIF(excluded.location, ''), companies.location),
       logo_url = COALESCE(NULLIF(excluded.logo_url, ''), companies.logo_url),
       backed = CASE WHEN excluded.backed = '' THEN companies.backed ELSE excluded.backed END,
       yc_batch = COALESCE(excluded.yc_batch, companies.yc_batch),
       yc_slug = COALESCE(companies.yc_slug, excluded.yc_slug),
       linkedin = COALESCE(NULLIF(excluded.linkedin, ''), companies.linkedin),
       twitter = COALESCE(NULLIF(excluded.twitter, ''), companies.twitter),
       hiring = companies.hiring OR excluded.hiring,
       updated_at = now()
     RETURNING id, key`,
    [
      key, String(c.name).trim().slice(0, 120), domainOf(website || c.domain) || null, website, c.oneLiner || null,
      c.description ? String(c.description).slice(0, 2000) : null, c.industry || null, c.teamSize || null, c.location || null,
      c.logo || null, backed, c.ycBatch || fromList.ycBatch || null, c.ycSlug || null, c.linkedin || null, c.twitter || null,
      Boolean(c.hiring),
    ]
  );
  return rows[0];
}

export async function addSignal(companyId, s, run = q) {
  await run(
    `INSERT INTO signals (company_id, kind, title, summary, amount, round, url, source, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (company_id, url) DO NOTHING`,
    [companyId, s.kind, s.title.slice(0, 300), s.summary ? s.summary.slice(0, 600) : null, s.amount || null, s.round || null, s.url, s.source, s.publishedAt]
  );
}

const TRUST_OF = () => 'company'; // every source we read now is the company's own hiring system

export const dedupKey = (company, title, locTag) => sha1(`${norm(company)}|${norm(title)}|${locTag}`);

/**
 * Classify raw postings and keep the relevant, trustworthy ones (tech role, not a people-manager role,
 * no scam / agency / ghost-job signs). `blocked` collects counts of what was dropped, by reason.
 */
export function selectRelevant(raw, { source, company = '', now = Date.now(), blocked = null } = {}) {
  const kept = [];
  for (const item of raw) {
    const r = item.company || !company ? item : { ...item, company };
    if (!r.title || !r.url || !r.externalId) continue;
    if (!/^https:\/\//i.test(r.url)) continue;
    const c = classify(r);
    if (!c) continue;
    const job = { ...r, ...c, source };
    const t = trustCheck(job, TRUST_OF(source), now);
    if (t.drop) {
      if (blocked) blocked[t.drop] = (blocked[t.drop] || 0) + 1;
      continue;
    }
    kept.push({ ...job, trust: TRUST_OF(source), flags: t.flags });
  }
  return kept;
}

/**
 * Store one board's relevant jobs. New ids get first_seen = now (that's how the digest knows what's new);
 * jobs from this board that weren't in this fetch are closed.
 */
export async function storeBoardJobs(board, company, jobs, { now = new Date(), closeOthers = true } = {}) {
  let stored = 0;
  let duplicates = 0;
  let fresh = 0;
  await tx(async (run) => {
    for (const j of jobs) {
      const id = `${board.ats}:${j.externalId}`;
      const dk = dedupKey(company.name, j.title, j.locTag);
      const dup = await run('SELECT 1 FROM jobs WHERE dedup_key = $1 AND id <> $2 AND board_key IS DISTINCT FROM $3 AND is_active LIMIT 1', [dk, id, board.key]);
      if (dup.length) {
        duplicates++;
        continue;
      }
      const reposts = (await run('SELECT COUNT(*)::int AS n FROM jobs WHERE dedup_key = $1 AND id <> $2 AND NOT is_active', [dk, id]))[0].n;
      const flags = [...(j.flags || []), ...(reposts ? ['reposted'] : [])];
      const res = await run(
        `INSERT INTO jobs (id, source, board_key, company_id, company, company_key, title, url, description, locations, loc_tag, city,
                           category, level, exp, min_years, languages, tags, flags, employment_type, salary, deadline, trust,
                           backed, yc_batch, dedup_key, reposts, posted_at, first_seen, last_seen, is_active, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$29,true,NULL)
         ON CONFLICT (id) DO UPDATE SET
           company_id = excluded.company_id, company = excluded.company, company_key = excluded.company_key, title = excluded.title,
           url = excluded.url, locations = excluded.locations, loc_tag = excluded.loc_tag, city = excluded.city,
           category = excluded.category, level = excluded.level, exp = excluded.exp, min_years = excluded.min_years,
           languages = excluded.languages, tags = excluded.tags, flags = excluded.flags, employment_type = excluded.employment_type,
           salary = excluded.salary, deadline = COALESCE(excluded.deadline, jobs.deadline), trust = excluded.trust,
           backed = excluded.backed, yc_batch = excluded.yc_batch, dedup_key = excluded.dedup_key, reposts = excluded.reposts,
           posted_at = COALESCE(excluded.posted_at, jobs.posted_at), last_seen = excluded.last_seen, is_active = true, closed_at = NULL,
           description = CASE WHEN excluded.description = '' THEN jobs.description ELSE excluded.description END,
           embedding = CASE WHEN jobs.title = excluded.title THEN jobs.embedding END
         RETURNING (xmax = 0) AS inserted`,
        [
          id, board.ats, board.key, company.id, company.name, company.key, j.title.trim().slice(0, 200), j.url,
          (j.description || '').slice(0, 15000), [...new Set(j.locations || [])].join(' · ').slice(0, 400), j.locTag, j.city,
          j.category, j.level, j.exp ?? 0, j.minYears, JSON.stringify(j.languages || []), JSON.stringify((j.tags || []).slice(0, 12)),
          JSON.stringify(flags), j.employmentType || null, j.salary || null, j.deadline || null, j.trust, company.backed || '',
          company.yc_batch || null, dk, reposts, j.postedAt, now,
        ]
      );
      if (res[0]?.inserted) fresh++;
      stored++;
    }
    if (closeOthers) await run('UPDATE jobs SET is_active = false, closed_at = $2 WHERE board_key = $1 AND last_seen < $2 AND is_active', [board.key, now]);
  });
  return { stored, duplicates, fresh };
}

export async function recordBoardRun(key, r) {
  await q('UPDATE boards SET ok = $2, error = $3, fetched = $4, kept = $5, blocked = $6, last_run = now() WHERE key = $1', [
    key, r.ok, r.error ? String(r.error).slice(0, 300) : null, r.fetched ?? 0, r.kept ?? 0, r.blocked ?? 0,
  ]);
}

export async function addBoard({ ats, token, label, how = 'manual', companyId = null }) {
  const key = `${ats}:${String(token).toLowerCase()}`;
  await q(
    `INSERT INTO boards (key, ats, token, label, how, company_id) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET company_id = COALESCE(excluded.company_id, boards.company_id)`,
    [key, ats, token, label, how, companyId]
  );
  return key;
}

export const companyById = (id) => one('SELECT * FROM companies WHERE id = $1', [id]);
