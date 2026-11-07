// Y Combinator, the way github.com/adityajha2005/yc-outreach does it:
//  - the company list comes from yc-oss (a public, daily mirror of YC's directory), filtered to "hiring";
//  - founders, open roles and launches come from the JSON embedded in each public
//    ycombinator.com/companies/<slug> page (props.company, props.jobPostings, props.launches).
// Websites always come from YC's own data, never from a request, so this can't be pointed at arbitrary URLs.
import { getJson, getText } from '../lib/http.js';
import { decodeEntities } from '../lib/text.js';

const SLUG_RE = /^[a-z0-9-]{1,100}$/;
const SEASON = { Winter: 1, Spring: 2, Summer: 3, Fall: 4 };

/** "Summer 2025" -> 2025.3, for sorting newest first. */
export const batchRank = (b) => {
  const [s, y] = String(b || '').split(' ');
  return Number(y) ? Number(y) + (SEASON[s] || 0) / 10 : 0;
};

/** "Summer 2025" -> "S25". */
export const shortBatch = (b) => {
  const [s, y] = String(b || '').split(' ');
  return SEASON[s] && y ? `${s[0]}${y.slice(2)}` : String(b || '');
};

/** Every YC company currently marked as hiring, newest batch first. */
export async function ycHiring() {
  const list = await getJson('https://yc-oss.github.io/api/companies/hiring.json', { timeoutMs: 60000 });
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && SLUG_RE.test(c.slug || '') && ['Active', 'Public'].includes(c.status || 'Active'))
    .map((c) => ({
      name: c.name,
      slug: c.slug,
      batch: c.batch || '',
      website: c.website || '',
      oneLiner: c.one_liner || '',
      description: c.long_description || '',
      industry: c.subindustry || c.industry || '',
      teamSize: Number(c.team_size) || null,
      location: c.all_locations || '',
      regions: c.regions || [],
      logo: c.small_logo_thumb_url || '',
      launchedAt: c.launched_at ? new Date(c.launched_at * 1000).toISOString() : null,
    }))
    .sort((a, b) => batchRank(b.batch) - batchRank(a.batch));
}

/** Founders, open roles and launches from a company's public YC page. */
export async function ycCompanyPage(slug) {
  if (!SLUG_RE.test(slug)) throw new Error('Bad YC slug');
  const url = `https://www.ycombinator.com/companies/${slug}`;
  const html = await getText(url, { timeoutMs: 12000, retries: 0, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Doorstep/1.0)' } });
  const m = /data-page="([^"]*)"/.exec(html || '');
  if (!m) throw new Error('No company data on the YC page');
  const props = JSON.parse(decodeEntities(m[1]))?.props || {};
  const c = props.company || {};
  const abs = (p) => (String(p || '').startsWith('/') ? `https://www.ycombinator.com${p}` : String(p || ''));
  return {
    url,
    name: c.name,
    website: c.website || '',
    oneLiner: c.one_liner || '',
    location: c.location || '',
    linkedin: c.linkedin_url || '',
    twitter: c.twitter_url || '',
    founders: (c.founders || [])
      .filter((f) => f && f.full_name && f.is_active !== false)
      .map((f) => ({ name: f.full_name, title: f.title || 'Founder', linkedin: f.linkedin_url || '', twitter: f.twitter_url || '' })),
    jobs: (props.jobPostings || [])
      .filter((j) => j && !j.isIncomplete && j.title && j.url)
      .map((j) => ({
        externalId: String(j.id),
        title: j.title,
        url: abs(j.url),
        location: j.location || '',
        type: j.type || '',
        role: j.roleSpecificType || j.prettyRole || '',
        salary: j.salaryRange || null,
        minExperience: j.minExperience || '',
        visa: j.visa || '',
        skills: (j.skills || []).map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean),
      })),
    launches: (props.launches || [])
      .filter((l) => l && (l.title || l.tagline))
      .map((l) => ({
        title: l.title || l.tagline,
        tagline: l.tagline || '',
        url: abs(l.url || (l.slug ? `/launches/${l.slug}` : '')),
        date: l.created_at || l.createdAt || null,
      })),
  };
}

/** A YC page job as a normalised posting (same shape as sources/ats.js). */
export function ycJobToPosting(j, company) {
  const remote = /remote/i.test(j.location);
  const newGrad = /new grads? ok|any/i.test(j.minExperience);
  return {
    externalId: j.externalId,
    company,
    title: j.title,
    description: [
      j.role && `Role: ${j.role}`,
      j.type && `Type: ${j.type}`,
      j.minExperience && `Experience: ${j.minExperience}`,
      j.visa && `Visa: ${j.visa}`,
      j.skills.length ? `Skills: ${j.skills.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    locations: j.location ? j.location.split(/\s*[;/]\s*/) : [],
    isRemote: remote,
    employmentType: /intern/i.test(j.type) ? 'Intern' : j.type,
    levelHint: /intern/i.test(j.type) ? 'intern' : newGrad ? 'entry' : null,
    tags: [j.role, ...j.skills].filter(Boolean),
    url: j.url,
    postedAt: null,
    salary: j.salary,
  };
}
