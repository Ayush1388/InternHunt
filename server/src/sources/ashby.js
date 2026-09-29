import { htmlToText, toIso } from '../lib/text.js';

// Ashby public Job Posting API (no key): https://developers.ashbyhq.com/docs/public-job-posting-api
export default {
  id: 'ashby',
  label: 'Ashby',
  targets: (cfg) =>
    (cfg.ashby || []).map((c) => ({
      key: `ashby:${c.token}`,
      label: c.name,
      url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}?includeCompensation=true`,
      company: c.name,
    })),
  parse(raw, target) {
    return (raw?.jobs || [])
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        source: 'ashby',
        sourceJobId: j.id,
        company: target.company,
        title: (j.title || '').trim(),
        description: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
        locations: [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean),
        isRemote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || ''),
        employmentType: j.employmentType || '',
        tags: [j.department, j.team].filter(Boolean),
        url: j.jobUrl || j.applyUrl,
        postedAt: toIso(j.publishedAt),
        salary: j.compensation?.compensationTierSummary || null,
      }));
  },
};
