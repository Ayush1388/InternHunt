// Finding a company's job board (and website) when we only know its name, domain or YC slug.
// 1. Its careers page usually embeds or links its ATS (boards.greenhouse.io/<token>, jobs.ashbyhq.com/<token>...).
// 2. Otherwise we guess the board token from the name/domain/slug and ask the public APIs.
// 3. For companies we only know from a news headline, the article usually links their website.
import { getText } from '../lib/http.js';
import { detectAts, jobListLinks } from '../lib/detectAts.js';
import { ATS } from '../sources/ats.js';
import { domainOf } from '../lib/names.js';

const opts = { timeoutMs: 9000, retries: 0 };
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Loose company-name match: one name's first word appears in the other. */
export function sameCompany(a, b) {
  const first = (s) => squash(String(s || '').split(/[\s(,.]+/)[0]);
  const A = squash(a);
  const B = squash(b);
  if (!A || !B) return true;
  return A.includes(first(b)) || B.includes(first(a));
}

export function candidateTokens(name = '', website = '', slug = '') {
  const base = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b(inc|ltd|llc|pvt|private|limited|technologies|labs|india|tech|global|hq)\b\.?/g, '')
    .trim();
  const out = [slug, base.replace(/[^a-z0-9]/g, ''), base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')];
  const host = domainOf(website);
  if (host) out.push(host.split('.')[0]);
  return [...new Set(out.filter((t) => t && t.length >= 3 && t.length <= 60))];
}

export function careersCandidates(domain) {
  if (!domain) return [];
  return [`https://${domain}/careers`, `https://www.${domain}/careers`, `https://${domain}/jobs`, `https://careers.${domain}`];
}

async function fromCareersPages(domain) {
  for (const url of careersCandidates(domain)) {
    let html;
    try {
      html = await getText(url, opts);
    } catch {
      continue;
    }
    const direct = detectAts(html);
    if (direct && ATS[direct.type]) return direct;
    for (const link of jobListLinks(html, url).slice(0, 2)) {
      const inLink = detectAts(link);
      if (inLink && ATS[inLink.type]) return inLink;
      try {
        const found = detectAts(await getText(link, opts));
        if (found && ATS[found.type]) return found;
      } catch {
        /* next link */
      }
    }
    return null; // the careers page loaded but doesn't point at a board we can read
  }
  return null;
}

/** { ats, token, jobs, how } or null. */
export async function findBoard({ name, domain = '', slug = '' }) {
  const detected = await fromCareersPages(domain);
  if (detected) {
    try {
      const jobs = await ATS[detected.type].probe(detected.token);
      return { ats: detected.type, token: detected.token, jobs: jobs.length, how: 'careers page' };
    } catch {
      /* stale link; try guessing */
    }
  }
  // Guessing is weaker: Greenhouse boards must carry a matching company name, others must have open roles.
  for (const token of candidateTokens(name, domain, slug)) {
    for (const ats of ['ashby', 'greenhouse', 'lever', 'workable']) {
      try {
        const jobs = await ATS[ats].probe(token);
        if (!jobs.length) continue;
        if (ats === 'greenhouse' && !sameCompany(jobs[0].company_name, name)) continue;
        return { ats, token, jobs: jobs.length, how: token === slug ? 'yc' : 'name match' };
      } catch {
        /* not this one */
      }
    }
  }
  return null;
}

const NOT_COMPANY_HOSTS = /(entrackr|inc42|startuptalky|yourstory|twitter|x\.com|linkedin|facebook|instagram|youtube|google|apple|whatsapp|t\.me|medium|wikipedia|crunchbase|tracxn|publive|wp\.com|gravatar|bit\.ly|amazonaws|cloudfront)/i;

/** The company's own site, from links in a news article about it. */
export async function websiteFromArticle(articleUrl, name) {
  let html;
  try {
    html = await getText(articleUrl, { ...opts, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Knockd/1.0)' } });
  } catch {
    return '';
  }
  const words = String(name).split(/\s+/).filter((w) => !/^(the|a|an)$/i.test(w));
  const want = squash(words[0]);
  const full = squash(words.join(''));
  if (want.length < 3) return '';
  const re = /<a\b[^>]*href=["'](https?:\/\/[^"'#\s]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const host = domainOf(m[1]);
    if (!host || NOT_COMPANY_HOSTS.test(host)) continue;
    const label = squash(host.split('.').slice(0, -1).join('') || host);
    // The site's name has to be the company's name (or start with it), not merely contain a short word of it.
    if (label === full || label === want || (want.length >= 4 && label.startsWith(want) && label.length <= full.length + 6) || (label.length >= 5 && full.startsWith(label))) {
      return `https://${host}`;
    }
  }
  return '';
}
