import { toIso } from '../lib/text.js';
import { getJson, sleep } from '../lib/http.js';

// Microsoft's careers site (apply.careers.microsoft.com) serves search results as public JSON.
// The list has no descriptions, so level comes from the title (e.g. "Software Engineer Intern").
const QUERIES = ['intern', 'internship', 'software engineer', 'new grad', 'data scientist', 'research intern'];
const PAGES = 5;

async function fetchAll() {
  const positions = new Map();
  for (const q of QUERIES) {
    for (let page = 0; page < PAGES; page++) {
      const qs = new URLSearchParams({ domain: 'microsoft.com', query: q, location: 'India', start: String(page * 10) });
      const res = await getJson(`https://apply.careers.microsoft.com/api/pcsx/search?${qs}`);
      const list = res?.data?.positions || [];
      for (const p of list) positions.set(p.id, p);
      if (list.length < 10) break;
      await sleep(500);
    }
  }
  return { positions: [...positions.values()] };
}

export default {
  id: 'microsoft',
  label: 'Microsoft',
  minIntervalMinutes: 180,
  targets: () => [{ key: 'microsoft', label: 'Microsoft (careers.microsoft.com)', company: 'Microsoft', fetch: fetchAll }],
  parse(raw) {
    return (raw?.positions || [])
      .filter((p) => (p.standardizedLocations || []).includes('IN') || (p.locations || []).some((l) => /india/i.test(l)))
      .map((p) => ({
        source: 'microsoft',
        sourceJobId: String(p.id),
        company: 'Microsoft',
        title: (p.name || '').trim(),
        description: '',
        locations: (() => {
          const india = (p.locations || []).filter((l) => /india/i.test(l));
          return india.length ? india : ['India'];
        })(),
        isRemote: /remote/i.test(p.workLocationOption || ''),
        employmentType: '',
        tags: [p.department].filter(Boolean),
        url: `https://apply.careers.microsoft.com${p.positionUrl || `/careers/job/${p.id}`}`,
        postedAt: toIso(p.postedTs || p.creationTs),
        salary: null,
      }));
  },
};
