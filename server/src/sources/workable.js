import { htmlToText, toIso } from '../lib/text.js';
import { levelHintFrom } from '../lib/levelHint.js';

// Workable public careers widget API (no key):
// https://apply.workable.com/api/v1/widget/accounts/<token>?details=true
// Token = the part after apply.workable.com/ on a company's careers page.
export default {
  id: 'workable',
  label: 'Workable',
  targets: (cfg) =>
    (cfg.workable || []).map((c) => ({
      key: `workable:${c.token}`,
      label: c.name,
      url: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(c.token)}?details=true`,
      company: c.name,
      token: c.token,
    })),
  parse(raw, target) {
    return (raw?.jobs || []).map((j) => {
      const locs = (j.locations || []).length
        ? j.locations.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '))
        : [[j.city, j.state, j.country].filter(Boolean).join(', ')];
      const remote = Boolean(j.telecommuting) || /remote/i.test(j.workplace_type || '');
      return {
        source: 'workable',
        sourceJobId: `${target.token}:${j.shortcode || j.id}`,
        company: raw?.name || target.company,
        title: (j.title || '').trim(),
        description: htmlToText(j.full_description || j.description || ''),
        locations: locs.filter(Boolean).map((l) => (remote ? `Remote - ${l}` : l)),
        isRemote: remote,
        employmentType: j.employment_type || '',
        levelHint: levelHintFrom(j.experience, j.employment_type),
        tags: [j.department, j.function].filter(Boolean),
        url: j.url || j.shortlink || `https://apply.workable.com/${target.token}/j/${j.shortcode}/`,
        postedAt: toIso(j.published_on || j.created_at),
        salary: null,
      };
    });
  },
};
