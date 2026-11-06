import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFundingHeadline, parseFeed } from '../src/sources/funding.js';
import { ycJobToPosting, shortBatch, batchRank } from '../src/sources/yc.js';
import { ATS } from '../src/sources/ats.js';
import { emailGuesses } from '../src/contacts.js';
import { candidateTokens, sameCompany } from '../src/pipeline/discover.js';
import { companyKey, domainOf } from '../src/lib/names.js';

test('funding headlines: named startup + amount + round', () => {
  const cases = {
    'Spacetech startup Cosmoserve Space raises $6 Mn in seed round': ['Cosmoserve Space', '$6 Mn', 'Seed'],
    'Peppermint Robotics raises Rs 100 Cr in Pre-Series B led by pi Ventures': ['Peppermint Robotics', '₹100 Cr', 'Pre-Series B'],
    'Cleantech Startup altM Raises $10.3 Mn To Scale Manufacturing': ['altM', '$10.3 Mn', ''],
    'Ecommerce Fulfilment Startup Zippee Bags Funding From Haldiram’s': ['Zippee', '', ''],
    'Legend of Toys Raises ₹21 Cr Pre-Series A to Build Premium Play Universe': ['Legend of Toys', '₹21 Cr', 'Pre-Series A'],
  };
  for (const [t, [company, amount, round]] of Object.entries(cases)) assert.deepEqual(parseFundingHeadline(t), { company, amount, round }, t);
});

test('funding headlines: not a raise by one named startup -> skipped', () => {
  for (const t of [
    'Daksham Growth Ventures raises Rs 125 Cr in first close of maiden consumer fund',
    '[Update] Exclusive: RapidClaims In Talks To Raise $30 Mn',
    'Mamaearth Parent Honasa’s Q2 Profit Jumps 87% YoY To ₹73 Cr',
    'MakeMyTrip acquires majority stake in Quick Ride',
    'Startups That Are Funded By Katrina Kaif',
  ]) assert.equal(parseFundingHeadline(t), null, t);
});

test('RSS items parse with CDATA titles', () => {
  const xml = `<rss><channel><item><title><![CDATA[Foo raises $1 Mn in seed round ]]></title><link>https://x.test/a</link><pubDate>Thu, 05 Nov 2026 20:36:42 +0530</pubDate><description><![CDATA[<p>Hello &amp; welcome</p>]]></description></item></channel></rss>`;
  const [it] = parseFeed(xml);
  assert.equal(it.title, 'Foo raises $1 Mn in seed round');
  assert.equal(it.url, 'https://x.test/a');
  assert.equal(it.summary, 'Hello & welcome');
  assert.equal(it.publishedAt, '2026-11-05T15:06:42.000Z');
});

test('YC page jobs become postings; batches sort and shorten', () => {
  const p = ycJobToPosting({ externalId: '1', title: 'Founding Engineer', url: 'https://www.ycombinator.com/companies/x/jobs/1', location: 'Remote', type: 'Full-time', role: 'Full stack', salary: '$100K', minExperience: 'Any (new grads ok)', visa: '', skills: ['React'] }, 'X');
  assert.equal(p.levelHint, 'entry');
  assert.equal(p.isRemote, true);
  assert.ok(p.tags.includes('Full stack'));
  assert.equal(shortBatch('Summer 2025'), 'S25');
  assert.ok(batchRank('Fall 2026') > batchRank('Summer 2026'));
});

test('ATS quirks: Greenhouse company from us, Lever ms timestamps, Ashby unlisted skipped', () => {
  const gh = ATS.greenhouse.parse({ jobs: [{ id: 1, title: 'SWE Intern', absolute_url: 'https://boards.greenhouse.io/a/jobs/1', location: { name: 'Remote' }, content: '&lt;p&gt;Hi&lt;/p&gt;' }] }, 'Acme');
  assert.equal(gh[0].company, 'Acme');
  assert.equal(gh[0].description, 'Hi');
  const lv = ATS.lever.parse([{ id: 'a', text: 'Dev', hostedUrl: 'https://jobs.lever.co/a/a', createdAt: 1730000000000, categories: {} }], 'Acme');
  assert.equal(lv[0].postedAt, new Date(1730000000000).toISOString());
  const ab = ATS.ashby.parse({ jobs: [{ id: '1', title: 'A', jobUrl: 'https://jobs.ashbyhq.com/a/1', isListed: false }, { id: '2', title: 'B', jobUrl: 'https://jobs.ashbyhq.com/a/2' }] }, 'Acme');
  assert.deepEqual(ab.map((j) => j.title), ['B']);
});

test('email guesses in yc-outreach order; names normalised', () => {
  assert.deepEqual(emailGuesses('José Núñez', 'acme.io'), ['jose@acme.io', 'jose.nunez@acme.io', 'jnunez@acme.io', 'josenunez@acme.io']);
  assert.deepEqual(emailGuesses('Cher', 'acme.io'), ['cher@acme.io']);
  assert.deepEqual(emailGuesses('Cher', ''), []);
});

test('names, domains and board-token guesses', () => {
  assert.equal(companyKey('Razorpay Software Pvt. Ltd.'), 'razorpaysoftware');
  assert.equal(companyKey('Venomics AI'), companyKey('Venomics'));
  assert.equal(domainOf('https://www.Acme.io/about'), 'acme.io');
  assert.equal(domainOf('javascript:alert(1)'), '');
  assert.ok(candidateTokens('Acme Labs', 'https://getacme.com', 'acme').includes('getacme'));
  assert.ok(sameCompany('Acme Inc', 'acme'));
  assert.ok(!sameCompany('Acme', 'Globex'));
});
