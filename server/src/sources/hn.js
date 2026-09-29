import { htmlToText, toIso, decodeEntities } from '../lib/text.js';
import { getJson } from '../lib/http.js';

// Hacker News "Ask HN: Who is hiring?" monthly thread, via the official Algolia HN Search API.
// https://hn.algolia.com/api — no key. Each top-level comment is one company's post, by convention:
//   Company | Role(s) | Location | REMOTE/ONSITE | ...
const ROLE_RE =
  /\b(engineer\w*|developer\w*|intern\w*|scientist\w*|analyst\w*|sde|swe|sdet|programmer|full[\s-]?stack|front[\s-]?end|back[\s-]?end|devops|sre|ml|ai|data|mobile|android|ios|researcher)\b/i;
const LOCATION_RE =
  /\b(remote|onsite|on-site|in[\s-]?office|hybrid|anywhere|worldwide|global|india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|noida|chennai|usa?|united states|uk|europe|eu|emea|apac|asia|canada|germany|london|nyc|new york|san francisco|sf|bay area|berlin|singapore|timezone|tz|utc|est|pst|cet|ist)\b/i;
const SENIOR_WORD = /\b(senior|sr\.?|staff|principal|lead|manager|director|head|vp|architect)\b/i;

/** Split one HN post into company / title / locations. Exported for tests. */
export function parseHnPost(html = '') {
  const firstPara = decodeEntities(String(html).split(/<p>/i)[0].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const segs = firstPara.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null; // not following the format → skip
  const company = segs[0].replace(/\(.*?\)/g, '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 80);
  const rest = segs.slice(1).filter((s) => !/^https?:\/\//i.test(s));
  const locations = rest.filter((s) => LOCATION_RE.test(s) && s.length < 120);
  const roles = rest
    .filter((s) => !locations.includes(s) && ROLE_RE.test(s) && !/\$|€|£|₹|\bk\b|salary|equity|visa|full[\s-]?time|part[\s-]?time|contract/i.test(s))
    .flatMap((s) => s.split(/\s*(?:,|;|\/| and | & )\s*(?=[A-Z])/))
    .map((s) => s.trim())
    .filter((s) => ROLE_RE.test(s));
  const junior = roles.filter((r) => !SENIOR_WORD.test(r));
  const picked = (junior.length ? junior : roles).slice(0, 3);
  if (!company || !picked.length) return null;
  return {
    company,
    title: picked.join(' / ').slice(0, 160),
    locations: locations.length ? locations : [],
    remote: locations.some((l) => /\bremote\b/i.test(l)),
  };
}

async function fetchAll() {
  const stories = await getJson('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10');
  const thread = (stories?.hits || []).find((h) => /who is hiring\?/i.test(h.title || '') && !/wants to be hired|freelancer/i.test(h.title));
  if (!thread) return { children: [] };
  const item = await getJson(`https://hn.algolia.com/api/v1/items/${thread.objectID}`);
  return { threadTitle: thread.title, children: item?.children || [] };
}

export default {
  id: 'hn',
  label: 'HN Who is Hiring',
  attribution: 'Hacker News "Who is hiring?" (news.ycombinator.com)',
  minIntervalMinutes: 360,
  targets: () => [{ key: 'hn', label: 'HN Who is Hiring', fetch: fetchAll }],
  parse(raw) {
    const out = [];
    for (const c of raw?.children || []) {
      if (!c?.text || c.type !== 'comment') continue;
      const p = parseHnPost(c.text);
      if (!p) continue;
      // "REMOTE" on HN often quietly means US-only; honour it when the post says so.
      const usOnly =
        /\b(us|usa|u\.s\.?)[\s-]*(only|based|residents?|citizens?)\b|must (be )?(based|located|reside) in the (us|usa|united states)|us work authori[sz]ation/i.test(
          htmlToText(c.text)
        ) && !/\b(india|worldwide|anywhere|global)\b/i.test(htmlToText(c.text));
      if (usOnly) p.locations = [...p.locations.map((l) => `${l} (US only)`), ...(p.locations.length ? [] : ['Remote (US only)'])];
      out.push({
        source: 'hn',
        sourceJobId: String(c.id),
        company: p.company,
        title: p.title,
        description: htmlToText(c.text),
        locations: p.locations,
        isRemote: p.remote && p.locations.length === 0,
        employmentType: '',
        tags: [raw.threadTitle ? raw.threadTitle.replace(/^Ask HN:\s*/i, '') : 'HN'],
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        // A real company links its site or careers page; anonymous/recruiter posts usually don't.
        companyUrl: (c.text.match(/href="(https?:\/\/[^"]+)"/i) || c.text.match(/(https?:\/\/[^\s<"]+)/i) || [])[1] || null,
        postedAt: toIso(c.created_at),
        salary: null,
      });
    }
    return out;
  },
};
