// Listing roles: the shared WHERE builder, the row -> API shape, and the facet counts.
import { q, params, iso } from './db/index.js';
import { CATEGORIES, LANGUAGES } from './lib/classify.js';
import { companyKey } from './lib/names.js';

export const LEVELS = ['intern', 'job'];
export const EXPS = ['0', '1', '3', '5'];
export const LOC_TAGS = ['india_onsite', 'remote_india', 'remote_worldwide', 'remote_region', 'abroad_onsite'];
export const BACKED = ['yc', 'techstars'];
export const STATUSES = ['saved', 'drafted', 'applied', 'replied', 'interview', 'offer', 'rejected', 'no_reply'];
export const REPORT_REASONS = ['scam', 'fake', 'no_reply', 'expired'];
const SOURCES = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'smartrecruiters', 'yc'];

export const csv = (v, allowed) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && (!allowed || allowed.includes(s)));

/** Columns every job list returns: the job, the company, its latest signal and the person's tracking row. */
export const SELECT_JOB = (uid) => `
  SELECT j.*, t.status, t.notes, t.updated_at AS tracked_at,
         c.one_liner, c.logo_url, c.domain, c.website, c.team_size,
         sig.kind AS sig_kind, sig.title AS sig_title, sig.amount AS sig_amount, sig.round AS sig_round,
         sig.url AS sig_url, sig.source AS sig_source, sig.published_at AS sig_at,
         (SELECT COUNT(DISTINCT r.job_id)::int FROM reports r WHERE r.company_key = j.company_key AND r.reason = 'no_reply') AS company_no_reply
  FROM jobs j
  LEFT JOIN companies c ON c.id = j.company_id
  LEFT JOIN LATERAL (
    SELECT * FROM signals s WHERE s.company_id = j.company_id AND s.published_at > now() - interval '120 days'
    ORDER BY s.published_at DESC LIMIT 1
  ) sig ON true
  LEFT JOIN tracking t ON t.job_id = j.id AND t.user_id = ${uid}`;

export function signalOf(r) {
  if (!r.sig_kind) return null;
  return { kind: r.sig_kind, title: r.sig_title, amount: r.sig_amount || '', round: r.sig_round || '', url: r.sig_url, source: r.sig_source, date: iso(r.sig_at) };
}

export function toJob(r, full = false) {
  return {
    id: r.id,
    company: r.company,
    companyKey: r.company_key,
    companyId: r.company_id,
    oneLiner: r.one_liner || '',
    logo: r.logo_url || '',
    domain: r.domain || '',
    teamSize: r.team_size || null,
    title: r.title,
    url: r.url,
    locations: r.locations,
    locTag: r.loc_tag,
    city: r.city,
    category: r.category,
    level: r.level,
    minYears: r.min_years,
    exp: r.exp ?? 0,
    languages: r.languages || [],
    deadline: r.deadline ? iso(r.deadline).slice(0, 10) : null,
    closedAt: iso(r.closed_at),
    backed: r.backed ? r.backed.split(',') : [],
    ycBatch: r.yc_batch || '',
    employmentType: r.employment_type,
    salary: r.salary,
    tags: r.tags || [],
    postedAt: iso(r.posted_at),
    firstSeen: iso(r.first_seen),
    source: r.source,
    isActive: Boolean(r.is_active),
    status: r.status || null,
    notes: r.notes || '',
    trackedAt: iso(r.tracked_at),
    trust: r.trust || 'company',
    flags: r.flags || [],
    reposts: r.reposts || 0,
    companyNoReply: r.company_no_reply || 0,
    signal: signalOf(r),
    ...(full ? { description: r.description } : { snippet: (r.description || '').slice(0, 260) }),
  };
}

