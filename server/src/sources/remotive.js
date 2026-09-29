import { htmlToText, toIso } from '../lib/text.js';

// Remotive public API (no key): https://remotive.com/api/remote-jobs
// Their terms ask you to credit Remotive and link back to the job URL, and to call the API
// only a few times per day — one request per refresh keeps us well inside that.
export default {
  id: 'remotive',
  label: 'Remotive',
  attribution: 'Remote jobs via Remotive (remotive.com)',
  targets: () => [{ key: 'remotive', label: 'Remotive', url: 'https://remotive.com/api/remote-jobs' }],
  parse(raw) {
    return (raw?.jobs || []).map((j) => ({
      source: 'remotive',
      sourceJobId: String(j.id),
      company: j.company_name || '',
      title: (j.title || '').trim(),
      description: htmlToText(j.description || ''),
      locations: [`Remote - ${j.candidate_required_location || 'Worldwide'}`],
      isRemote: true,
      employmentType: j.job_type === 'internship' ? 'Intern' : j.job_type || '',
      tags: [j.category, ...(j.tags || [])].filter(Boolean),
      url: j.url,
      postedAt: toIso(j.publication_date),
      salary: j.salary || null,
    }));
  },
};
