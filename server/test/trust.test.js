import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustCheck } from '../src/lib/trust.js';
import { TRUST, SOURCES } from '../src/sources/index.js';

const base = {
  title: 'Software Engineer Intern',
  company: 'Acme',
  description: 'Build and ship features with our team. You will learn React, Node and Postgres from experienced mentors.',
  locTag: 'india_onsite',
  postedAt: new Date().toISOString(),
  source: 'greenhouse',
};
const check = (patch, trust = 'board') => trustCheck({ ...base, ...patch }, trust);

test('every source has a trust tier; removed sources are gone', () => {
  for (const s of SOURCES) assert.ok(['company', 'board', 'community'].includes(TRUST[s.id]), s.id);
  for (const gone of ['careerjet', 'adzuna', 'jobicy', 'himalayas', 'arbeitnow']) assert.equal(TRUST[gone], undefined);
});

test('clean posting passes', () => {
  assert.deepEqual(check({}), { drop: null, flags: [] });
});

test('scams asking for money are dropped', () => {
  for (const d of [
    'Pay a refundable security deposit of Rs 2000 before joining.',
    'A registration fee of ₹499 is required.',
    'Selected candidates must pay for the certificate.',
    'Training fees of INR 5,000 apply.',
  ]) assert.match(check({ description: d }).drop, /money/, d);
});

test('WhatsApp / Telegram recruiting and personal-email recruiters are dropped', () => {
  assert.match(check({ description: 'Contact HR on WhatsApp 98xxxxxx21 to apply.' }).drop, /WhatsApp/);
  assert.match(check({ description: 'Join our Telegram group for the interview link.' }).drop, /WhatsApp/);
  assert.match(check({ description: 'Send your resume to hr.acmejobs@gmail.com today.' }).drop, /personal email/);
});

test('task scams, ID harvesting and crypto pay are dropped', () => {
  assert.match(check({ description: 'Earn ₹3000 per day from home.' }).drop, /easy-money/);
  assert.match(check({ title: 'Data entry job intern' , description: 'Simple data entry work.' }).drop || '', /easy-money|Scam/);
  assert.match(check({ description: 'Please share your Aadhaar and bank details to confirm.' }).drop, /ID or bank/);
  assert.match(check({ description: 'Salary paid in USDT every week.' }).drop, /crypto/);
});

test('agency, anonymous and evergreen postings are dropped', () => {
  assert.match(check({ description: 'We are hiring on behalf of our client, a top MNC.' }).drop, /Agency/);
  assert.match(check({ company: 'Confidential' }).drop, /named company/);
  assert.match(check({ company: 'Stealth Startup' }).drop, /named company/);
  assert.match(check({ title: 'Engineering Talent Pool 2027' }, 'company').drop, /Evergreen/);
  assert.match(check({ title: 'General Application - Software' }, 'company').drop, /Evergreen/);
});

test('remote jobs quietly limited to another country are dropped', () => {
  const remote = { locTag: 'remote_worldwide' };
  assert.match(check({ ...remote, description: 'Remote role. Must be located in the United States.' }).drop, /restricted/);
  assert.match(check({ ...remote, description: 'You must be authorized to work in the US.' }).drop, /restricted/);
  assert.match(check({ ...remote, description: 'Open to US-based candidates only.' }).drop, /restricted/);
  // …but not when India / worldwide is also mentioned, or it's an office job in India
  assert.equal(check({ ...remote, description: 'US only for now; India applicants welcome from 2027.' }).drop, null);
  assert.equal(check({ ...remote, description: 'We are a US-based startup hiring remotely.' }).drop, null);
  assert.equal(check({ description: 'Our HQ is US-based; this role is in Bengaluru.' }).drop, null);
});

test('age limits and ghost-job flags', () => {
  const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
  assert.match(check({ postedAt: daysAgo(35) }, 'board').drop, /Too old/);
  assert.equal(check({ postedAt: daysAgo(35) }, 'company').drop, null);
  assert.deepEqual(check({ postedAt: daysAgo(60) }, 'company').flags, ['open_long']);
  assert.match(check({ postedAt: daysAgo(130) }, 'company').drop, /Too old/);
  assert.match(check({ postedAt: null }, 'board').drop, /No posting date/);
  assert.equal(check({ postedAt: null }, 'company').drop, null);
});

test('HN posts need a company website', () => {
  assert.match(check({}, 'community').drop, /company website/);
  assert.equal(check({ companyUrl: 'https://acme.dev' }, 'community').drop, null);
});
