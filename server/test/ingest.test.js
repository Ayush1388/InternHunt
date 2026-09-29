import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Isolated database for this test run.
const dir = mkdtempSync(path.join(tmpdir(), 'internhunt-test-'));
process.env.DB_PATH = path.join(dir, 'test.db');

const { db } = await import('../src/db.js');
const { selectRelevant, storeTargetJobs } = await import('../src/ingest.js');
const { SOURCE_BY_ID } = await import('../src/sources/index.js');
const { SAMPLE } = await import('../src/sample/sampleData.js');

function ingestAll() {
  const out = {};
  for (const [id, { target, raw }] of Object.entries(SAMPLE)) {
    const parsed = SOURCE_BY_ID[id].parse(raw, target);
    out[id] = { parsed, relevant: selectRelevant(parsed), ...storeTargetJobs(target, selectRelevant(parsed)) };
  }
  return out;
}

test('adapters parse each API shape and only relevant jobs are kept', () => {
  const r = ingestAll();
  assert.equal(r.greenhouse.parsed.length, 7); // incl. an evergreen talent-pool posting that gets blocked
  assert.deepEqual(r.greenhouse.relevant.map((j) => j.sourceJobId).sort(), ['9001', '9004', '9006']);
  assert.deepEqual(r.lever.relevant.map((j) => j.sourceJobId).sort(), ['lv-1', 'lv-2']);
  assert.deepEqual(r.ashby.relevant.map((j) => j.sourceJobId), ['ab-1']);
  assert.deepEqual(r.remotive.relevant.map((j) => j.sourceJobId).sort(), ['501', '502']); // US-only, stale, scam, agency, region-locked all dropped
  assert.equal(r.remoteok.parsed.length, 3); // legal notice skipped
  assert.deepEqual(r.remoteok.relevant.map((j) => j.sourceJobId).sort(), ['7001', '7003']);
  assert.equal(r.remoteok.duplicates, 1); // 7003 duplicates Nimbus Pay's greenhouse posting
});

test('stored rows carry the right labels', () => {
  const row = (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  assert.equal(row('greenhouse:9001').level, 'intern');
  assert.equal(row('greenhouse:9001').city, 'Bengaluru');
  assert.equal(row('greenhouse:9001').description.includes('<p>'), false); // HTML stripped
  assert.equal(row('greenhouse:9004').level, 'entry');
  assert.equal(row('greenhouse:9006').loc_tag, 'remote_india');
  assert.equal(row('lever:lv-1').category, 'web');
  assert.equal(row('lever:lv-2').salary.startsWith('INR'), true);
  assert.equal(row('ashby:ab-1').category, 'data');
  assert.equal(row('remoteok:7001').loc_tag, 'remote_worldwide');
  assert.equal(row('remoteok:7003'), undefined);
});

test('jobs that disappear from a board are marked closed on the next run', () => {
  const { target, raw } = SAMPLE.lever;
  const parsed = SOURCE_BY_ID.lever.parse(raw.filter((j) => j.id !== 'lv-2'), target);
  storeTargetJobs(target, selectRelevant(parsed), { now: new Date(Date.now() + 1000).toISOString() });
  assert.equal(db.prepare("SELECT is_active FROM jobs WHERE id = 'lever:lv-2'").get().is_active, 0);
  assert.equal(db.prepare("SELECT is_active FROM jobs WHERE id = 'lever:lv-1'").get().is_active, 1);
});

test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
