// End to end on an in-memory Postgres: roles, matching, profile, drafts, approval, pipeline, Telegram, delete.
// Outside calls (Telegram, YC, company sites) are faked so the test never touches the network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_BOT_USERNAME = 'knockd_test_bot';
process.env.DISABLE_AUTO_REFRESH = '1';
delete process.env.GEMINI_API_KEY;
delete process.env.DATABASE_URL;

const realFetch = globalThis.fetch;
const telegram = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
  if (u.includes('api.telegram.org')) {
    const method = u.split('/').pop();
    telegram.push({ method, body: init.body ? JSON.parse(init.body) : {} });
    return new Response(JSON.stringify({ ok: true, result: { message_id: telegram.length } }), { status: 200 });
  }
  return new Response('not here', { status: 404 });
};

const { q, closeDb } = await import('../src/db/index.js');
const { sha256 } = await import('../src/lib/secrets.js');
const { upsertCompany, addSignal, storeBoardJobs, selectRelevant, addBoard } = await import('../src/pipeline/store.js');
const { webhookSecret } = await import('../src/telegram/api.js');
const app = (await import('../src/app.js')).default;

let server;
let base;
const TOKEN = 'test-session-token';
const call = async (path, { method = 'GET', body, auth = true, headers = {} } = {}) => {
  const res = await realFetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  const c = await upsertCompany({ name: 'Cosmoserve Space', website: 'https://cosmoserve.test', oneLiner: 'Servicing satellites in orbit', ycBatch: 'Summer 2025' });
  await addSignal(c.id, { kind: 'funding', title: 'Cosmoserve Space raises $6 Mn in seed round', amount: '$6 Mn', round: 'Seed', url: 'https://entrackr.com/x', source: 'entrackr', publishedAt: new Date().toISOString() });
  await q("INSERT INTO contacts (company_id, name, title, email, email_status, guesses, source, source_url) VALUES ($1, 'Ananya Rao', 'Founder/CEO', 'ananya@cosmoserve.test', 'guess', '[\"ananya@cosmoserve.test\",\"ananya.rao@cosmoserve.test\"]', 'yc_page', 'https://www.ycombinator.com/companies/cosmoserve')", [c.id]);
  await q("UPDATE companies SET contacts_checked_at = now() WHERE id = $1", [c.id]);
  const key = await addBoard({ ats: 'ashby', token: 'cosmoserve', label: 'Cosmoserve Space', companyId: c.id });
  const company = (await q('SELECT * FROM companies WHERE id = $1', [c.id]))[0];
  const raw = [
    { externalId: 'a1', title: 'Software Engineer Intern', url: 'https://jobs.ashbyhq.com/cosmoserve/a1', description: 'Write flight software in Python and C++. Interns welcome, no experience required beyond college projects.', locations: ['Bengaluru, India'], postedAt: new Date().toISOString() },
    { externalId: 'a2', title: 'Frontend Developer', url: 'https://jobs.ashbyhq.com/cosmoserve/a2', description: 'React and TypeScript dashboards for mission control. 0-1 years of experience is fine for this role.', locations: ['Remote'], isRemote: true, postedAt: new Date().toISOString() },
    { externalId: 'a3', title: 'Head of Sales', url: 'https://jobs.ashbyhq.com/cosmoserve/a3', description: 'Sell.', locations: ['Remote'], postedAt: new Date().toISOString() },
  ];
  await storeBoardJobs({ key, ats: 'ashby' }, company, selectRelevant(raw, { source: 'ashby', company: 'Cosmoserve Space' }));
  await q("INSERT INTO users (id, google_sub, email, name) VALUES ('u1', 'sub1', 'rahul@example.com', 'Rahul Verma')");
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, 'u1', now() + interval '1 day')", [sha256(TOKEN)]);
});

after(async () => {
  server?.close();
  await closeDb();
  globalThis.fetch = realFetch;
});

test('roles list, grouped by company, with the funding signal; sales role filtered out', async () => {
  const flat = await call('/api/jobs', { auth: false });
  assert.equal(flat.status, 200);
  assert.equal(flat.body.total, 2);
  assert.equal(flat.body.jobs[0].signal.amount, '$6 Mn');
  assert.deepEqual(flat.body.jobs[0].backed, ['yc']);
  const grouped = await call('/api/jobs?group=company&kind=intern', { auth: false });
  assert.equal(grouped.body.totalGroups, 1);
  assert.equal(grouped.body.groups[0].jobs[0].title, 'Software Engineer Intern');
  const search = await call('/api/jobs?q=typescript', { auth: false });
  assert.equal(search.body.total, 1);
  const facets = await call('/api/facets', { auth: false });
  assert.equal(facets.body.total, 2);
  assert.equal(facets.body.yc, 2);
  assert.equal(facets.body.funded, 2);
});

