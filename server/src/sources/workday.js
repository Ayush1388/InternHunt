import { getJson, postJson, sleep } from '../lib/http.js';
import { htmlToText } from '../lib/text.js';

// Workday career sites expose the JSON their own search page uses (not an official API).
// Many large employers with Indian offices use Workday. Add one in companies.json from any
// job URL like https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/...
//   { "host": "nvidia.wd5.myworkdayjobs.com", "tenant": "nvidia", "site": "NVIDIAExternalCareerSite", "name": "NVIDIA" }
// The list endpoint has no descriptions; `detail` fetches one posting's description when needed.
const SEARCHES = ['intern', 'internship', 'graduate', 'entry level', 'associate software engineer', 'fresher'];
const PAGES_PER_SEARCH = 3;

function postedOnToIso(s = '') {
  const t = s.toLowerCase();
  if (t.includes('today')) return new Date().toISOString();
  if (t.includes('yesterday')) return new Date(Date.now() - 86400000).toISOString();
  const m = t.match(/(\d+)\+?\s*days?/);
  return m ? new Date(Date.now() - Number(m[1]) * 86400000).toISOString() : null;
}

export default {
  id: 'workday',
  label: 'Workday',
  targets: (cfg) =>
    (cfg.workday || []).map((c) => {
      const base = `https://${c.host}/wday/cxs/${c.tenant}/${c.site}`;
      return {
        key: `workday:${c.tenant}:${c.site}`,
        label: c.name,
        company: c.name,
        host: c.host,
        site: c.site,
        fetch: async () => {
          const postings = new Map();
          for (const searchText of SEARCHES) {
            for (let page = 0; page < PAGES_PER_SEARCH; page++) {
              const res = await postJson(`${base}/jobs`, { appliedFacets: {}, limit: 20, offset: page * 20, searchText });
              for (const p of res?.jobPostings || []) if (p.externalPath) postings.set(p.externalPath, p);
              if ((res?.jobPostings || []).length < 20) break;
              await sleep(700);
            }
          }
          // "3 Locations" hides where the job is; look those up (capped to stay polite).
          const hidden = [...postings.values()].filter((p) => /^\d+ locations?$/i.test(p.locationsText || '')).slice(0, 30);
          for (const p of hidden) {
            try {
              const d = await getJson(`${base}${p.externalPath}`);
              const info = d?.jobPostingInfo || {};
              p.locationsText = [info.location, ...(info.additionalLocations || [])].filter(Boolean).join('; ');
              await sleep(400);
            } catch {
              /* keep the placeholder */
            }
          }
          return { jobPostings: [...postings.values()] };
        },
      };
    }),
  async detail(row) {
    const [, tenant, site] = row.target_key.split(':');
    const rest = row.id.slice('workday:'.length); // "<host>:<externalPath>"
    const host = rest.slice(0, rest.indexOf(':'));
    const externalPath = rest.slice(rest.indexOf(':') + 1);
    const d = await getJson(`https://${host}/wday/cxs/${tenant}/${site}${externalPath}`);
    return htmlToText(d?.jobPostingInfo?.jobDescription || '');
  },
  parse(raw, target) {
    return (raw?.jobPostings || []).map((p) => ({
      source: 'workday',
      sourceJobId: `${target.host}:${p.externalPath}`,
      company: target.company,
      title: (p.title || '').trim(),
      description: '',
      locations: [p.locationsText].filter(Boolean),
      isRemote: /remote/i.test(p.locationsText || ''),
      employmentType: (p.bulletFields || []).join(' '),
      tags: [],
      url: `https://${target.host}/${target.site}${p.externalPath}`,
      postedAt: postedOnToIso(p.postedOn),
      salary: null,
    }));
  },
};
