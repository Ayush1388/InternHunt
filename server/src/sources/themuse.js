import { htmlToText, toIso } from '../lib/text.js';
import { getJson, sleep } from '../lib/http.js';
import { levelHintFrom } from '../lib/levelHint.js';

// The Muse public jobs API (key optional): https://www.themuse.com/developers/api/v2
// Mostly US employers, but it tags Internship / Entry Level, and big MNCs list Indian offices.
const MAX_PAGES = Number(process.env.MUSE_MAX_PAGES || 8);

async function fetchAll() {
  const params = new URLSearchParams();
  for (const l of ['Internship', 'Entry Level']) params.append('level', l);
  for (const c of ['Software Engineering', 'Data and Analytics', 'Data Science', 'Computer and IT']) params.append('category', c);
  if (process.env.MUSE_API_KEY) params.set('api_key', process.env.MUSE_API_KEY);
  const results = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    params.set('page', String(page));
    const res = await getJson(`https://www.themuse.com/api/public/jobs?${params}`);
    results.push(...(res?.results || []));
    if (page + 1 >= (res?.page_count || 0)) break;
    await sleep(500);
  }
  return { results };
}

export default {
  id: 'themuse',
  label: 'The Muse',
  attribution: 'The Muse (themuse.com)',
  minIntervalMinutes: 120,
  targets: () => [{ key: 'themuse', label: 'The Muse', fetch: fetchAll }],
  parse(raw) {
    return (raw?.results || []).map((j) => ({
      source: 'themuse',
      sourceJobId: String(j.id),
      company: j.company?.name || '',
      title: (j.name || '').trim(),
      description: htmlToText(j.contents || ''),
      locations: (j.locations || []).map((l) => l.name).filter(Boolean),
      isRemote: false, // "Flexible / Remote" on The Muse is usually US-only; only explicit regions count
      employmentType: '',
      levelHint: levelHintFrom((j.levels || []).map((l) => l.name)),
      tags: (j.categories || []).map((c) => c.name),
      url: j.refs?.landing_page,
      postedAt: toIso(j.publication_date),
      salary: null,
    }));
  },
};