/** WHERE clause and ORDER BY for a job list request. `p` collects the parameters. */
export function jobWhere(query, uid, p = params()) {
  const where = [];
  const u = p(uid ?? null);
  const inList = (col, list, cast = '') => {
    if (list.length) where.push(`${col} IN (${list.map((v) => p(v) + cast).join(',')})`);
  };
  const tracked = String(query.tracked || '');
  if (!tracked) {
    where.push(`j.company_key NOT IN (SELECT company_key FROM blocked WHERE user_id = ${u})`);
    where.push(`j.id NOT IN (SELECT job_id FROM reports WHERE user_id = ${u} AND reason IN ('scam','fake','expired'))`);
    const d = String(query.deadline || '');
    if (d === 'ended') where.push('(NOT j.is_active OR j.deadline < CURRENT_DATE)');
    else if (query.showClosed !== '1') where.push('j.is_active AND (j.deadline IS NULL OR j.deadline >= CURRENT_DATE)');
    if (d === 'week') where.push("j.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7");
    if (d === 'month') where.push("j.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 30");
    if (d === 'has') where.push('j.deadline IS NOT NULL');
  }
  if (query.company) where.push(`j.company_key = ${p(companyKey(query.company))}`);
  if (query.companyKey) where.push(`j.company_key = ${p(String(query.companyKey))}`);
  inList('j.level', csv(query.kind || query.level, LEVELS));
  inList('j.category', csv(query.category, CATEGORIES));
  inList('j.exp', csv(query.exp, EXPS).map(Number), '::int');
  inList('j.loc_tag', csv(query.loc, LOC_TAGS));
  inList('j.source', csv(query.source, SOURCES));
  const langs = csv(query.lang, LANGUAGES);
  if (langs.length) where.push(`(${langs.map((l) => `j.languages ? ${p(l)}`).join(' OR ')})`);
  if (query.city) where.push(`j.city = ${p(String(query.city))}`);
  const backed = String(query.backed || '');
  if (backed === 'any') where.push("j.backed <> ''");
  else if (BACKED.includes(backed)) where.push(`j.backed LIKE ${p(`%${backed}%`)}`);
  if (query.signal === 'funded') where.push("EXISTS (SELECT 1 FROM signals s WHERE s.company_id = j.company_id AND s.kind = 'funding' AND s.published_at > now() - interval '90 days')");
  if (query.signal === 'new') where.push("j.first_seen > now() - interval '3 days'");
  if (tracked === 'any') where.push('t.status IS NOT NULL');
  else if (STATUSES.includes(tracked)) where.push(`t.status = ${p(tracked)}`);
  if (query.hideApplied === '1') where.push("(t.status IS NULL OR t.status IN ('saved'))");
  if (query.q) {
    for (const w of String(query.q).trim().split(/\s+/).slice(0, 6)) {
      const k = p(`%${w.replace(/[%_\\]/g, '')}%`);
      where.push(`(j.title ILIKE ${k} OR j.company ILIKE ${k} OR j.tags::text ILIKE ${k} OR j.locations ILIKE ${k} OR j.description ILIKE ${k})`);
    }
  }
  const sort = String(query.sort || '');
  const order =
    sort === 'company' ? 'lower(j.company) ASC, j.title ASC'
      : sort === 'deadline' ? 'j.deadline ASC NULLS LAST, COALESCE(j.posted_at, j.first_seen) DESC'
        : query.deadline === 'ended' ? 'COALESCE(j.deadline::timestamptz, j.closed_at) DESC'
          : tracked ? 't.updated_at DESC'
            : 'COALESCE(j.posted_at, j.first_seen) DESC, j.id';
  const groupOrder =
    sort === 'company' ? 'lower(MAX(j.company)) ASC'
      : sort === 'deadline' ? 'MIN(j.deadline) ASC NULLS LAST, MAX(COALESCE(j.posted_at, j.first_seen)) DESC'
        : 'MAX(COALESCE(j.posted_at, j.first_seen)) DESC';
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', order, groupOrder, p, u };
}

const FROM = (u) => `FROM jobs j LEFT JOIN tracking t ON t.job_id = j.id AND t.user_id = ${u}`;

