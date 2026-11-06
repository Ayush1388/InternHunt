// Skills from resume text. Same list and rules as client/src/lib/profile.js (the web app reads resumes
// in the browser; the Telegram bot reads them here). Keep the two in step.

const SKILLS = {
  javascript: ['frontend', 'fullstack'], typescript: ['frontend', 'fullstack'], react: ['frontend', 'fullstack'], 'next.js': ['frontend', 'fullstack'],
  vue: ['frontend'], angular: ['frontend'], svelte: ['frontend'], html: ['frontend'], css: ['frontend'], tailwind: ['frontend'],
  'node.js': ['backend', 'fullstack'], express: ['backend'], django: ['backend'], flask: ['backend'], fastapi: ['backend'], spring: ['backend'],
  python: ['backend', 'data', 'ml'], java: ['backend', 'software'], go: ['backend', 'devops'], golang: ['backend'], rust: ['backend', 'software'],
  'c++': ['software'], c: ['software'], 'c#': ['backend', 'software'], '.net': ['backend'], php: ['backend', 'fullstack'], ruby: ['backend'], rails: ['backend'],
  kotlin: ['mobile'], swift: ['mobile'], flutter: ['mobile'], 'react native': ['mobile'], android: ['mobile'], ios: ['mobile'], dart: ['mobile'],
  sql: ['data', 'backend'], postgresql: ['backend', 'data'], mysql: ['backend', 'data'], mongodb: ['backend'], redis: ['backend'], graphql: ['backend', 'frontend'],
  pandas: ['data'], numpy: ['data', 'ml'], tableau: ['data'], 'power bi': ['data'], spark: ['data'], airflow: ['data'], excel: ['data'],
  tensorflow: ['ml'], pytorch: ['ml'], 'scikit-learn': ['ml', 'data'], 'machine learning': ['ml'], 'deep learning': ['ml'], nlp: ['ml'], llm: ['ml'], opencv: ['ml'], 'computer vision': ['ml'],
  docker: ['devops'], kubernetes: ['devops'], aws: ['devops', 'backend'], gcp: ['devops'], azure: ['devops'], terraform: ['devops'], linux: ['devops'], 'ci/cd': ['devops'], jenkins: ['devops'],
  figma: ['design'], 'ui/ux': ['design'], 'user research': ['design'], prototyping: ['design'],
  selenium: ['qa'], cypress: ['qa'], playwright: ['qa'], jest: ['qa', 'frontend'], 'test automation': ['qa'],
  cybersecurity: ['security'], 'penetration testing': ['security'], owasp: ['security'], cryptography: ['security'],
  git: [], 'rest api': ['backend'], microservices: ['backend'], firebase: ['mobile', 'fullstack'], blockchain: ['backend'], solidity: ['backend'],
};

export const ALL_SKILLS = Object.keys(SKILLS);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RES = ALL_SKILLS.map((s) => [s, new RegExp(`(^|[^a-z0-9+#.])${esc(s)}($|[^a-z0-9+#])`, 'i')]);
const AMBIGUOUS = new Set(['go', 'c', 'swift', 'rust', 'spring', 'express', 'ruby']);

export function skillsFromText(text = '') {
  const found = [];
  const t = ` ${text} `;
  for (const [skill, re] of RES) {
    if (AMBIGUOUS.has(skill)) {
      const cased = skill === 'c' ? /(^|[\s,/(])C($|[\s,/)])/.test(t) : new RegExp(`\\b${skill[0].toUpperCase()}${skill.slice(1)}\\b`).test(t);
      if (cased && found.length >= 2) found.push(skill);
    } else if (re.test(t)) found.push(skill);
  }
  return found;
}

export function rolesFromSkills(skills) {
  const score = {};
  for (const s of skills) for (const c of SKILLS[s] || []) score[c] = (score[c] || 0) + 1;
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
}

export function summaryFromText(text = '') {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 25 && !/@|https?:|linkedin|github|\d{6,}/i.test(l));
  return lines.slice(0, 2).join(' ').slice(0, 280);
}

export const githubFromText = (text = '') => {
  const u = text.match(/github\.com\/([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/i)?.[1] || '';
  return u.toLowerCase() === 'orgs' ? '' : u;
};

const esc2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Regex that finds one skill as a whole word in a job's text. */
export const skillRe = (skill) => new RegExp(`(^|[^a-z0-9+#.])${esc2(skill)}($|[^a-z0-9+#])`, 'i');
