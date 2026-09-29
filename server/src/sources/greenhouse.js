import { htmlToText, toIso } from '../lib/text.js';

// Greenhouse Job Board API (public, no key): https://developers.greenhouse.io/job-board.html
export default {
  id: 'greenhouse',
  label: 'Greenhouse',
  targets: (cfg) =>
    (cfg.greenhouse || []).map((c) => ({
      key: `greenhouse:${c.token}`,
      label: c.name,
      url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs?content=true`,
      company: c.name,
    })),
  parse(raw, target) {
    return (raw?.jobs || []).map((j) => {
      const offices = (j.offices || []).map((o) => o.location || o.name).filter(Boolean);
      return {
        source: 'greenhouse',
        sourceJobId: String(j.id),
        company: j.company_name || target.company,
        title: j.title?.trim() || '',
        description: htmlToText(j.content || ''),
        locations: [j.location?.name, ...offices].filter(Boolean),
        isRemote: /remote/i.test(j.location?.name || ''),
        employmentType: '',
        tags: (j.departments || []).map((d) => d.name).filter(Boolean),
        url: j.absolute_url,
        postedAt: toIso(j.first_published || j.updated_at),
        salary: null,
      };
    });
  },
};
