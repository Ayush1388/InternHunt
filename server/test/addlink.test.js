import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'internhunt-add-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.DISCOVERED_PATH = path.join(dir, 'discovered.json');

// Fake web: a careers page embedding Greenhouse, the Greenhouse API, and a program page.
const soon = new Date(Date.now() + 40 * 86400000);
const soonText = soon.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const PAGES = {
  'https://acme.example/careers': '<title>Careers | Acme Robotics</title><iframe src="https://boards.greenhouse.io/embed/job_board?for=acmerobotics"></iframe>',
  'https://boards-api.greenhouse.io/v1/boards/acmerobotics/jobs': JSON.stringify({ jobs: [{ id: 1 }, { id: 2 }] }),
  'https://api.lever.co/v0/postings/zenbyte?mode=json&limit=50': JSON.stringify([{ id: 'a' }]),
  'https://api.mentorship.lfx.linuxfoundation.org/projects/cache/paginate?from=0&size=100&sortby=updatedStamp&order=desc': JSON.stringify({
    hits: { hits: [
      { _source: { projectId: 'p-open', name: 'CNCF - Kubernetes: Improve scheduler tests', status: 'Published', lfProjectName: 'CNCF',
        apprenticeNeeds: { skills: ['Go', 'Kubernetes'] },
        programTerms: [{ active: 'open', applicationStartDate: Date.now() / 1000 - 86400, applicationEndDate: Date.now() / 1000 + 10 * 86400 }] } },
      { _source: { projectId: 'p-closed', name: 'Old project', status: 'Published',
        programTerms: [{ active: 'closed', applicationStartDate: 1, applicationEndDate: 2 }] } },
    ] },
  }),
  'https://fellowship.example.org/2027': '<title>Deep Tech Fellowship 2027 - Apply</title><p>Applications open. Last date: ' + soonText + '</p>',
};
globalThis.fetch = async (url) => {
  const body = PAGES[String(url)];
  if (body === undefined) return new Response('not found', { status: 404 });
  return new Response(body, { status: 200 });
};

const { addFromLink } = await import('../src/addLink.js');
const { loadPrograms, checkPrograms, programsView } = await import('../src/programs.js');
const { db } = await import('../src/db.js');

test('careers page with an embedded board adds the company', async () => {
  const r = await addFromLink('https://acme.example/careers');
  assert.equal(r.kind, 'company');
  assert.equal(r.targetKey, 'greenhouse:acmerobotics');
  assert.equal(r.name, 'Acme Robotics');
  assert.match(r.message, /2 open jobs/);
  const saved = JSON.parse(readFileSync(process.env.DISCOVERED_PATH, 'utf8'));
  assert.deepEqual(saved.greenhouse, [{ token: 'acmerobotics', name: 'Acme Robotics' }]);
  const again = await addFromLink('https://acme.example/careers');
  assert.match(again.message, /already tracked/);
});

test('a direct job link on a hiring system adds that board without opening the page', async () => {
  const r = await addFromLink('https://jobs.lever.co/zenbyte/abc-123', 'ZenByte');
  assert.equal(r.kind, 'company');
  assert.equal(r.targetKey, 'lever:zenbyte');
});

test('any other official page becomes a watched program', async () => {
  const r = await addFromLink('https://fellowship.example.org/2027');
  assert.equal(r.kind, 'program');
  assert.equal(r.name, 'Deep Tech Fellowship 2027');
  const p = loadPrograms().find((x) => x.id === r.id);
  assert.equal(p.category, 'added');
  assert.equal(p.watch, true);
});

test('unofficial or covered links are handled with a clear message', async () => {
  assert.equal((await addFromLink('https://www.youtube.com/watch?v=x')).ok, false);
  assert.match((await addFromLink('https://t.me/somejobs')).message, /isn't an official source/);
  assert.match((await addFromLink('https://in.linkedin.com/jobs/view/1')).message, /official/);
  assert.equal((await addFromLink('https://www.amazon.jobs/en/jobs/1')).kind, 'covered');
  assert.equal((await addFromLink('http://insecure.example')).ok, false);
  assert.equal((await addFromLink('not a link')).ok, false);
  assert.equal((await addFromLink('https://missing.example/page')).ok, false);
});

test('LFX: only projects accepting applications now are listed, with deadlines', async () => {
  await checkPrograms({ force: true, log: () => {} });
  const lfx = programsView().programs.find((p) => p.id === 'lfx');
  assert.deepEqual(lfx.items.map((i) => [i.id, i.org, i.url]), [
    ['p-open', 'CNCF', 'https://mentorship.lfx.linuxfoundation.org/project/p-open'],
  ]);
  assert.match(lfx.items[0].deadline, /^\d{4}-\d{2}-\d{2}$/);
  const added = programsView().programs.find((p) => p.name === 'Deep Tech Fellowship 2027');
  assert.equal(added.deadline, soon.toISOString().slice(0, 10)); // read from the page
  assert.equal(added.status, 'open');
});

test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
