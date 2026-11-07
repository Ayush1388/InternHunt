import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.PGLITE_DIR = 'memory://';
const { classifySubject, nextStatus } = await import('../src/tracking.js');
const { closeDb } = await import('../src/db/index.js');

test('subjects are sorted into applied, interview, offer, rejected', () => {
  const cases = {
    'Thanks for applying to Lumen Labs': 'applied',
    'We received your application': 'applied',
    'Interview invitation: Senior Frontend Engineer': 'interview',
    'Next steps for your Quarry Cloud application': 'interview',
    'Your offer from Northwind Labs': 'offer',
    'Offer letter for Software Engineer Intern': 'offer',
    'Update on your Meridian Retail application: we went with other candidates': 'rejected',
    'Unfortunately we will not be moving forward': 'rejected',
    'Lunch on Friday?': null,
  };
  for (const [subject, want] of Object.entries(cases)) assert.equal(classifySubject(subject), want, subject);
});

test('the board only moves forward, and a rejection never undoes an offer', () => {
  assert.equal(nextStatus('saved', 'applied'), 'applied');
  assert.equal(nextStatus('applied', 'applied'), null);
  assert.equal(nextStatus('applied', 'interview'), 'interview');
  assert.equal(nextStatus('interview', 'replied'), null);
  assert.equal(nextStatus('interview', 'rejected'), 'rejected');
  assert.equal(nextStatus('offer', 'rejected'), null);
  assert.equal(nextStatus('applied', 'offer'), 'offer');
});

test('done', async () => { await closeDb(); });
