import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail, bodyWords } from '../src/drafts/rules.js';
import { buildFacts, templateEmail, followupEmail, learnStyle, companyFact } from '../src/drafts/write.js';
import { whyLine } from '../src/match.js';

const user = { name: 'Rahul Verma', profile: { skills: ['python', 'react'], proofs: ['Built a Python scraper that pulls daily prices from 120 mandis'], github: 'rahulv', kind: 'intern' } };
const company = { name: 'Cosmoserve Space', one_liner: 'Space debris servicing' };
const job = { title: 'Software Engineer Intern', level: 'intern', tags: [], description: 'Python and C++ for flight software.' };
const signal = { kind: 'funding', amount: '$6 Mn', round: 'Seed', source: 'entrackr', date: new Date().toISOString(), url: 'https://entrackr.com/x' };

test('template emails pass every check, across random variants', () => {
  for (let i = 0; i < 50; i++) {
    const facts = buildFacts({ user, company, job, contact: { name: 'Ananya Rao', title: 'CEO' }, signal });
    const email = templateEmail(facts);
    const c = checkEmail(email, facts);
    assert.ok(c.ok, `${c.items.filter((x) => !x.ok).map((x) => x.label)}\n${email.body}`);
    assert.match(email.body, /^H(i|ey) Ananya,/);
    assert.match(email.body, /\$6 Mn/);
    assert.match(email.body, /120 mandis/);
  }
});

test('checks catch slop, made-up numbers, missing opt-out and bad length', () => {
  const facts = buildFacts({ user, company, job, contact: { name: 'Ananya' }, signal });
  const slop = checkEmail({ subject: 'Application for internship', body: 'Hi Ananya,\n\nI hope this email finds you well. I am passionate about space and built an app with 50,000 users.\n\nRahul' }, facts);
  const failed = Object.fromEntries(slop.items.map((i) => [i.id, i.ok]));
  assert.equal(failed.slop, false);
  assert.equal(failed.facts, false); // 50,000 isn't in the facts
  assert.equal(failed.optout, false);
  assert.equal(failed.length, false);
  assert.equal(failed.subject, false);
});

test('word count ignores greeting, opt-out line and sign-off', () => {
  assert.equal(bodyWords("Hi Sam,\n\none two three four.\n\nIf it's not a fit, just say so and I won't follow up.\n\nThanks,\nRahul"), 4);
});

test('company fact prefers fresh funding, then launch, then YC, then role', () => {
  assert.equal(companyFact(company, job, signal).kind, 'funding');
  assert.equal(companyFact(company, job, { ...signal, date: '2020-01-01' }).kind, 'role');
  assert.equal(companyFact({ ...company, yc_batch: 'S25' }, job, null).kind, 'yc');
  assert.equal(companyFact(company, job, { kind: 'launch', title: 'v2', date: new Date().toISOString() }).kind, 'launch');
});

test('follow-ups are short, polite and pass follow-up checks', () => {
  for (const n of [1, 2, 3]) {
    const { body } = followupEmail({ n, toFirstName: 'Sam', senderFirstName: 'Rahul', companyName: 'Acme', roleTitle: 'Backend Intern' });
    const c = checkEmail({ subject: 'Re: x', body }, {}, { followup: true });
    assert.ok(c.ok, `${n}: ${c.items.filter((x) => !x.ok).map((x) => x.label)}`);
  }
});

test('style is learned from edits', () => {
  const s = learnStyle([{ before: 'x', after: "Hey Sam,\n\nI'd love to help.\n\nCheers,\nRahul" }, { before: 'y', after: 'Hey Jo,\n\nQuick one.\n\nCheers\nRahul' }]);
  assert.equal(s.greeting, 'Hey');
  assert.equal(s.signoff, 'Cheers');
  assert.equal(s.contractions, true);
});

test('why-this-fits line uses only facts', () => {
  assert.equal(whyLine({ skills: ['react', 'node.js'], role: 'frontend', signal: null }), 'React and Node.js from your profile are in this role · Frontend, one of the roles you picked');
  assert.match(whyLine({ skills: [], signal: { kind: 'funding', amount: '$6 Mn', round: 'Seed', date: new Date().toISOString() } }), /^Raised \$6 Mn Seed today$/);
});
