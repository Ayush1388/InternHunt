import { htmlToText, toIso } from '../lib/text.js';
import { levelHintFrom } from '../lib/levelHint.js';

// Recruitee careers-site API (no key): https://<token>.recruitee.com/api/offers/
export default {
  id: 'recruitee',
  label: 'Recruitee',
  targets: (cfg) =>
    (cfg.recruitee || []).map((c) => ({
      key: `recruitee:${c.token}`,
      label: c.name,
      url: `https://${encodeURIComponent(c.token)}.recruitee.com/api/offers/`,
      company: c.name,
      token: c.token,
    })),
  parse(raw, target) {
    return (raw?.offers || [])
      .filter((o) => !o.status || o.status === 'published')
      .map((o) => {
        const multi = (o.locations || []).map((l) => [l.city, l.country].filter(Boolean).join(', '));
        const base = multi.length ? multi : [o.location || [o.city, o.country].filter(Boolean).join(', ')];
        return {
          source: 'recruitee',
          sourceJobId: `${target.token}:${o.id}`,
          company: o.company_name || target.company,
          title: (o.title || '').trim(),
          description: htmlToText(`${o.description || ''}\n${o.requirements || ''}`),
          locations: base.filter(Boolean).map((l) => (o.remote ? `Remote - ${l}` : l)),
          isRemote: Boolean(o.remote),
          employmentType: o.employment_type_code || '',
          levelHint: levelHintFrom(o.experience_code, o.employment_type_code),
          tags: [o.department, ...(o.tags || [])].filter(Boolean),
          url: o.careers_url || `https://${target.token}.recruitee.com/o/${o.slug}`,
          postedAt: toIso(o.published_at || o.created_at),
          salary: null,
        };
      });
  },
};
