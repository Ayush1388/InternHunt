import { htmlToText, toIso } from '../lib/text.js';

// Working Nomads public job feed (no key): https://www.workingnomads.com/api/exposed_jobs/
// Undocumented but linked from their own site; one request per refresh.
export default {
  id: 'workingnomads',
  label: 'Working Nomads',
  attribution: 'Working Nomads (workingnomads.com)',
  minIntervalMinutes: 180,
  targets: () => [{ key: 'workingnomads', label: 'Working Nomads', url: 'https://www.workingnomads.com/api/exposed_jobs/' }],
  parse(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map((j) => ({
      source: 'workingnomads',
      sourceJobId: String(j.url || '').replace(/\D+/g, ' ').trim().split(' ').pop() || j.url,
      company: j.company_name || '',
      title: (j.title || '').trim(),
      description: htmlToText(j.description || ''),
      locations: [`Remote - ${j.location || 'Anywhere'}`],
      isRemote: true,
      employmentType: '',
      tags: [j.category_name, ...String(j.tags || '').split(',')].map((s) => (s || '').trim()).filter(Boolean),
      url: j.url,
      postedAt: toIso(j.pub_date),
      salary: null,
    }));
  },
};
