// "Curated for you": turn a resume / GitHub account into a short list of skills in the browser.
// Only that list (plus the links you give) is ever sent to the server, never the resume text.
import { store } from '@/api';

// Skill → role categories it points to (same ids as lib/roles.js).
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
// Words like "go" and "c" show up everywhere in prose: only count them next to other signs of a tech resume.
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

/** Role categories the skills point to, most common first. */
export function rolesFromSkills(skills) {
  const score = {};
  for (const s of skills) for (const c of SKILLS[s] || []) score[c] = (score[c] || 0) + 1;
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
}

export const looksLikeStudent = (text = '') => /\b(b\.?\s?tech|b\.?\s?e\b|bca|bsc|b\.sc|undergraduate|pursuing|expected graduation|class of 20\d\d|final[\s-]year|third[\s-]year|sophomore|junior year|student)\b/i.test(text);

/** The part of a resume worth showing back to the person: first few meaningful lines. */
export function summaryFromText(text = '') {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 25 && !/@|https?:|linkedin|github|\d{6,}/i.test(l));
  return lines.slice(0, 2).join(' ').slice(0, 280);
}

export function linksFromText(text = '') {
  const github = text.match(/github\.com\/([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})/i)?.[1] || '';
  const linkedin = text.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/in\/[^\s)]+/i)?.[0] || '';
  return { github: github.toLowerCase() === 'orgs' ? '' : github, linkedin };
}

/* ------------------------------------------------------------------ resume files */
export async function textFromFile(file) {
  if (!file) return '';
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB. Try a smaller one.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    // pdf.js is only downloaded the first time someone picks a PDF.
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += `${content.items.map((it) => it.str).join(' ')}\n`;
    }
    if (out.trim().length < 40) throw new Error('This PDF has no readable text (it may be a scan). Paste the text instead.');
    return out;
  }
  if (/\.(txt|md|markdown|rtf)$/.test(name) || file.type.startsWith('text/')) return file.text();
  throw new Error('Use a PDF, .txt or .md file, or paste the text.');
}

/* ------------------------------------------------------------------ GitHub (public API, from the browser) */
const GH_LANG = { 'c++': 'c++', 'c#': 'c#', typescript: 'typescript', javascript: 'javascript', python: 'python', java: 'java', go: 'go', rust: 'rust', kotlin: 'kotlin', swift: 'swift', dart: 'dart', php: 'php', ruby: 'ruby', c: 'c', html: 'html', css: 'css', 'jupyter notebook': 'python', solidity: 'solidity' };

export async function skillsFromGithub(user) {
  const u = String(user || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '');
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u)) throw new Error('That doesn’t look like a GitHub username.');
  const res = await fetch(`https://api.github.com/users/${u}/repos?per_page=100&sort=pushed&type=owner`, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) throw new Error(`No GitHub user called “${u}”.`);
  if (res.status === 403) throw new Error('GitHub is limiting requests right now. Try again in a few minutes, or use your resume.');
  if (!res.ok) throw new Error('Couldn’t reach GitHub.');
  const repos = (await res.json()).filter((r) => !r.fork);
  const langs = {};
  const text = [];
  for (const r of repos) {
    const g = GH_LANG[String(r.language || '').toLowerCase()];
    if (g) langs[g] = (langs[g] || 0) + 1;
    text.push(r.name.replace(/[-_]/g, ' '), r.description || '', ...(r.topics || []));
  }
  const fromLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const skills = [...new Set([...fromLangs, ...skillsFromText(text.join(' \n '))])];
  return { user: u, skills, repos: repos.length };
}

/* ------------------------------------------------------------------ saved profile */
const KEY = 'ih.profile';
export const EMPTY_PROFILE = { skills: [], roles: [], kind: '', loc: [], github: '', portfolio: '', linkedin: '', summary: '', resumeName: '', proofs: [] };
export const profileStore = {
  get: () => ({ ...EMPTY_PROFILE, ...store.get(KEY, {}) }),
  set: (p) => store.set(KEY, p),
  clear: () => store.remove(KEY),
};
export const hasProfile = (p) => Boolean(p && (p.skills.length || p.roles.length));
