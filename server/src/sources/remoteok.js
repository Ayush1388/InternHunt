import { htmlToText, toIso } from '../lib/text.js';

// Remote OK public API (no key): https://remoteok.com/api
// Their legal notice asks you to mention Remote OK as the source and link back (no nofollow).
export default {
  id: 'remoteok',
  label: 'Remote OK',
  attribution: 'Remote jobs via Remote OK (remoteok.com)',
  targets: () => [{ key: 'remoteok', label: 'Remote OK', url: 'https://remoteok.com/api' }],
  parse(raw) {
    const list = Array.isArray(raw) ? raw.filter((j) => j && j.id && j.position) : [];
    return list.map((j) => {
      const salary =
        j.salary_min && j.salary_max ? `USD ${Math.round(j.salary_min / 1000)}k–${Math.round(j.salary_max / 1000)}k / yr` : null;
      return {
        source: 'remoteok',
        sourceJobId: String(j.id),
        company: j.company || '',
        title: (j.position || '').trim(),
        description: htmlToText(j.description || ''),
        locations: [`Remote - ${j.location || 'Worldwide'}`],
        isRemote: true,
        employmentType: '',
        tags: j.tags || [],
        url: j.url || j.apply_url,
        postedAt: toIso(j.date || j.epoch),
        salary,
      };
    });
  },
};
