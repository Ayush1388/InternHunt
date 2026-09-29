import { toIso, htmlToText } from '../lib/text.js';
import { getJson } from '../lib/http.js';
import { levelHintFrom } from '../lib/levelHint.js';

// SmartRecruiters public Posting API (no key): https://developers.smartrecruiters.com/docs/posting-api
// The list endpoint has no description; `detail` fetches it from the posting endpoint when needed.
export default {
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  targets: (cfg) =>
    (cfg.smartrecruiters || []).map((c) => ({
      key: `smartrecruiters:${c.token}`,
      label: c.name,
      url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token)}/postings?limit=100`,
      company: c.name,
      token: c.token,
    })),
  async detail(row) {
    const token = row.target_key.split(':')[1];
    const id = row.id.split(':')[1];
    const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${encodeURIComponent(id)}`);
    const sections = d?.jobAd?.sections || {};
    return ['jobDescription', 'qualifications', 'additionalInformation']
      .map((k) => sections[k])
      .filter((x) => x?.text)
      .map((x) => `${x.title ? `${x.title}\n` : ''}${htmlToText(x.text)}`)
      .join('\n');
  },
  parse(raw, target) {
    return (raw?.content || []).map((j) => {
      const l = j.location || {};
      const place = [l.city, l.region, l.country === 'in' ? 'India' : l.country].filter(Boolean).join(', ');
      const level = j.experienceLevel?.label || '';
      return {
        source: 'smartrecruiters',
        sourceJobId: String(j.id),
        company: j.company?.name || target.company,
        title: (j.name || '').trim(),
        description: '',
        levelHint: levelHintFrom(level),
        locations: [l.remote ? `Remote - ${place}` : place].filter(Boolean),
        isRemote: Boolean(l.remote),
        employmentType: `${j.typeOfEmployment?.label || ''} ${/intern/i.test(level) ? 'Intern' : ''}`.trim(),
        tags: [j.department?.label, j.function?.label].filter(Boolean),
        url: `https://jobs.smartrecruiters.com/${encodeURIComponent(j.company?.identifier || target.token)}/${j.id}`,
        postedAt: toIso(j.releasedDate),
        salary: null,
      };
    });
  },
};
