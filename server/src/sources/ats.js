// Public job-board APIs that need no key. Each adapter turns one board into normalised postings:
// { externalId, company, title, description, locations[], isRemote, employmentType, levelHint, tags[], url, postedAt, salary }
// Quirks handled here (from the plan): Greenhouse has no company name (we pass it in), Lever timestamps are
// milliseconds (toIso handles both), Ashby has an isListed flag.
import { getJson } from '../lib/http.js';
import { htmlToText, toIso } from '../lib/text.js';
import { levelHintFrom } from '../lib/levelHint.js';

const enc = encodeURIComponent;
const opts = { timeoutMs: 20000, retries: 1 };

function money(r) {
  if (!r || !r.min) return null;
  const locale = r.currency === 'INR' ? 'en-IN' : 'en-US';
  const n = (v) => Number(v).toLocaleString(locale);
  const per = { 'per-year-salary': '/yr', 'per-month-salary': '/mo', 'per-hour-wage': '/hr' }[r.interval] || '';
  return `${r.currency || ''} ${n(r.min)}${r.max && r.max !== r.min ? `–${n(r.max)}` : ''} ${per}`.trim();
}

export const ATS = {
  greenhouse: {
    label: 'Greenhouse',
    url: (t) => `https://boards-api.greenhouse.io/v1/boards/${enc(t)}/jobs?content=true`,
    probe: async (t) => (await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc(t)}/jobs`, { timeoutMs: 10000, retries: 0 }))?.jobs || [],
    parse: (raw, company) =>
      (raw?.jobs || []).map((j) => ({
        externalId: String(j.id),
        company: j.company_name || company,
        title: j.title,
        description: htmlToText(j.content || ''),
        locations: [j.location?.name, ...(j.offices || []).map((o) => o.location || o.name)].filter(Boolean),
        isRemote: /remote/i.test(j.location?.name || ''),
        tags: (j.departments || []).map((d) => d.name).filter(Boolean),
        url: j.absolute_url,
        postedAt: toIso(j.first_published || j.updated_at),
      })),
  },
  lever: {
    label: 'Lever',
    url: (t) => `https://api.lever.co/v0/postings/${enc(t)}?mode=json`,
    probe: async (t) => {
      const r = await getJson(`https://api.lever.co/v0/postings/${enc(t)}?mode=json&limit=20`, { timeoutMs: 10000, retries: 0 });
      if (!Array.isArray(r)) throw new Error('not a Lever board');
      return r;
    },
    parse: (raw, company) =>
      (Array.isArray(raw) ? raw : []).map((j) => {
        const cat = j.categories || {};
        const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n');
        return {
          externalId: j.id,
          company,
          title: j.text,
          description: [j.descriptionPlain || htmlToText(j.description || ''), lists, j.additionalPlain || ''].filter(Boolean).join('\n'),
          locations: [...new Set([...(cat.allLocations || []), cat.location, j.country === 'IN' ? 'India' : null].filter(Boolean))],
          isRemote: /remote/i.test(j.workplaceType || ''),
          employmentType: cat.commitment || '',
          tags: [cat.team, cat.department].filter(Boolean),
          url: j.hostedUrl || j.applyUrl,
          postedAt: toIso(j.createdAt),
          salary: money(j.salaryRange),
        };
      }),
  },
  ashby: {
    label: 'Ashby',
    url: (t) => `https://api.ashbyhq.com/posting-api/job-board/${enc(t)}?includeCompensation=true`,
    probe: async (t) => (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${enc(t)}`, { timeoutMs: 10000, retries: 0 }))?.jobs || [],
    parse: (raw, company) =>
      (raw?.jobs || [])
        .filter((j) => j.isListed !== false)
        .map((j) => ({
          externalId: j.id,
          company,
          title: j.title,
          description: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
          locations: [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean),
          isRemote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType || ''),
          employmentType: j.employmentType || '',
          tags: [j.department, j.team].filter(Boolean),
          url: j.jobUrl || j.applyUrl,
          postedAt: toIso(j.publishedAt),
          salary: j.compensation?.compensationTierSummary || null,
        })),
  },
  workable: {
    label: 'Workable',
    url: (t) => `https://apply.workable.com/api/v1/widget/accounts/${enc(t)}?details=true`,
    probe: async (t) => (await getJson(`https://apply.workable.com/api/v1/widget/accounts/${enc(t)}`, { timeoutMs: 10000, retries: 0 }))?.jobs || [],
    parse: (raw, company, token) =>
      (raw?.jobs || []).map((j) => {
        const remote = Boolean(j.telecommuting) || /remote/i.test(j.workplace_type || '');
        const locs = (j.locations || []).length
          ? j.locations.map((l) => [l.city, l.region, l.country].filter(Boolean).join(', '))
          : [[j.city, j.state, j.country].filter(Boolean).join(', ')];
        return {
          externalId: `${token}:${j.shortcode || j.id}`,
          company: raw?.name || company,
          title: j.title,
          description: htmlToText(j.full_description || j.description || ''),
          locations: locs.filter(Boolean).map((l) => (remote ? `Remote - ${l}` : l)),
          isRemote: remote,
          employmentType: j.employment_type || '',
          levelHint: levelHintFrom(j.experience, j.employment_type),
          tags: [j.department, j.function].filter(Boolean),
          url: j.url || j.shortlink || `https://apply.workable.com/${token}/j/${j.shortcode}/`,
          postedAt: toIso(j.published_on || j.created_at),
        };
      }),
  },
  recruitee: {
    label: 'Recruitee',
    url: (t) => `https://${enc(t)}.recruitee.com/api/offers/`,
    probe: async (t) => (await getJson(`https://${enc(t)}.recruitee.com/api/offers/`, { timeoutMs: 10000, retries: 0 }))?.offers || [],
    parse: (raw, company, token) =>
      (raw?.offers || [])
        .filter((o) => !o.status || o.status === 'published')
        .map((o) => {
          const multi = (o.locations || []).map((l) => [l.city, l.country].filter(Boolean).join(', '));
          const base = multi.length ? multi : [o.location || [o.city, o.country].filter(Boolean).join(', ')];
          return {
            externalId: `${token}:${o.id}`,
            company: o.company_name || company,
            title: o.title,
            description: htmlToText(`${o.description || ''}\n${o.requirements || ''}`),
            locations: base.filter(Boolean).map((l) => (o.remote ? `Remote - ${l}` : l)),
            isRemote: Boolean(o.remote),
            employmentType: o.employment_type_code || '',
            levelHint: levelHintFrom(o.experience_code, o.employment_type_code),
            tags: [o.department, ...(o.tags || [])].filter(Boolean),
            url: o.careers_url || `https://${token}.recruitee.com/o/${o.slug}`,
            postedAt: toIso(o.published_at || o.created_at),
          };
        }),
  },
  smartrecruiters: {
    label: 'SmartRecruiters',
    url: (t) => `https://api.smartrecruiters.com/v1/companies/${enc(t)}/postings?limit=100`,
    probe: async (t) => (await getJson(`https://api.smartrecruiters.com/v1/companies/${enc(t)}/postings?limit=5`, { timeoutMs: 10000, retries: 0 }))?.content || [],
    parse: (raw, company, token) =>
      (raw?.content || []).map((j) => {
        const l = j.location || {};
        const place = [l.city, l.region, l.country === 'in' ? 'India' : l.country].filter(Boolean).join(', ');
        const level = j.experienceLevel?.label || '';
        return {
          externalId: String(j.id),
          company: j.company?.name || company,
          title: j.name,
          description: '',
          levelHint: levelHintFrom(level),
          locations: [l.remote ? `Remote - ${place}` : place].filter(Boolean),
          isRemote: Boolean(l.remote),
          employmentType: `${j.typeOfEmployment?.label || ''} ${/intern/i.test(level) ? 'Intern' : ''}`.trim(),
          tags: [j.department?.label, j.function?.label].filter(Boolean),
          url: `https://jobs.smartrecruiters.com/${enc(j.company?.identifier || token)}/${j.id}`,
          postedAt: toIso(j.releasedDate),
        };
      }),
  },
};

export const ATS_TYPES = Object.keys(ATS);

/** Fetch one board's open postings. */
export async function fetchBoard(ats, token, company) {
  const a = ATS[ats];
  if (!a) throw new Error(`Unknown board type ${ats}`);
  const raw = await getJson(a.url(token), opts);
  return a.parse(raw, company, token).filter((j) => j.title && j.url);
}
