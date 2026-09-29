import { htmlToText, toIso } from '../lib/text.js';

// Lever Postings API (public, no key): https://github.com/lever/postings-api
export default {
  id: 'lever',
  label: 'Lever',
  targets: (cfg) =>
    (cfg.lever || []).map((c) => ({
      key: `lever:${c.token}`,
      label: c.name,
      url: `https://api.lever.co/v0/postings/${encodeURIComponent(c.token)}?mode=json`,
      company: c.name,
    })),
  parse(raw, target) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map((j) => {
      const cat = j.categories || {};
      const locs = [...(cat.allLocations || []), cat.location, j.location, j.country === 'IN' ? 'India' : null];
      const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n');
      const description = [j.descriptionPlain || htmlToText(j.description || ''), lists, j.additionalPlain || '']
        .filter(Boolean)
        .join('\n');
      return {
        source: 'lever',
        sourceJobId: j.id,
        company: target.company,
        title: (j.text || '').trim(),
        description,
        locations: [...new Set(locs.filter(Boolean))],
        isRemote: /remote/i.test(j.workplaceType || ''),
        employmentType: cat.commitment || j.commitment || '',
        tags: [cat.team, cat.department, j.team, j.department].filter(Boolean),
        url: j.hostedUrl || j.applyUrl,
        postedAt: toIso(j.createdAt),
        salary: formatSalary(j.salaryRange),
      };
    });
  },
};

function formatSalary(r) {
  if (!r || !r.min) return null;
  const locale = r.currency === 'INR' ? 'en-IN' : 'en-US';
  const n = (v) => Number(v).toLocaleString(locale);
  const per = { 'per-year-salary': '/yr', 'per-month-salary': '/mo', 'per-hour-wage': '/hr' }[r.interval] || '';
  return `${r.currency || ''} ${n(r.min)}${r.max && r.max !== r.min ? `–${n(r.max)}` : ''} ${per}`.trim();
}