test('company page: signals and roles for everyone, founders only when signed in', async () => {
  const anon = await call('/api/companies/cosmoservespace', { auth: false });
  assert.equal(anon.body.company.name, 'Cosmoserve Space');
  assert.equal(anon.body.contacts, null);
  const signed = await call('/api/companies/cosmoservespace');
  assert.equal(signed.body.contacts.people[0].statusLabel, 'Best guess');
  assert.equal(signed.body.contacts.people[0].source, 'yc_page');
  const fresh = await call('/api/fresh', { auth: false });
  assert.equal(fresh.body.startups[0].signal.kind, 'funding');
});

test('profile + matching with a why-this-fits line', async () => {
  const put = await call('/api/profile', { method: 'PUT', body: { profile: { skills: ['react', 'typescript', 'python', '<script>'.repeat(10)], roles: ['frontend', 'nope'], kind: '', proofs: ['Built a React dashboard used by 300 students'] } } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.profile.roles, ['frontend']);
  assert.equal(put.body.profile.skills.length, 3);
  const m = await call('/api/match', { method: 'POST', body: { skills: ['react', 'typescript'], roles: ['frontend'] } });
  assert.equal(m.body.matches[0].title, 'Frontend Developer');
  assert.ok(m.body.matches[0].fit > 0);
  assert.match(m.body.matches[0].why.line, /(TypeScript and React|React and TypeScript) from your profile are in this role · Frontend, one of the roles you picked · raised \$6 Mn Seed today/);
});

test('draft -> edit (style learned) -> approve without Gmail -> sent myself -> replied -> pipeline', async () => {
  const jobs = (await call('/api/jobs?q=frontend', { auth: false })).body.jobs;
  const d = await call('/api/drafts', { method: 'POST', body: { jobId: jobs[0].id } });
  assert.equal(d.status, 200);
  assert.equal(d.body.status, 'draft');
  assert.equal(d.body.to.email, 'ananya@cosmoserve.test');
  assert.equal(d.body.to.statusLabel, 'Best guess');
  assert.equal(d.body.model, 'template');
  assert.ok(d.body.checks.ok, JSON.stringify(d.body.checks.items.filter((i) => !i.ok)));
  assert.match(d.body.body, /300 students/);

  const again = await call('/api/drafts', { method: 'POST', body: { jobId: jobs[0].id } });
  assert.equal(again.body.id, d.body.id, 'reuses the open draft for the same company');

  const newBody = `Hey Ananya,\n\nCongrats on the $6 Mn seed round. I built a React dashboard used by 300 students, and your mission control dashboards sound like the same problem at a much bigger scale. I'd love to help with the frontend work, even part-time, and can share the code first.\n\nWould a 15-minute call this week work?\n\nIf it's not a fit, just say so and I won't follow up.\n\nCheers,\nRahul`;
  const edited = await call(`/api/drafts/${d.body.id}`, { method: 'PATCH', body: { body: newBody } });
  assert.equal(edited.body.edited, true);
  const me = await call('/api/me');
  assert.equal(me.body.style.greeting, 'Hey');

  const noGmail = await call(`/api/drafts/${d.body.id}/approve`, { method: 'POST', body: { mode: 'send' } });
  assert.equal(noGmail.status, 400);
  assert.equal(noGmail.body.code, 'NO_GMAIL');

  const self = await call(`/api/drafts/${d.body.id}/approve`, { method: 'POST', body: { mode: 'self' } });
  assert.equal(self.body.status, 'sent');
  assert.ok(self.body.send.nextFollowupAt);
  const pipe = await call('/api/pipeline');
  assert.equal(pipe.body.counts.applied, 1);
  await call(`/api/drafts/${d.body.id}/replied`, { method: 'POST' });
  const pipe2 = await call('/api/pipeline');
  assert.equal(pipe2.body.counts.replied, 1);
  assert.equal(pipe2.body.stats.replied, 1);
});

test('cannot edit or approve someone else’s draft; signed-out gets 401', async () => {
  await q("INSERT INTO users (id, name) VALUES ('u2', 'Other')");
  const d = (await q("INSERT INTO drafts (user_id, subject, body, original_body) VALUES ('u2', 's', 'b', 'b') RETURNING id"))[0];
  assert.equal((await call(`/api/drafts/${d.id}`, { method: 'PATCH', body: { body: 'x' } })).status, 404);
  assert.equal((await call(`/api/drafts/${d.id}/approve`, { method: 'POST' })).status, 404);
  assert.equal((await call('/api/drafts', { auth: false })).status, 401);
});

test('Telegram: onboarding, picks, write the email, skip; webhook needs the secret', async () => {
  const hook = (update, secret = webhookSecret()) => call('/api/telegram/webhook', { method: 'POST', body: update, auth: false, headers: { 'X-Telegram-Bot-Api-Secret-Token': secret } });
  const msg = (text, extra = {}) => ({ message: { message_id: 1, chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Priya' }, text, ...extra } });
  const tap = (data) => ({ callback_query: { id: 'cb', data, from: { id: 777, first_name: 'Priya' }, message: { message_id: 5, chat: { id: 777 }, text: 'x' } } });
  const wait = () => new Promise((r) => setTimeout(r, 150));

  assert.equal((await hook(msg('/start'), 'wrong')).status, 401);
  await hook(msg('/start'));
  await wait();
  assert.match(telegram.at(-1).body.text, /You approve every email/);
  await hook(tap('k:intern'));
  await wait();
  await hook(tap('r:backend'));
  await wait();
  await hook(tap('r:done'));
  await wait();
  await hook(tap('w:anywhere'));
  await wait();
  assert.match(telegram.at(-1).body.text, /resume as a PDF/);
  await hook(msg('I know Python, C++ and SQL'));
  await wait();
  assert.match(telegram.at(-1).body.text, /one thing you built/);
  await hook(msg('Built a satellite tracker in Python with 2,000 users'));
  await wait();
  const pick = telegram.filter((t) => t.method === 'sendMessage' && /Software Engineer Intern/.test(t.body.text || '')).at(-1);
  assert.ok(pick, 'sent a pick for the intern role');
  const writeBtn = pick.body.reply_markup.inline_keyboard[0][0];
  assert.match(writeBtn.callback_data, /^d:ashby:a1$/);

  await hook(tap(writeBtn.callback_data));
  await wait();
  const draftMsg = telegram.filter((t) => /Subject:/.test(t.body.text || '')).at(-1);
  assert.match(draftMsg.body.text, /2,000 users/);
  const buttons = draftMsg.body.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.deepEqual(buttons.slice(0, 3), ['✅ Send', '✏️ Edit', '⏭ Skip']);

  const sendCb = draftMsg.body.reply_markup.inline_keyboard[0][0].callback_data;
  await hook(tap(sendCb));
  await wait();
  assert.match(telegram.filter((t) => t.method === 'sendMessage').at(-1).body.text, /connect it once on the web/);

  const skipCb = draftMsg.body.reply_markup.inline_keyboard[0][2].callback_data;
  await hook(tap(skipCb));
  await wait();
  assert.match(telegram.at(-1).body.text, /Skipped/);

  const tgUser = (await q("SELECT * FROM users WHERE telegram_chat_id = '777'"))[0];
  assert.deepEqual(tgUser.profile.roles, ['backend']);
  assert.ok(tgUser.profile.skills.includes('python'));
});

test('linking Telegram to the web account folds in the chat account', async () => {
  const link = await call('/api/telegram/link', { method: 'POST' });
  assert.match(link.body.url, /^https:\/\/t\.me\/knockd_test_bot\?start=L/);
  await call('/api/telegram/webhook', {
    method: 'POST', auth: false, headers: { 'X-Telegram-Bot-Api-Secret-Token': webhookSecret() },
    body: { message: { message_id: 2, chat: { id: 777, type: 'private' }, from: { id: 777 }, text: `/start ${link.body.code}` } },
  });
  await new Promise((r) => setTimeout(r, 200));
  const me = await call('/api/me');
  assert.equal(me.body.telegram.linked, true);
  assert.equal((await q("SELECT COUNT(*)::int AS n FROM users WHERE telegram_chat_id = '777'"))[0].n, 1);
});

test('waitlist and delete my data', async () => {
  assert.equal((await call('/api/waitlist', { method: 'POST', body: { email: 'bad' }, auth: false })).status, 400);
  assert.equal((await call('/api/waitlist', { method: 'POST', body: { email: 'rahul@example.com', kind: 'pro' }, auth: false })).body.position, 1);
  const exp = await call('/api/me/export');
  assert.ok(exp.body.drafts.length >= 1);
  assert.equal((await call('/api/me', { method: 'DELETE' })).body.ok, true);
  assert.equal((await q("SELECT COUNT(*)::int AS n FROM drafts WHERE user_id = 'u1'"))[0].n, 0);
  assert.equal((await q("SELECT COUNT(*)::int AS n FROM waitlist"))[0].n, 0);
  assert.equal((await call('/api/me')).status, 401);
});
