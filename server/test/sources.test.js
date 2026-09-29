import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_BY_ID, SOURCES } from '../src/sources/index.js';
import { SAMPLE } from '../src/sample/sampleData.js';
import { selectRelevant } from '../src/ingest.js';
import { parseHnPost } from '../src/sources/hn.js';
import { levelHintFrom } from '../src/lib/levelHint.js';
import { candidateTokens } from '../src/cli/discover.js';

const kept = (id) => {
  const { target, raw } = SAMPLE[id];
  return selectRelevant(SOURCE_BY_ID[id].parse(raw, target)).map((j) => ({
    id: j.sourceJobId, level: j.level, category: j.category, loc: j.locTag, city: j.city, company: j.company, url: j.url,
  }));
};

test('every source has an id, a label and a sample fixture', () => {
  for (const s of SOURCES) {
    assert.ok(s.id && s.label && typeof s.parse === 'function', s.id);
    assert.ok(SAMPLE[s.id] || s.id === 'smartrecruiters', `missing sample for ${s.id}`);
  }
});

test('we work remotely: "Company: Title" split, US-only dropped', () => {
  const r = kept('weworkremotely');
  assert.equal(r.length, 1);
  assert.equal(r[0].company, 'Bytewise');
  assert.equal(r[0].loc, 'remote_worldwide');
});

test('working nomads and the muse', () => {
  assert.equal(kept('workingnomads')[0].loc, 'remote_india');
  assert.deepEqual(kept('themuse').map((j) => [j.id, j.city]), [['7771', 'Hyderabad']]); // US "Flexible / Remote" dropped
});

test('company ATS boards: workable, recruitee, personio, workday', () => {
  assert.deepEqual(kept('workable').map((j) => [j.level, j.city]), [['intern', 'Noida']]);
  assert.deepEqual(kept('recruitee').map((j) => [j.level, j.city]), [['entry', 'Chennai']]);
  assert.deepEqual(kept('personio').map((j) => [j.level, j.city]), [['intern', 'Pune']]);
  const wd = kept('workday');
  assert.equal(wd.length, 1);
  assert.equal(wd[0].url, 'https://megacorp.wd5.myworkdayjobs.com/External/job/Bangalore/SWE-Intern_R1');
});

test('hacker news: parses pipe format, prefers junior roles, respects US-only', () => {
  const r = kept('hn');
  assert.equal(r.length, 1);
  assert.equal(r[0].company, 'Orbital Labs');
  assert.equal(r[0].city, 'Bengaluru');

  const p = parseHnPost('Acme Corp | Backend Engineer, Data Engineer | Remote (Worldwide) | Full-time | $80k<p>Details</p>');
  assert.equal(p.company, 'Acme Corp');
  assert.equal(p.title, 'Backend Engineer / Data Engineer');
  assert.deepEqual(p.locations, ['Remote (Worldwide)']);
  assert.equal(parseHnPost('No pipes in this reply'), null);
});

test('level hints map each site’s wording', () => {
  assert.equal(levelHintFrom(['Entry-level']), 'entry');
  assert.equal(levelHintFrom('Internship'), 'intern');
  assert.equal(levelHintFrom('student'), 'intern');
  assert.equal(levelHintFrom('entry_level'), 'entry');
  assert.equal(levelHintFrom(['Mid-level']), 'senior');
  assert.equal(levelHintFrom('experienced'), 'senior');
  assert.equal(levelHintFrom(''), null);
});

test('discovery builds sensible board tokens', () => {
  assert.deepEqual(candidateTokens('Razorpay', 'https://razorpay.com'), ['razorpay']);
  assert.deepEqual(candidateTokens('Open Door Labs', 'www.opendoor.io', 'open-door'), ['open-door', 'opendoor', 'open-door'].filter((v, i, a) => a.indexOf(v) === i));
});
