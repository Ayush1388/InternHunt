import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCategory, classifyLevel, classifyLocation, extractMinYears, classify } from '../src/lib/classify.js';

test('category: picks data, web, sde and drops non-tech roles', () => {
  assert.equal(classifyCategory('Machine Learning Engineer, New Grad'), 'data');
  assert.equal(classifyCategory('Data Analyst Intern'), 'data');
  assert.equal(classifyCategory('AI Engineer - FDE (Forward Deployed Engineer)'), 'data');
  assert.equal(classifyCategory('Full Stack Engineer - Internal Audit'), 'web');
  assert.equal(classifyCategory('Frontend Developer Intern'), 'web');
  assert.equal(classifyCategory('Software Engineer Intern'), 'sde');
  assert.equal(classifyCategory('Backend Engineer'), 'sde');
  assert.equal(classifyCategory('Android Developer'), 'sde');
  assert.equal(classifyCategory('Account Executive'), null);
  assert.equal(classifyCategory('Business Development Representative'), null);
  assert.equal(classifyCategory('Hardware Systems Engineer'), null);
  assert.equal(classifyCategory('Customer Solutions Engineer'), null);
  assert.equal(classifyCategory('Internal Audit Associate'), null);
  // vague title rescued by aggregator tags
  assert.equal(classifyCategory('Intern', ['javascript', 'react']), 'web');
});

test('level: intern, entry, unspecified, and senior excluded', () => {
  assert.equal(classifyLevel({ title: 'Software Engineer Intern' }), 'intern');
  assert.equal(classifyLevel({ title: 'SDE Internship 2027' }), 'intern');
  assert.equal(classifyLevel({ title: 'Backend Engineer', employmentType: 'Intern' }), 'intern');
  assert.equal(classifyLevel({ title: 'Software Engineer - New Grad' }), 'entry');
  assert.equal(classifyLevel({ title: 'Junior Python Developer' }), 'entry');
  assert.equal(classifyLevel({ title: 'SDE 1' }), 'entry');
  assert.equal(classifyLevel({ title: 'Software Engineer I' }), 'entry');
  assert.equal(classifyLevel({ title: 'Associate Software Engineer' }), 'entry');
  assert.equal(classifyLevel({ title: 'Software Engineer', description: 'Needs 0-1 years of experience' }), 'entry');
  assert.equal(classifyLevel({ title: 'Software Engineer', description: 'Freshers welcome' }), 'entry');
  assert.equal(classifyLevel({ title: 'Software Engineer' }), 'unspecified');
  assert.equal(classifyLevel({ title: 'Software Engineer', description: '5+ years of experience in Go' }), null);
  assert.equal(classifyLevel({ title: 'Senior Backend Engineer' }), null);
  assert.equal(classifyLevel({ title: 'SDE-2, Search' }), null);
  assert.equal(classifyLevel({ title: 'Cloud Network Engineer II' }), null);
  assert.equal(classifyLevel({ title: 'Engineering Manager' }), null);
  assert.equal(classifyLevel({ title: 'Principal Engineer (L5)' }), null);
  // "internal" must not count as intern
  assert.equal(classifyLevel({ title: 'Internal Tools Engineer', description: '4 years of experience' }), null);
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
  assert.deepEqual({ category: r.category, level: r.level, locTag: r.locTag }, {
    category: 'data', level: 'intern', locTag: 'remote_india',
  });
  assert.equal(classify({ title: 'Senior Data Scientist', locations: ['Pune'] }), null);
  assert.equal(classify({ title: 'Software Engineer Intern', locations: ['London'] }), null);
});
