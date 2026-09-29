import { htmlToText, toIso } from '../lib/text.js';
import { getJson, sleep } from '../lib/http.js';

// Amazon's own careers site (amazon.jobs) serves its search results as public JSON.
// We search India-only for early-career keywords.
const QUERIES = ['intern', 'software development engineer', 'SDE', 'university', 'new grad', 'data scientist', 'applied scientist intern'];
const PAGE = 100;

async function fetchAll() {
  const jobs = new Map();
  for (const q of QUERIES) {
    for (let offset = 0; offset < 300; offset += PAGE) {
      const qs = new URLSearchParams({ base_query: q, result_limit: String(PAGE), offset: String(offset), sort: 'recent' });
      qs.append('normalized_country_code[]', 'IND');
      const res = await getJson(`https://www.amazon.jobs/en/search.json?${qs}`);
      for (const j of res?.jobs || []) jobs.set(j.id || j.id_icims, j);
      if ((res?.jobs || []).length < PAGE) break;
      await sleep(600);
    }
  }
  return { jobs: [...jobs.values()] };
}

export default {
  id: 'amazon',
  label: 'Amazon',
  minIntervalMinutes: 180,
  targets: () => [{ key: 'amazon', label: 'Amazon (amazon.jobs)', company: 'Amazon', fetch: fetchAll }],
  parse(raw) {
    return (raw?.jobs || []).map((j) => ({
      source: 'amazon',
      sourceJobId: String(j.id_icims || j.id),
      company: 'Amazon',
      title: (j.title || '').trim(),
      description: htmlToText([j.description, j.basic_qualifications, j.preferred_qualifications].filter(Boolean).join('\n')),
      locations: [j.normalized_location || j.location, j.country_code === 'IND' ? 'India' : null].filter(Boolean),
      isRemote: false,
      employmentType: j.job_schedule_type || '',
      tags: [j.job_category, j.business_category].filter(Boolean),
      url: j.job_path ? `https://www.amazon.jobs${j.job_path}` : j.url_next_step,
      postedAt: toIso(j.posted_date),
      salary: null,
    }));
  },
};
