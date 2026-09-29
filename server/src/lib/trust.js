// Trust filters applied to every posting before it's stored.
// Anything that looks like a scam, an agency/confidential posting, an evergreen "talent pool"
// posting, or a remote job quietly restricted to another country is dropped, with a reason
// counted in the refresh summary. Softer warning signs become flags shown on the card.

const any = (res, text) => res.find((r) => r.re.test(text));

// Money asked from the candidate, off-platform chat, personal-email recruiters, task/"earn daily" scams.
const SCAM_RULES = [
  { reason: 'asks candidates for money', re: /\b(registration|processing|training|security|joining|onboarding|certificate|verification|kit|admission|enrol?ment)\s+(fee|fees|charges?|deposit|amount)\b/i },
  { reason: 'asks candidates for money', re: /\b(refundable|security)\s+deposit\b|\bpay\s+(a\s+)?(small\s+)?(fee|amount|₹|rs\.?|inr)\b|\binvest(ment)?\s+(of|required)\b/i },
  { reason: 'asks candidates for money', re: /\b(pay|paid)\s+(for|to get)\s+(the\s+)?(certificate|internship|training|offer letter)\b/i },
  { reason: 'recruits over WhatsApp/Telegram', re: /\b(whats\s?app|telegram)\b[^.\n]{0,40}\b(hr|recruit\w*|apply|contact|message|join|group|number|us)\b|\b(apply|contact|message|join)\b[^.\n]{0,40}\b(whats\s?app|telegram)\b|wa\.me\/|t\.me\//i },
  { reason: 'recruiter uses a personal email', re: /\b(send|mail|email|share)\b[^.\n]{0,60}\b[\w.+-]+@(gmail|yahoo|outlook|hotmail|rediffmail|ymail|proton|protonmail)\.(com|in|me)\b/i },
  { reason: 'task / easy-money scam wording', re: /\b(earn|earning)\s+(₹|rs\.?|inr|\$)?\s?\d[\d,]*\s*(per|\/|a)\s*(day|task|hour|like|review)\b|\b(data entry|typing|copy[\s-]?paste|form filling|captcha|like and subscribe|rate products?|online tasks?)\s+(job|jobs|work)\b|\bdaily (payout|payment|earning)s?\b/i },
  { reason: 'task / easy-money scam wording', re: /\bno (interview|experience|skills?) (needed|required)\b[^.\n]{0,40}\b(earn|income|salary|payout)\b|\bguaranteed (job|placement|income|offer)\b/i },
  { reason: 'asks for ID or bank details up front', re: /\b(share|send|submit|provide)\b[^.\n]{0,40}\b(aadhaa?r|pan card|bank (account|details)|otp|upi pin|cvv)\b/i },
  { reason: 'crypto / gift-card payment', re: /\b(paid|payment|salary)\b[^.\n]{0,30}\b(in )?(usdt|crypto(currency)?|bitcoin|gift ?cards?)\b/i },
];

// Recruiters posting for unnamed clients, confidential/stealth companies, and staffing agencies.
const AGENCY_RE =
  /\b(on behalf of (our|a|an) client|our client (is|are)|for (a|our) (leading|reputed|top|well[\s-]known|prestigious)?\s*client|hiring for (a|our) client|recruitment (agency|consultancy|firm)|staffing (agency|firm|company)|placement (agency|consultancy|consultant)|confidential (company|client|employer))\b/i;
const ANONYMOUS_COMPANY_RE = /^(confidential|stealth( startup| mode| company)?|undisclosed|hiring company|company name hidden|private company|n\/?a|unknown|anonymous|various|multiple companies)$/i;

// Evergreen postings that collect CVs without an actual opening.
const EVERGREEN_RE =
  /\b(talent (pool|community|network|pipeline)|general (application|interest)|open application|spontaneous application|expression of interest|future (opportunities|openings|roles)|evergreen|pipeline (role|requisition)|always hiring|join our talent)\b/i;

// Remote jobs whose description restricts them to another country/region (and never mentions India/worldwide).
const REGION_LOCK_RE =
  /\b(us|usa|u\.s\.?|united states|canada|uk|united kingdom|eu|europe|european union|latam|latin america|americas|north america|australia|germany)[\s-]*(only|residents?|citizens?|based (candidates|applicants|employees|talent|engineers?|developers?))\b|\bmust (be )?(based|located|residing|reside|live) in (the )?(us|usa|united states|canada|uk|united kingdom|eu|europe|north america|latam|americas|australia)\b|\b(authori[sz]ed|eligible|legally able) to work in (the )?(us|usa|united states|canada|uk|united kingdom|eu)\b|\b(us|u\.s\.) work authori[sz]ation\b|\bwithin (the )?(us|usa|united states|eu|european union|uk) only\b/i;
const OPEN_TO_INDIA_RE = /\b(india|indian|apac|asia|worldwide|anywhere|global(ly)?|any country|all countries|ist)\b/i;

const MAX_AGE_DAYS = { company: Number(process.env.COMPANY_MAX_AGE_DAYS || 120), board: 30, community: 40 };
const STALE_FLAG_DAYS = 45;

/**
 * @param job  normalized posting + classification ({title, company, description, locTag, postedAt, source, companyUrl})
 * @param trust 'company' | 'board' | 'community'
 * @returns {{ drop: string|null, flags: string[] }}
 */
export function trustCheck(job, trust, now = Date.now()) {
  const text = `${job.title}\n${job.description || ''}`;
  const company = String(job.company || '').trim();

  const scam = any(SCAM_RULES, text);
  if (scam) return { drop: `Scam signs: ${scam.reason}`, flags: [] };

  if (!company || ANONYMOUS_COMPANY_RE.test(company)) return { drop: 'No named company', flags: [] };
  if (AGENCY_RE.test(text)) return { drop: 'Agency / unnamed-client posting', flags: [] };
  if (EVERGREEN_RE.test(job.title) || (trust !== 'company' && EVERGREEN_RE.test(text.slice(0, 600))))
    return { drop: 'Evergreen / talent-pool posting (no real opening)', flags: [] };

  if (job.locTag !== 'india_onsite' && REGION_LOCK_RE.test(job.description || '') && !OPEN_TO_INDIA_RE.test(job.description || ''))
    return { drop: 'Remote, but restricted to another country', flags: [] };

  if (trust === 'community' && !job.companyUrl) return { drop: 'Community post without a company website', flags: [] };

  const flags = [];
  if (job.postedAt) {
    const ageDays = (now - Date.parse(job.postedAt)) / 86400000;
    if (ageDays > (MAX_AGE_DAYS[trust] ?? 60)) return { drop: 'Too old — likely filled or a ghost job', flags: [] };
    if (ageDays > STALE_FLAG_DAYS) flags.push('open_long');
  } else if (trust !== 'company') {
    return { drop: 'No posting date', flags: [] };
  }
  if (!['workday', 'microsoft', 'smartrecruiters'].includes(job.source) && (!job.description || job.description.length < 80)) flags.push('thin_description');
  return { drop: null, flags };
}
