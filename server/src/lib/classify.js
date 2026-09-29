// Classifies a normalized posting into: role category, internship vs job, experience asked for,
// programming languages, deadline, and a location bucket relevant to someone applying from India.
// Non-tech roles, people-manager roles, and roles not open to India-based candidates return null.

import { extractDeadline } from './dates.js';

const has = (re, s) => re.test(s || '');

// ---------- Role category ----------
// Checked in this order; the first match on the title wins, then the same on aggregator tags.
export const CATEGORIES = ['backend', 'frontend', 'fullstack', 'mobile', 'data', 'ml', 'devops', 'qa', 'security', 'design', 'software'];

const STRONG_DEV =
  /\b(developer|software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|sde|swe|sdet|programmer|data scien\w*|data analy\w*|data engineer\w*|machine learning|ml engineer\w*|devops|qa|ui|ux|security engineer\w*)\b/i;
const NON_TECH =
  /\b(sales|account (executive|manager|director)|business development|recruit(er|ing|ment)?|talent|marketing|finance|financial|accountant|accounts|legal|counsel|hr|human resources|people|customer success|collections?|procurement|controller|audit(or)?|content|product manager|program manager|project manager|operations|credit|risk|compliance|payroll|tax|treasury|partnerships?|community|writer|editor|communications|pr|admin(istrative)?|assistant|executive assistant|hardware|mechanical|civil|electrical|chemical|manufacturing|supply chain|logistics|warehouse|pre[\s-]?sales|solutions? (engineer|architect|consultant)|support engineer|field engineer|customer engineer|deployment strategist|interior|fashion|instructional|textile|jewell?ery)\b/i;

const RULES = [
  ['design', /\b(ui\s*\/\s*ux|ux\s*\/\s*ui|ux|user experience|user interface design\w*|(product|visual|web|interaction|graphic|motion|ui|digital|brand|app) design(er)?s?|designer|figma)\b/i],
  ['security', /\b(security|cyber\s?security|infosec|appsec|penetration|pen[\s-]?test\w*|soc analyst|vulnerability|threat)\b/i],
  ['qa', /\b(qa|quality assurance|quality engineer\w*|sdet|test(ing)? engineer\w*|software engineer in test|automation test\w*|manual test\w*|tester)\b/i],
  ['devops', /\b(devops|dev ops|sre|site reliability|cloud engineer\w*|platform engineer\w*|infrastructure engineer\w*|kubernetes|systems? engineer\w*|network engineer\w*|devsecops|release engineer\w*|build engineer\w*)\b/i],
  ['data', /\b(data scien\w*|data analy\w*|data engineer\w*|analytics|business intelligence|bi (developer|analyst|engineer)|big data|etl|quant(itative)? (analyst|developer|researcher))\b/i],
  ['ml', /\b(machine learning|ml|ai|artificial intelligence|deep learning|nlp|natural language|computer vision|llm|genai|gen ai|applied scien\w*|research (engineer|scientist)|mlops|reinforcement learning)\b/i],
  ['mobile', /\b(mobile|android|ios|flutter|react native|swift(ui)?|kotlin|app developer)\b/i],
  ['fullstack', /\b(full[\s-]?stack|mern|mean stack|web developer|web engineer\w*|web development)\b/i],
  ['frontend', /\b(front[\s-]?end|react(\.?js)?|angular|vue(\.?js)?|next\.?js|ui (engineer|developer)|javascript developer|typescript developer)\b/i],
  ['backend', /\b(back[\s-]?end|node(\.?js)?|golang|go developer|java developer|python developer|django|spring|php|laravel|\.net|api (engineer|developer)|microservices|server[\s-]?side|ruby|rails)\b/i],
  ['software', /\b(software|sde|swe|developer|programmer|embedded|firmware|member of technical staff|mts|application engineer\w*|blockchain|game (developer|programmer)|c\+\+|java|python|rust)\b/i],
];
const GENERIC_ENGINEER = /\bengineer(ing)?\b/i;

function matchRule(text) {
  for (const [cat, re] of RULES) if (has(re, text)) return cat;
  return null;
}

export function classifyCategory(title = '', tags = []) {
  const t = title;
  if (has(NON_TECH, t) && !has(STRONG_DEV, t)) return null;
  const fromTitle = matchRule(t);
  if (fromTitle) return fromTitle;
  // Title is vague ("Engineering Intern", "Graduate Engineer"): fall back to tags from aggregators.
  const tagText = (tags || []).join(' ');
  const fromTags = tagText ? matchRule(tagText) : null;
  if (fromTags) return fromTags;
  if (has(GENERIC_ENGINEER, t) && tagText && has(STRONG_DEV, tagText)) return 'software';
  return null;
}

