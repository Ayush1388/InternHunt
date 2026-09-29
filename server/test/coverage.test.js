import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectAts, jobListLinks } from '../src/lib/detectAts.js';
import { extractDeadline, detectStatus, relevantText, loadPrograms } from '../src/programs.js';
import { loadRegistry, namesFrom, careersCandidates, sameCompany } from '../src/discovery.js';
import { SOURCE_BY_ID } from '../src/sources/index.js';
import { SAMPLE } from '../src/sample/sampleData.js';
import { selectRelevant } from '../src/ingest.js';

test('detects the hiring system embedded in a careers page', () => {
  assert.deepEqual(detectAts('<iframe src="https://boards.greenhouse.io/embed/job_board?for=razorpaysoftwareprivatelimited">'), { type: 'greenhouse', token: 'razorpaysoftwareprivatelimited' });
  assert.deepEqual(detectAts('<a href="https://job-boards.greenhouse.io/groww/jobs/123">'), { type: 'greenhouse', token: 'groww' });
  assert.deepEqual(detectAts('<a href="https://jobs.lever.co/cred/abc">'), { type: 'lever', token: 'cred' });
  assert.deepEqual(detectAts('<script src="https://jobs.ashbyhq.com/sarvam/embed"></script>'), { type: 'ashby', token: 'sarvam' });
  assert.deepEqual(detectAts('href="https://apply.workable.com/acme/"'), { type: 'workable', token: 'acme' });
  assert.deepEqual(detectAts('href="https://helio.recruitee.com/o/x"'), { type: 'recruitee', token: 'helio' });
  assert.deepEqual(detectAts('href="https://tessera.jobs.personio.com/"'), { type: 'personio', token: 'tessera', domain: 'com' });
  assert.deepEqual(detectAts('href="https://jobs.smartrecruiters.com/Visa1/123"'), { type: 'smartrecruiters', token: 'Visa1' });
  assert.deepEqual(detectAts('href="https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x"'), {
    type: 'workday', host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite',
  });
  assert.equal(detectAts('<p>No ATS here</p>'), null);
});

test('finds "open roles" links to follow on a careers page', () => {
  const html = '<a href="/about">About</a><a href="/careers/openings">See open roles</a><a href="https://twitter.com/x">Jobs tweet</a>';
  assert.deepEqual(jobListLinks(html, 'https://acme.com/careers'), ['https://acme.com/careers/openings']);
});

test('reads deadlines and open/closed status from official pages', () => {
  const now = new Date('2026-09-29T00:00:00Z');
  assert.equal(extractDeadline('Last Date 1st October, 2026 for Oct–Dec quarter', now), '2026-10-01');
  assert.equal(extractDeadline('Apply by November 15, 2026.', now), '2026-11-15');
  assert.equal(extractDeadline('Last date to apply: 05/10/2026', now), '2026-10-05');
  assert.equal(extractDeadline('Last date was 1 June 2026', now), null); // past
  assert.equal(extractDeadline('Founded on 1 October 2026', now), null); // not a deadline phrase
  assert.equal(detectStatus('Applications are now open for the 2027 batch'), 'open');
  assert.equal(detectStatus('Registrations closed. Results soon.'), 'closed');
  assert.equal(detectStatus('About the programme'), null);
  assert.equal(relevantText('<nav>Home</nav><p>Apply online before the last date</p><footer>© Ministry</footer>'), 'Apply online before the last date');
});

