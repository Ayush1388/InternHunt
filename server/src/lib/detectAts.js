// Finds which hiring system (ATS) a company uses by reading its careers page.
// Most careers pages embed or link to their ATS, e.g. boards.greenhouse.io/<token> or
// <tenant>.wd5.myworkdayjobs.com/<site>. Exported pieces are pure so they can be tested.

const PATTERNS = [
  { type: 'greenhouse', re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/i },
  { type: 'greenhouse', re: /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i },
  { type: 'lever', re: /jobs\.(?:eu\.)?lever\.co\/([a-z0-9._-]+)/i },
  { type: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9._%-]+)/i },
  { type: 'workable', re: /apply\.workable\.com\/([a-z0-9_-]+)/i },
  { type: 'recruitee', re: /\/\/([a-z0-9-]+)\.recruitee\.com/i },
  { type: 'personio', re: /\/\/([a-z0-9-]+)\.jobs\.personio\.(de|com)/i },
  { type: 'smartrecruiters', re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
  { type: 'workday', re: /\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/ },
];

// Path segments that are part of the ATS UI, not the company token.
const NOT_TOKENS = new Set(['embed', 'jobs', 'job', 'api', 'v1', 'js', 'apply', 'careers', 'search', 'en', 'static', 'assets', 'wday', 'job_board']);

/** First ATS reference found in a page's HTML, or null. */
export function detectAts(html = '') {
  for (const { type, re } of PATTERNS) {
    const m = html.match(re);
    if (!m) continue;
    if (type === 'workday') {
      const [, tenant, shard, site] = m;
      if (NOT_TOKENS.has(site.toLowerCase())) continue;
      return { type, host: `${tenant}.${shard}.myworkdayjobs.com`, tenant, site };
    }
    const token = decodeURIComponent(m[1]).replace(/[/?#].*$/, '');
    if (!token || NOT_TOKENS.has(token.toLowerCase())) continue;
    return type === 'personio' ? { type, token, domain: m[2] } : { type, token };
  }
  return null;
}

/** Links on a careers page that probably lead to the job list (same site or a known ATS). */
export function jobListLinks(html = '', baseUrl = '') {
  const out = new Set();
  const base = (() => {
    try {
      return new URL(baseUrl);
    } catch {
      return null;
    }
  })();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.size < 8) {
    const [, href, inner] = m;
    const label = inner.replace(/<[^>]+>/g, ' ');
    if (!/\b(open (roles|positions)|openings|all jobs|view jobs|see jobs|job openings|current openings|join us|careers|positions|apply|jobs)\b/i.test(`${label} ${href}`)) continue;
    try {
      const u = new URL(href, base || undefined);
      if (!/^https?:$/.test(u.protocol)) continue;
      if (base && u.hostname !== base.hostname && !u.hostname.endsWith(base.hostname.replace(/^www\./, '')) && !/careers|jobs/.test(u.hostname)) continue;
      out.add(u.toString());
    } catch {
      /* ignore bad links */
    }
  }
  return [...out];
}
