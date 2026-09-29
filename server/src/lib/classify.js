// Classifies a normalized posting into: role category, level (intern / entry / unspecified),
// and a location bucket relevant to someone applying from India.
// Anything senior, non-tech, or not open to India-based candidates returns null and is dropped.

const has = (re, s) => re.test(s || '');

// ---------- Role category ----------
const STRONG_DEV =
  /\b(developer|software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|sde|swe|programmer|data scien\w*|data analy\w*|data engineer\w*|machine learning|ml engineer\w*)\b/i;
const NON_TECH =
  /\b(sales|account (executive|manager|director)|business development|recruit(er|ing|ment)?|talent|marketing|finance|financial|accountant|accounts|legal|counsel|hr|human resources|people|customer success|collections?|procurement|controller|audit(or)?|content|designer|design|product manager|program manager|project manager|operations|credit|risk|compliance|payroll|tax|treasury|partnerships?|community|writer|editor|communications|pr|admin(istrative)?|assistant|executive assistant|hardware|mechanical|civil|electrical|chemical|manufacturing|supply chain|logistics|warehouse|pre[\s-]?sales|solutions? (engineer|architect|consultant)|support engineer|field engineer|customer engineer|deployment strategist)\b/i;

const DATA_RE =
  /\b(data scien\w*|data analy\w*|data engineer\w*|analytics engineer\w*|machine learning|ml|ai|artificial intelligence|deep learning|nlp|natural language|computer vision|llm|genai|gen ai|applied scien\w*|research engineer|mlops|quant(itative)? (analyst|developer|researcher))\b/i;
const WEB_RE =
  /\b(full[\s-]?stack|front[\s-]?end|web|react(\.?js)?|angular|vue(\.?js)?|next\.?js|node(\.?js)?|javascript|typescript|mern|mean stack|ui (engineer|developer)|php|django|laravel|wordpress)\b/i;
const SDE_RE =
  /\b(software|sde|swe|sdet|developer|programmer|back[\s-]?end|mobile|android|ios|flutter|react native|devops|sre|site reliability|platform engineer\w*|cloud engineer\w*|infrastructure engineer\w*|systems? (software )?engineer\w*|embedded software|golang|go developer|java|python|c\+\+|rust|application engineer\w*|qa automation|automation (engineer|tester)|test engineer|backend|blockchain|security engineer|member of technical staff|mts)\b/i;
const GENERIC_ENGINEER = /\bengineer(ing)?\b/i;

export function classifyCategory(title = '', tags = []) {
  const t = title;
  const tagText = (tags || []).join(' ');
  if (has(NON_TECH, t) && !has(STRONG_DEV, t)) return null;
  if (has(DATA_RE, t)) return 'data';
  if (has(WEB_RE, t)) return 'web';
  if (has(SDE_RE, t)) return 'sde';
  // Title is vague ("Engineering Intern", "Graduate Engineer"): fall back to tags from aggregators.
  if (tagText) {
    if (has(DATA_RE, tagText)) return 'data';
    if (has(WEB_RE, tagText)) return 'web';
    if (has(SDE_RE, tagText)) return 'sde';
  }
  return null;
}

// ---------- Level ----------
const INTERN_RE =
  /\b(intern|interns|internship|internships|trainee|apprentice(ship)?|co[\s-]?op|summer analyst|industrial training|winter analyst)\b/i;
const SENIOR_RE =
  /\b(senior|sr|staff|principal|lead|leader|manager|mgr|director|head|vp|vice president|architect|chief|distinguished|fellow|avp|consultant ii|expert)\b/i;
const MID_LEVEL_RE =
  /\b(ii|iii|iv|v|l[4-9]|level [2-9]|(sde|swe|engineer|developer|analyst)[\s-]*(2|3|4|ii|iii|iv))\b/i;
const ENTRY_RE =
  /\b(new[\s-]?grad(uate)?s?|graduate|grad|entry[\s-]?level|junior|jr|fresher|freshers|early[\s-]?career|campus|university|college|associate (software|engineer|developer|data|ml|machine|ai|analyst|web)|(software engineer|engineer|developer|sde|swe|analyst|scientist)[\s-]*(i|1)|sde[\s-]*(i|1)|swe[\s-]*(i|1)|0[\s-]*(to|-|–)[\s-]*[12] (years|yrs))\b/i;

// Minimum years of experience asked for in the description, or null if not stated.
export function extractMinYears(text = '') {
  if (!text) return null;
  const re =
    /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|—|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)\b(?:[^.\n]{0,40}?)\bexperience/gi;
  let min = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n <= 20 && (min === null || n < min)) min = n;
  }
  if (min === null && /\b(fresher|freshers|no prior experience|no experience required)\b/i.test(text)) return 0;
  return min;
}