test('program list: official https pages, unique ids, known categories', () => {
  const programs = loadPrograms();
  assert.ok(programs.length >= 40);
  assert.equal(new Set(programs.map((p) => p.id)).size, programs.length);
  for (const p of programs) {
    assert.match(p.url, /^https:\/\//, p.id);
    assert.ok(['government', 'company_program', 'fresher_drive', 'research', 'open_source'].includes(p.category), p.id);
    assert.doesNotMatch(p.url, /unstop|internshala|naukri|linkedin|telegram|whatsapp/i, `${p.id} must be an official page`);
  }
});

test('company registry: 800+ unique companies, each with a careers page or a domain', () => {
  const list = loadRegistry();
  assert.ok(list.length >= 800, `only ${list.length}`);
  assert.equal(new Set(list.map((c) => c.name.toLowerCase())).size, list.length);
  for (const c of list) {
    assert.ok(c.careers || c.domain, c.name);
    if (c.careers) assert.match(c.careers, /^https:\/\//, c.name);
    if (c.domain) assert.match(c.domain, /^[a-z0-9.-]+\.[a-z]{2,}$/, c.name);
    assert.ok(careersCandidates(c).length > 0, c.name);
  }
  assert.ok(list.some((c) => c.name === 'Razorpay'));
});

test('discover accepts names, name;url and bare careers URLs', () => {
  assert.deepEqual(namesFrom('Swiggy, Zomato; https://www.zomato.com/careers\nhttps://careers.example.com/jobs'), [
    { name: 'Swiggy', website: '', careers: '' },
    { name: 'Zomato', website: 'https://www.zomato.com/careers', careers: 'https://www.zomato.com/careers' },
    { name: 'careers.example.com', careers: 'https://careers.example.com/jobs' },
  ]);
});

test('amazon and microsoft feeds keep India tech roles, with experience buckets', () => {
  const kept = (id) => selectRelevant(SOURCE_BY_ID[id].parse(SAMPLE[id].raw, SAMPLE[id].target));
  const a = kept('amazon');
  assert.deepEqual(a.map((j) => [j.title, j.level, j.city, j.trust]), [['Software Dev Engineer Intern', 'intern', 'Bengaluru', 'company']]);
  assert.equal(a[0].url, 'https://www.amazon.jobs/en/jobs/3001001/software-dev-engineer-intern');
  const m = kept('microsoft');
  assert.deepEqual(m.map((j) => [j.title, j.city, j.exp]), [['Software Engineering Intern', 'Hyderabad', 0], ['Principal Software Engineer', 'Bengaluru', 5]]);
});

test('careers URLs are guessed from the domain; name matches are checked', () => {
  assert.deepEqual(careersCandidates({ name: 'Acme', domain: 'acme.in' }), [
    'https://www.acme.in/careers', 'https://careers.acme.in', 'https://acme.in/careers', 'https://www.acme.in/jobs',
  ]);
  assert.deepEqual(careersCandidates({ name: 'Acme', careers: 'https://jobs.acme.in/' }), ['https://jobs.acme.in/']);
  assert.equal(sameCompany('Razorpay Software Private Limited', 'Razorpay'), true);
  assert.equal(sameCompany('Target Corporation', 'Target India'), true);
  assert.equal(sameCompany('Targetprocess Inc', 'Mastercard'), false);
});

test('program status: page dates win, otherwise the usual window', async () => {
  const { programStatus } = await import('../src/programs.js');
  const at = new Date('2026-09-29T10:00:00Z');
  const gsoc = { windows: [[3, 3]] };
  assert.deepEqual(programStatus(gsoc, {}, at), { status: 'closed', deadline: null, estimated: true, opensOn: '2027-03-01', endedOn: '2026-03-31' });
  assert.equal(programStatus(gsoc, {}, new Date('2027-03-10')).status, 'open');
  assert.equal(programStatus(gsoc, {}, new Date('2027-03-10')).deadline, '2027-03-31');
  // Wrapping window (Dec–Jan)
  assert.equal(programStatus({ windows: [[12, 1]] }, {}, new Date('2027-01-15')).deadline, '2027-01-31');
  // Monthly window: NITI Aayog accepts on the 1st–10th
  assert.equal(programStatus({ monthlyDays: [1, 10] }, {}, new Date('2026-10-05')).deadline, '2026-10-10');
  assert.equal(programStatus({ monthlyDays: [1, 10] }, {}, at).opensOn, '2026-10-01');
  // A date stated on the official page beats the usual window, and isn't an estimate
  assert.deepEqual(programStatus(gsoc, { deadline: '2026-10-20' }, at), { status: 'open', deadline: '2026-10-20', estimated: false, opensOn: null, endedOn: null });
  // Page says closed during the usual window
  assert.equal(programStatus({ windows: [[9, 10]] }, { status: 'closed' }, at).status, 'closed');
  assert.equal(programStatus({ rolling: true }, {}, at).status, 'rolling');
  assert.equal(programStatus({}, {}, at).status, 'unknown');
});
