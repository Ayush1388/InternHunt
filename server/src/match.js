// "Curated for you": hard filters in SQL first, then rank by meaning (pgvector, when AI is on) and by
// the skills a role actually mentions. Every match comes with one plain "why this fits" line.
import { q, params } from './db/index.js';
import { SELECT_JOB, jobWhere, toJob } from './jobs.js';
import { skillRe } from './lib/skills.js';

const ROLE_NAMES = {
  frontend: 'Frontend', backend: 'Backend', fullstack: 'Full-stack', mobile: 'Mobile', data: 'Data', ml: 'ML / AI',
  devops: 'DevOps', qa: 'QA', security: 'Security', design: 'Design', software: 'Software',
};

// "WHERE a" + [b, c] -> "WHERE a AND b AND c"
const andWhere = (where, extra) => {
  const body = [where.replace(/^WHERE /, ''), ...extra].filter(Boolean).join(' AND ');
  return body ? `WHERE ${body}` : '';
};
const daysAgo = (d) => Math.max(0, Math.round((Date.now() - Date.parse(d)) / 86400000));
const when = (d) => {
  const n = daysAgo(d);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
};
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const pretty = (s) => ({ typescript: 'TypeScript', javascript: 'JavaScript', 'node.js': 'Node.js', 'next.js': 'Next.js', 'c++': 'C++', 'c#': 'C#', sql: 'SQL', aws: 'AWS', gcp: 'GCP', css: 'CSS', html: 'HTML', 'ui/ux': 'UI/UX', llm: 'LLMs', nlp: 'NLP', ios: 'iOS', graphql: 'GraphQL', postgresql: 'PostgreSQL', mongodb: 'MongoDB', 'ci/cd': 'CI/CD' })[s] || s.replace(/\b\w/g, (c) => c.toUpperCase());

/** The one-line reason, built only from facts we have (no model, nothing invented). */
export function whyLine({ skills = [], role = null, signal = null, semantic = false }) {
  const parts = [];
  if (skills.length) parts.push(`${list(skills.slice(0, 3).map(pretty))} from your profile ${skills.length === 1 ? 'is' : 'are'} in this role`);
  else if (semantic) parts.push('Close to what your profile describes');
  if (role) parts.push(`${ROLE_NAMES[role] || role}, one of the roles you picked`);
  if (signal?.kind === 'funding') parts.push(`raised ${signal.amount ? `${signal.amount}${signal.round ? ` ${signal.round}` : ''}` : 'funding'} ${when(signal.date)}`);
  else if (signal?.kind === 'launch') parts.push(`launched ${when(signal.date)}`);
  const s = parts.join(' · ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * @param profile {skills, roles, kind, loc}
 * @param opts {backed, type, limit, userVector (pgvector literal or null), uid}
 */
export async function matchJobs(profile, { backed = '', limit = 40, userVector = null, uid = null, onlyNewSince = null, excludeIds = [] } = {}) {
  const skills = profile.skills || [];
  const roles = profile.roles || [];
  const query = { kind: profile.kind || '', loc: (profile.loc || []).join(','), backed, hideApplied: '1', exp: profile.kind === 'job' ? '0,1' : '' };
  const { where, p, u } = jobWhere(query, uid);
  const extra = [];
  if (onlyNewSince) extra.push(`j.first_seen > ${p(onlyNewSince)}`);
  if (excludeIds.length) extra.push(`j.id NOT IN (${excludeIds.map((id) => p(id)).join(',')})`);
  const w = andWhere(where, extra);

  // Candidates: nearest by meaning (if we have vectors) plus the newest roles, so new roles without vectors still count.
  let rows = [];
  if (userVector) {
    const v = p(userVector);
    rows = await q(
      `${SELECT_JOB(u).replace('SELECT j.*,', `SELECT j.*, 1 - (j.embedding <=> ${v}::vector) AS sim,`)} ${w} ${w ? 'AND' : 'WHERE'} j.embedding IS NOT NULL
       ORDER BY j.embedding <=> ${v}::vector LIMIT 400`,
      p.values
    );
  }
  const seen = new Set(rows.map((r) => r.id));
  const p2 = params();
  const g = jobWhere(query, uid, p2);
  const extra2 = [];
  if (onlyNewSince) extra2.push(`j.first_seen > ${p2(onlyNewSince)}`);
  if (excludeIds.length) extra2.push(`j.id NOT IN (${excludeIds.map((id) => p2(id)).join(',')})`);
  const w2 = andWhere(g.where, extra2);
  for (const r of await q(`${SELECT_JOB(g.u)} ${w2} ORDER BY COALESCE(j.posted_at, j.first_seen) DESC LIMIT 1200`, p2.values)) {
    if (!seen.has(r.id)) rows.push(r);
  }

  const res = skills.map((s) => [s, skillRe(s)]);
  const scored = rows.map((r) => {
    const title = r.title || '';
    const tags = `${JSON.stringify(r.tags || [])} ${JSON.stringify(r.languages || [])}`;
    const desc = String(r.description || '').slice(0, 6000);
    let raw = 0;
    const hits = [];
    for (const [skill, re] of res) {
      let wgt = 0;
      if (re.test(title)) wgt += 3;
      if (re.test(tags)) wgt += 2;
      if (re.test(desc)) wgt += 1;
      if (wgt) {
        raw += wgt;
        hits.push([skill, wgt]);
      }
    }
    const roleHit = roles.includes(r.category);
    if (roleHit) raw += 4;
    const kw = raw / (raw + 10);
    const sim = r.sim == null ? null : Number(r.sim);
    const sem = sim == null ? null : Math.min(1, Math.max(0, (sim - 0.35) / 0.4));
    let score = sem == null ? kw : 0.55 * sem + 0.45 * kw;
    const job = toJob(r);
    if (job.signal?.kind === 'funding' && daysAgo(job.signal.date) < 45) score += 0.04; // fresh money, more likely to hire
    const matched = hits.sort((a, b) => b[1] - a[1]).slice(0, 5).map((h) => h[0]);
    return { job, raw, sem, score, matched, roleHit };
  });
  const profiled = skills.length || roles.length;
  const ranked = (profiled ? scored.filter((x) => x.raw > 0 || (x.sem ?? 0) > 0.35) : scored).sort(
    (a, b) => b.score - a.score || String(b.job.postedAt || b.job.firstSeen).localeCompare(String(a.job.postedAt || a.job.firstSeen))
  );
  return {
    total: ranked.length,
    scanned: rows.length,
    semantic: Boolean(userVector),
    matches: ranked.slice(0, limit).map((x) => {
      const why = { skills: x.matched, role: x.roleHit ? x.job.category : null, signal: x.job.signal, semantic: x.sem != null && x.sem > 0.5 };
      return { ...x.job, fit: profiled ? Math.min(98, Math.round(100 * x.score)) : null, why: { ...why, line: whyLine(why) } };
    }),
  };
}