// levelHint comes from sources that tag seniority themselves (Himalayas, Jobicy, The Muse, Personio…):
// 'intern' | 'entry' | 'senior' | null. Title keywords still win over the hint.
export function classifyLevel({ title = '', description = '', employmentType = '', levelHint = null }) {
  if (has(INTERN_RE, title) || /intern/i.test(employmentType || '') || levelHint === 'intern') return 'intern';
  if (has(SENIOR_RE, title) || has(MID_LEVEL_RE, title)) return null;
  if (has(ENTRY_RE, title) || levelHint === 'entry') return 'entry';
  if (levelHint === 'senior') return null;
  const minYears = extractMinYears(description);
  if (minYears !== null && minYears <= 1) return 'entry';
  if (minYears !== null && minYears >= 3) return null;
  return 'unspecified';
}

// ---------- Location ----------
const INDIA_CITIES = [
  ['bengaluru', 'Bengaluru'], ['bangalore', 'Bengaluru'], ['hyderabad', 'Hyderabad'], ['pune', 'Pune'],
  ['mumbai', 'Mumbai'], ['navi mumbai', 'Mumbai'], ['new delhi', 'Delhi'], ['delhi', 'Delhi'],
  ['gurgaon', 'Gurugram'], ['gurugram', 'Gurugram'], ['noida', 'Noida'], ['chennai', 'Chennai'],
  ['kolkata', 'Kolkata'], ['ahmedabad', 'Ahmedabad'], ['jaipur', 'Jaipur'], ['kochi', 'Kochi'],
  ['cochin', 'Kochi'], ['chandigarh', 'Chandigarh'], ['mohali', 'Mohali'], ['indore', 'Indore'],
  ['coimbatore', 'Coimbatore'], ['trivandrum', 'Thiruvananthapuram'], ['thiruvananthapuram', 'Thiruvananthapuram'],
  ['mysore', 'Mysuru'], ['mysuru', 'Mysuru'], ['bhubaneswar', 'Bhubaneswar'], ['nagpur', 'Nagpur'],
  ['lucknow', 'Lucknow'], ['vadodara', 'Vadodara'], ['surat', 'Surat'], ['visakhapatnam', 'Visakhapatnam'],
  ['vizag', 'Visakhapatnam'], ['patna', 'Patna'], ['bhopal', 'Bhopal'], ['guwahati', 'Guwahati'],
];
const CITY_RE = new RegExp(`\\b(${INDIA_CITIES.map(([k]) => k).join('|')})\\b`, 'i');
const INDIA_RE = /\b(india|indian)\b/i;
const REMOTE_RE = /\b(remote|anywhere|work from home|wfh|distributed|fully remote)\b/i;
const APAC_RE = /\b(apac|asia|asia[\s-]?pacific|south asia|ist|indian standard time|utc\s*\+\s*5(:30)?)\b/i;
const WORLD_RE = /\b(worldwide|world[\s-]?wide|anywhere|global|globally|international|all countries|any location)\b/i;

function cityOf(s) {
  const m = (s || '').match(CITY_RE);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return INDIA_CITIES.find(([k]) => k === key)?.[1] ?? null;
}

function tagOne(loc, forceRemote) {
  const s = loc || '';
  const remote = forceRemote || has(REMOTE_RE, s);
  const india = has(INDIA_RE, s) || has(CITY_RE, s);
  if (remote && (india || has(APAC_RE, s))) return { tag: 'remote_india', city: null };
  if (remote) {
    const leftover = s.replace(REMOTE_RE, '').replace(/[^a-z]/gi, '');
    if (has(WORLD_RE, s) || leftover.length === 0) return { tag: 'remote_worldwide', city: null };
    return null; // remote, but restricted to another region (e.g. "Remote - US")
  }
  if (india) return { tag: 'india_onsite', city: cityOf(s) };
  return null;
}

const PRIORITY = { remote_india: 3, india_onsite: 2, remote_worldwide: 1 };

export function classifyLocation({ locations = [], isRemote = false }) {
  const list = locations.filter((l) => l && String(l).trim());
  if (list.length === 0) return isRemote ? { tag: 'remote_worldwide', city: null } : null;
  let best = null;
  for (const loc of list) {
    const r = tagOne(String(loc), Boolean(isRemote) && list.length === 1);
    if (r && (!best || PRIORITY[r.tag] > PRIORITY[best.tag])) best = r;
  }
  return best;
}

// ---------- All together ----------
export function classify(job) {
  const category = classifyCategory(job.title, job.tags);
  if (!category) return null;
  const level = classifyLevel(job);
  if (!level) return null;
  const loc = classifyLocation(job);
  if (!loc) return null;
  return { category, level, locTag: loc.tag, city: loc.city, minYears: extractMinYears(job.description) };
}
