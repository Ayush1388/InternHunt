import { htmlToText, toIso } from '../lib/text.js';
import { getText } from '../lib/http.js';
import { parseXml, asArray, text } from '../lib/xml.js';
import { levelHintFrom } from '../lib/levelHint.js';

// Personio public XML feed (no key): https://<token>.jobs.personio.de/xml?language=en
// Some accounts live on .jobs.personio.com — set "domain": "com" in companies.json for those.
export default {
  id: 'personio',
  label: 'Personio',
  targets: (cfg) =>
    (cfg.personio || []).map((c) => {
      const host = `${encodeURIComponent(c.token)}.jobs.personio.${c.domain || 'de'}`;
      return {
        key: `personio:${c.token}`,
        label: c.name,
        company: c.name,
        host,
        fetch: async () => parseXml(await getText(`https://${host}/xml?language=en`)),
      };
    }),
  parse(doc, target) {
    return asArray(doc?.['workzag-jobs']?.position).map((p) => {
      const desc = asArray(p.jobDescriptions?.jobDescription)
        .map((d) => `${text(d.name)}\n${htmlToText(text(d.value))}`)
        .join('\n');
      const offices = [text(p.office), ...asArray(p.additionalOffices?.office).map(text)].filter(Boolean);
      return {
        source: 'personio',
        sourceJobId: `${target.host}:${text(p.id)}`,
        company: text(p.subcompany) || target.company,
        title: text(p.name).trim(),
        description: desc,
        locations: offices,
        isRemote: /remote/i.test(offices.join(' ')),
        employmentType: `${text(p.employmentType)} ${text(p.schedule)}`.trim(),
        levelHint: levelHintFrom(text(p.seniority), text(p.yearsOfExperience), text(p.employmentType)),
        tags: [text(p.department), text(p.occupationCategory)].filter(Boolean),
        url: `https://${target.host}/job/${text(p.id)}`,
        postedAt: toIso(text(p.createdAt)),
        salary: null,
      };
    });
  },
};