export async function listJobs(query, uid) {
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const { where, order, groupOrder, p, u } = jobWhere(query, uid);
  const total = (await q(`SELECT COUNT(*)::int AS n ${FROM(u)} ${where}`, p.values))[0].n;

  if (query.group === 'company') {
    const totalGroups = (await q(`SELECT COUNT(DISTINCT j.company_key)::int AS n ${FROM(u)} ${where}`, p.values))[0].n;
    const lim = p(limit);
    const off = p((page - 1) * limit);
    const groups = await q(
      `SELECT j.company_key, MAX(j.company) AS company, COUNT(*)::int AS n ${FROM(u)} ${where}
       GROUP BY j.company_key ORDER BY ${groupOrder} LIMIT ${lim} OFFSET ${off}`,
      p.values
    );
    let rows = [];
    if (groups.length) {
      const g = jobWhere(query, uid);
      const keys = groups.map((x) => g.p(x.company_key)).join(',');
      rows = await q(
        `SELECT * FROM (
           SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.company_key ORDER BY COALESCE(x.posted_at, x.first_seen) DESC, x.id) AS rn
           FROM (${SELECT_JOB(g.u)} ${g.where ? `${g.where} AND` : 'WHERE'} j.company_key IN (${keys})) x
         ) y WHERE rn <= 3`,
        g.p.values
      );
    }
    const byKey = {};
    for (const r of rows) (byKey[r.company_key] ||= []).push(toJob(r));
    return {
      total, totalGroups, page, limit,
      groups: groups.map((x) => ({ companyKey: x.company_key, company: x.company, count: x.n, jobs: byKey[x.company_key] || [] })),
    };
  }

  const lim = p(limit);
  const off = p((page - 1) * limit);
  const rows = await q(`${SELECT_JOB(u)} ${where} ORDER BY ${order} LIMIT ${lim} OFFSET ${off}`, p.values);
  return { total, page, limit, jobs: rows.map((r) => toJob(r)) };
}

export async function jobById(id, uid) {
  const p = params();
  const u = p(uid ?? null);
  const rows = await q(`${SELECT_JOB(u)} WHERE j.id = ${p(id)}`, p.values);
  return rows[0] ? toJob(rows[0], true) : null;
}

/** Counts for the filter controls, over everything open. Shared by everyone (cached by the CDN). */
export async function facets(kind = 'all') {
  const k = LEVELS.includes(kind) ? kind : 'all';
  const open = `FROM jobs j WHERE j.is_active AND (j.deadline IS NULL OR j.deadline >= CURRENT_DATE) AND ($1 = 'all' OR j.level = $1)`;
  const count = async (col) => Object.fromEntries((await q(`SELECT ${col} AS k, COUNT(*)::int AS n ${open} GROUP BY ${col}`, [k])).map((r) => [r.k, r.n]));
  const n = async (extra) => (await q(`SELECT COUNT(*)::int AS n ${open} ${extra}`, [k]))[0].n;
  const byLanguage = Object.fromEntries((await q(`SELECT l AS k, COUNT(*)::int AS n ${open.replace('FROM jobs j', 'FROM jobs j, jsonb_array_elements_text(j.languages) l')} GROUP BY l`, [k])).map((r) => [r.k, r.n]));
  return {
    total: await n(''),
    byKind: await count('j.level'),
    yc: await n("AND j.backed LIKE '%yc%'"),
    techstars: await n("AND j.backed LIKE '%techstars%'"),
    funded: await n("AND EXISTS (SELECT 1 FROM signals s WHERE s.company_id = j.company_id AND s.kind = 'funding' AND s.published_at > now() - interval '90 days')"),
    newToday: await n("AND j.first_seen > now() - interval '1 day'"),
    byCategory: await count('j.category'),
    byExp: await count('j.exp'),
    byLocation: await count('j.loc_tag'),
    byLanguage,
    bySource: await count('j.source'),
    cities: await q(`SELECT j.city, COUNT(*)::int AS n ${open} AND j.city IS NOT NULL GROUP BY j.city ORDER BY n DESC LIMIT 15`, [k]),
    companies: (await q(`SELECT COUNT(DISTINCT j.company_key)::int AS n ${open}`, [k]))[0].n,
    closingThisWeek: await n('AND j.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7'),
    withDeadline: await n('AND j.deadline IS NOT NULL'),
  };
}