// ---------- Languages ----------
const LANGS = [
  ['JavaScript', /\b(javascript|node\.?js|react(\.?js)?|angular|vue(\.?js)?|express\.?js|next\.?js|jquery)\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['Python', /\b(python|django|flask|fastapi|pandas|numpy|pytorch|tensorflow|scikit[\s-]?learn)\b/i],
  ['Java', /\b(java(?![\s-]?script)|spring[\s-]?boot|j2ee|hibernate)\b/i],
  ['C/C++', /(\bc\+\+|\bcpp\b|\bc\s*\/\s*c\+\+|\bembedded c\b|\bc programming\b)/i],
  ['C#/.NET', /(\bc#|\.net\b|\bdotnet\b|\basp\.net\b)/i],
  ['Go', /\b(golang|go (developer|engineer|programming|language))\b/i],
  ['Rust', /\brust\b/i],
  ['Kotlin', /\bkotlin\b/i],
  ['Swift', /\b(swift|swiftui)\b/i],
  ['Dart', /\b(dart|flutter)\b/i],
  ['PHP', /\b(php|laravel)\b/i],
  ['Ruby', /\b(ruby|rails)\b/i],
  ['SQL', /\b(sql|mysql|postgres(ql)?|t-sql|pl\/sql)\b/i],
  ['Scala', /\bscala\b/i],
  ['R', /(\br programming\b|\br language\b|\brstudio\b|\bpython\s*(,|\/|and|or)\s*r\b|\br\s*(,|\/|and|or)\s*python\b)/i],
];
export const LANGUAGES = LANGS.map(([name]) => name);

/** Programming languages mentioned in the title, tags or description. */
export function detectLanguages({ title = '', tags = [], description = '' }) {
  const text = `${title}\n${(tags || []).join(' ')}\n${String(description || '').slice(0, 8000)}`;
  return LANGS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

// ---------- Level and experience ----------
// Every role is an internship ('intern') or a job ('job'). Jobs also get the experience they ask for,
// as a bucket: 0 (none / not stated), 1 (1+ years), 3 (3+ years), 5 (5+ years).
const INTERN_RE =
  /\b(intern|interns|internship|internships|trainee|apprentice(ship)?|co[\s-]?op|summer analyst|industrial training|winter analyst)\b/i;
const PEOPLE_MANAGER_RE = /\b(manager|mgr|director|head|vp|vice president|chief|cto|cio|avp|president)\b/i;
const VERY_SENIOR_RE = /\b(staff|principal|distinguished|lead|architect|fellow|expert)\b/i;
const SENIOR_RE = /\b(senior|sr)\b/i;
const MID_LEVEL_RE =
  /\b(ii|iii|iv|l[4-9]|level [2-9]|(sde|swe|engineer|developer|analyst)[\s-]*(2|3|4|ii|iii|iv))\b/i;
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

const bucketOf = (years) => (years >= 5 ? 5 : years >= 3 ? 3 : years >= 1 ? 1 : 0);

// levelHint comes from sources that tag seniority themselves: 'intern' | 'entry' | 'senior' | null.
/** 'intern' | 'job', or null for people-manager roles we don't list. */
export function classifyLevel({ title = '', employmentType = '', levelHint = null }) {
  if (has(INTERN_RE, title) || /intern/i.test(employmentType || '') || levelHint === 'intern') return 'intern';
  if (has(PEOPLE_MANAGER_RE, title)) return null;
  return 'job';
}

/** Experience bucket (0, 1, 3 or 5) for a job. */
export function experienceBucket(job, level = classifyLevel(job)) {
  const { title = '', description = '', levelHint = null } = job;
  if (level === 'intern') return 0;
  const years = extractMinYears(description);
  if (years !== null) return bucketOf(years);
  if (has(VERY_SENIOR_RE, title)) return 5;
  if (has(SENIOR_RE, title)) return 3;
  if (has(MID_LEVEL_RE, title)) return 1;
  if (has(ENTRY_RE, title) || levelHint === 'entry') return 0;
  if (levelHint === 'senior') return 3;
  return 0;
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
  return {
    category,
    level,
    exp: experienceBucket(job, level),
    languages: detectLanguages(job),
    deadline: job.deadline || extractDeadline(job.description || ''),
    locTag: loc.tag,
    city: loc.city,
    minYears: extractMinYears(job.description),
  };
}
