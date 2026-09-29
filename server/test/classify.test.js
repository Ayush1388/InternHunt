import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCategory, classifyLevel, classifyLocation, extractMinYears, experienceBucket, detectLanguages, classify } from '../src/lib/classify.js';

test('category: sorts tech roles into specific roles and drops non-tech ones', () => {
  const cases = {
    'Machine Learning Engineer, New Grad': 'ml',
    'AI Engineer - FDE (Forward Deployed Engineer)': 'ml',
    'Data Analyst Intern': 'data',
    'Data Engineer': 'data',
    'Full Stack Engineer - Internal Audit': 'fullstack',
    'Web Developer': 'fullstack',
    'Frontend Developer Intern': 'frontend',
    'React Developer': 'frontend',
    'Backend Engineer': 'backend',
    'Node.js Developer': 'backend',
    'Android Developer': 'mobile',
    'iOS Engineer Intern': 'mobile',
    'DevOps Engineer': 'devops',
    'Site Reliability Engineer': 'devops',
    'SDET': 'qa',
    'QA Automation Intern': 'qa',
    'Security Analyst Intern': 'security',
    'UI/UX Design Intern': 'design',
    'Product Designer': 'design',
    'Software Engineer Intern': 'software',
    'SDE 1': 'software',
  };
  for (const [title, cat] of Object.entries(cases)) assert.equal(classifyCategory(title), cat, title);
  for (const title of ['Account Executive', 'Business Development Representative', 'Hardware Systems Engineer',
    'Customer Solutions Engineer', 'Internal Audit Associate', 'Interior Designer', 'Fashion Designer']) {
    assert.equal(classifyCategory(title), null, title);
  }
  // vague title rescued by aggregator tags
  assert.equal(classifyCategory('Intern', ['javascript', 'react']), 'frontend');
});

test('level: internship or job; people managers dropped', () => {
  assert.equal(classifyLevel({ title: 'Software Engineer Intern' }), 'intern');
  assert.equal(classifyLevel({ title: 'SDE Internship 2027' }), 'intern');
  assert.equal(classifyLevel({ title: 'Backend Engineer', employmentType: 'Intern' }), 'intern');
  assert.equal(classifyLevel({ title: 'Software Engineer - New Grad' }), 'job');
  assert.equal(classifyLevel({ title: 'Senior Backend Engineer' }), 'job');
  assert.equal(classifyLevel({ title: 'Engineering Manager' }), null);
  assert.equal(classifyLevel({ title: 'Director of Engineering' }), null);
  // "internal" must not count as intern
  assert.equal(classifyLevel({ title: 'Internal Tools Engineer' }), 'job');
});

test('experience buckets: none, 1+, 3+, 5+', () => {
  const exp = (title, description = '') => experienceBucket({ title, description });
  assert.equal(exp('Software Engineer Intern', '5 years of experience'), 0);
  assert.equal(exp('Software Engineer - New Grad'), 0);
  assert.equal(exp('Software Engineer'), 0);
  assert.equal(exp('Software Engineer', 'Freshers welcome'), 0);
  assert.equal(exp('Software Engineer', 'Needs 0-1 years of experience'), 0);
  assert.equal(exp('Software Engineer', '1-2 years of experience'), 1);
  assert.equal(exp('SDE-2, Search'), 1);
  assert.equal(exp('Backend Engineer', '3+ years of experience in Go'), 3);
  assert.equal(exp('Senior Backend Engineer'), 3);
  assert.equal(exp('Software Engineer', '5+ years of experience in Go'), 5);
  assert.equal(exp('Principal Engineer (L5)'), 5);
  assert.equal(exp('Staff Software Engineer'), 5);
});

test('languages are detected from title, tags and description', () => {
  assert.deepEqual(detectLanguages({ title: 'Python Developer', description: 'Django, PostgreSQL' }), ['Python', 'SQL']);
  assert.deepEqual(detectLanguages({ title: 'Frontend Intern', tags: ['react', 'typescript'] }), ['JavaScript', 'TypeScript']);
  assert.deepEqual(detectLanguages({ title: 'Backend Engineer', description: 'Java and Spring Boot, some C++' }), ['Java', 'C/C++']);
  assert.deepEqual(detectLanguages({ title: 'Engineer', description: 'We use JavaScript' }), ['JavaScript']);
  assert.deepEqual(detectLanguages({ title: 'Data Analyst', description: 'Python or R, Excel' }), ['Python', 'R']);
});

test('min years parsing', () => {
  assert.equal(extractMinYears('3+ years of professional experience'), 3);
  assert.equal(extractMinYears('2 to 4 years of relevant industry experience'), 2);
  assert.equal(extractMinYears('0–2 yrs experience'), 0);
  assert.equal(extractMinYears('Founded 10 years ago.'), null);
  assert.equal(extractMinYears(''), null);
});

test('location buckets for India-based applicants', () => {
  const loc = (locations, isRemote = false) => classifyLocation({ locations, isRemote });
  assert.deepEqual(loc(['Bengaluru-VTP, India']), { tag: 'india_onsite', city: 'Bengaluru' });
  assert.deepEqual(loc(['Bangalore']), { tag: 'india_onsite', city: 'Bengaluru' });
  assert.deepEqual(loc(['Gurgaon, Haryana']), { tag: 'india_onsite', city: 'Gurugram' });
  assert.equal(loc(['Remote - India']).tag, 'remote_india');
  assert.equal(loc(['Remote - APAC']).tag, 'remote_india');
  assert.equal(loc(['Bengaluru'], true).tag, 'remote_india');
  assert.equal(loc(['Remote - Worldwide']).tag, 'remote_worldwide');
  assert.equal(loc(['Remote']).tag, 'remote_worldwide');
  assert.equal(loc([], true).tag, 'remote_worldwide');
  assert.equal(loc(['Remote - US']), null);
  assert.equal(loc(['Remote - USA Only']), null);
  assert.equal(loc(['Columbus, IN']), null); // Indiana, not India
  assert.equal(loc(['San Francisco, CA']), null);
  // Multiple offices: an Indian office wins over a US one
  assert.equal(loc(['New York, NY', 'Hyderabad, India']).tag, 'india_onsite');
});

test('classify combines everything', () => {
  const r = classify({ title: 'Data Science Intern', locations: ['Remote - India, APAC'], isRemote: true, description: '' });
  assert.deepEqual({ category: r.category, level: r.level, exp: r.exp, locTag: r.locTag }, {
    category: 'data', level: 'intern', exp: 0, locTag: 'remote_india',
  });
  assert.equal(classify({ title: 'Senior Data Scientist', locations: ['Pune'] }).exp, 3);
  assert.equal(classify({ title: 'Data Science Manager', locations: ['Pune'] }), null);
  assert.equal(classify({ title: 'SDE Intern', locations: ['Pune'], description: 'Last date to apply: 15 Dec 2099' }).deadline, null); // too far out
  assert.equal(classify({ title: 'SDE Intern', locations: ['Pune'], description: 'Apply by 15/10/2026' }, ).deadline, '2026-10-15');
  assert.equal(classify({ title: 'Software Engineer Intern', locations: ['London'] }), null);
});
