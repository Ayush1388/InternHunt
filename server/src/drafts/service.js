// Drafts and sends: write -> review -> approve -> queue -> send from Gmail -> follow up (max 3) -> stop on reply.
// Nothing is sent without the person approving that exact email.
import { q, one, iso } from '../db/index.js';
import { config } from '../config.js';
import { background } from '../runtime.js';
import { findContacts, contactsFor, STATUS_LABEL } from '../contacts.js';
import { buildFacts, writeEmail, followupEmail, learnStyle } from './write.js';
import { checkEmail } from './rules.js';
import { whyLine } from '../match.js';
import { skillRe } from '../lib/skills.js';
import { firstName } from '../lib/names.js';
import * as gmail from '../gmail.js';

/** Other parts (the Telegram bot) subscribe here to tell people what happened. */
export const hooks = { notify: async () => {} };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const event = (userId, kind, data = {}) => q('INSERT INTO events (user_id, kind, data) VALUES ($1, $2, $3::jsonb)', [userId, kind, JSON.stringify(data)]).catch(() => {});

async function setTracking(userId, jobId, status) {
  if (!jobId) return;
  const order = ['saved', 'drafted', 'applied', 'replied', 'interview', 'offer'];
  const cur = await one('SELECT status FROM tracking WHERE user_id = $1 AND job_id = $2', [userId, jobId]);
  if (cur && order.indexOf(cur.status) >= order.indexOf(status) && order.includes(cur.status)) return; // never move backwards
  await q(
    `INSERT INTO tracking (user_id, job_id, status, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, job_id) DO UPDATE SET status = excluded.status, updated_at = now()`,
    [userId, jobId, status]
  );
}

async function latestSignal(companyId) {
  const s = await one("SELECT * FROM signals WHERE company_id = $1 AND published_at > now() - interval '120 days' ORDER BY published_at DESC LIMIT 1", [companyId]);
  return s ? { kind: s.kind, title: s.title, amount: s.amount, round: s.round, source: s.source, url: s.url, date: iso(s.published_at) } : null;
}

export async function draftView(d) {
  if (!d) return null;
  const [company, job, send] = await Promise.all([
    d.company_id ? one('SELECT id, key, name, domain, website, one_liner, logo_url, yc_batch, backed FROM companies WHERE id = $1', [d.company_id]) : null,
    d.job_id ? one('SELECT id, title, url, level, loc_tag, locations, category FROM jobs WHERE id = $1', [d.job_id]) : null,
    one('SELECT * FROM sends WHERE draft_id = $1 ORDER BY id DESC LIMIT 1', [d.id]),
  ]);
  const contact = d.contact_id ? await one('SELECT * FROM contacts WHERE id = $1', [d.contact_id]) : null;
  return {
    id: d.id,
    kind: d.kind,
    status: d.status,
    subject: d.subject,
    body: d.body,
    edited: d.body !== d.original_body,
    to: {
      name: d.to_name || '', email: d.to_email || '', status: d.email_status || 'none', statusLabel: STATUS_LABEL[d.email_status || 'none'],
      title: contact?.title || '', guesses: contact?.guesses || [], source: contact?.source || null, sourceUrl: contact?.source_url || null,
      linkedin: contact?.linkedin || '', twitter: contact?.twitter || '',
    },
    company: company ? { id: company.id, key: company.key, name: company.name, domain: company.domain, website: company.website, oneLiner: company.one_liner, logo: company.logo_url, ycBatch: company.yc_batch, backed: company.backed ? company.backed.split(',') : [] } : null,
    job: job ? { id: job.id, title: job.title, url: job.url, level: job.level, locTag: job.loc_tag, locations: job.locations, category: job.category } : null,
    why: d.why || '',
    facts: d.facts || {},
    checks: d.checks || {},
    model: d.model,
    contactId: d.contact_id || null,
    error: d.error || null,
    gmailDraftId: d.gmail_draft_id || null,
    send: send ? { id: send.id, status: send.status, sendAfter: iso(send.send_after), sentAt: iso(send.sent_at), repliedAt: iso(send.replied_at), followups: send.followups, nextFollowupAt: iso(send.next_followup_at), error: send.error } : null,
    createdAt: iso(d.created_at),
    updatedAt: iso(d.updated_at),
  };
}

export const getDraft = async (userId, id) => draftView(await one('SELECT * FROM drafts WHERE id = $1 AND user_id = $2', [id, userId]));

export async function listDrafts(userId, { status = '' } = {}) {
  const groups = { review: "('draft')", queued: "('queued','gmail_draft')", sent: "('sent')", skipped: "('skipped','failed')" };
  const where = groups[status] ? `AND status IN ${groups[status]}` : '';
  const rows = await q(`SELECT * FROM drafts WHERE user_id = $1 ${where} ORDER BY updated_at DESC LIMIT 100`, [userId]);
  const counts = Object.fromEntries((await q('SELECT status, COUNT(*)::int AS n FROM drafts WHERE user_id = $1 GROUP BY status', [userId])).map((r) => [r.status, r.n]));
  return { drafts: await Promise.all(rows.map(draftView)), counts };
}

/**
 * Write a new draft for one role (or a company with no role). Re-uses an open draft for the same company.
 * @returns draft view
 */
export async function createDraft(user, { jobId = null, companyId = null, contactId = null, regenerate = false } = {}) {
  const job = jobId ? await one('SELECT * FROM jobs WHERE id = $1', [jobId]) : null;
  if (jobId && !job) throw Object.assign(new Error('Role not found'), { status: 404 });
  const cid = job?.company_id || companyId;
  const company = cid ? await one('SELECT * FROM companies WHERE id = $1', [cid]) : null;
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 });

  if (!regenerate) {
    const open = await one("SELECT * FROM drafts WHERE user_id = $1 AND company_id = $2 AND kind = 'first' AND status IN ('draft','queued','gmail_draft','sent') ORDER BY id DESC LIMIT 1", [user.id, company.id]);
    if (open) return draftView(open);
  }

  // People to write to: look them up if we never have, or not for two weeks.
  let { people } = await contactsFor(company.id);
  const stale = !company.contacts_checked_at || Date.now() - new Date(company.contacts_checked_at).getTime() > 14 * 86400000;
  if (!people.length || stale) {
    try {
      people = (await Promise.race([findContacts(company.id), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 15000))])).people;
    } catch {
      people = (await contactsFor(company.id)).people;
    }
  }
  const contact = (contactId && people.find((p) => p.id === Number(contactId))) || people.find((p) => p.email) || people[0] || null;
  const signal = await latestSignal(company.id);
  const userRow = await one('SELECT * FROM users WHERE id = $1', [user.id]);
  const facts = buildFacts({ user: userRow, company, job, contact, signal });
  const samples = await q('SELECT before, after FROM style_samples WHERE user_id = $1 ORDER BY id DESC LIMIT 3', [user.id]);
  const email = await writeEmail({ facts, style: userRow.style || {}, samples });

  const profile = userRow.profile || {};
  const jobText = job ? `${job.title} ${JSON.stringify(job.tags)} ${JSON.stringify(job.languages)} ${job.description}` : '';
  const why = whyLine({ skills: (profile.skills || []).filter((s) => jobText && skillRe(s).test(jobText)), role: job && (profile.roles || []).includes(job.category) ? job.category : null, signal });

  const row = await one(
    `INSERT INTO drafts (user_id, job_id, company_id, contact_id, kind, to_name, to_email, email_status, subject, body, original_body, why, facts, checks, model)
     VALUES ($1, $2, $3, $4, 'first', $5, $6, $7, $8, $9, $9, $10, $11::jsonb, $12::jsonb, $13) RETURNING *`,
    [user.id, job?.id || null, company.id, contact?.id || null, contact?.name || null, contact?.email || null, contact?.status || 'none', email.subject, email.body, why, JSON.stringify(facts), JSON.stringify(email.checks), email.model]
  );
  if (regenerate) await q("UPDATE drafts SET status = 'skipped', updated_at = now() WHERE user_id = $1 AND company_id = $2 AND status = 'draft' AND id <> $3", [user.id, company.id, row.id]);
  await setTracking(user.id, job?.id, 'drafted');
  event(user.id, 'draft_created', { draft: row.id, model: email.model, checksOk: email.checks.ok });
  return draftView(row);
}

/** Edit subject/body/recipient. Big body edits become style samples ("my writing style"). */
export async function editDraft(userId, id, { subject, body, toEmail, contactId }) {
  const d = await one('SELECT * FROM drafts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!d) throw Object.assign(new Error('Draft not found'), { status: 404 });
  if (!['draft', 'gmail_draft', 'failed'].includes(d.status)) throw Object.assign(new Error('This email has already gone out.'), { status: 409 });
  const next = { subject: subject != null ? String(subject).slice(0, 200) : d.subject, body: body != null ? String(body).slice(0, 5000) : d.body };
  let to = { name: d.to_name, email: d.to_email, status: d.email_status, contactId: d.contact_id };
  if (contactId) {
    const c = await one('SELECT * FROM contacts WHERE id = $1 AND company_id = $2', [contactId, d.company_id]);
    if (c) to = { name: c.name, email: c.email, status: c.email_status, contactId: c.id };
  }
  if (toEmail != null) {
    const e = String(toEmail).trim();
    if (e && !EMAIL_RE.test(e)) throw Object.assign(new Error('That email address doesn’t look right.'), { status: 400 });
    if (e !== to.email) to = { ...to, email: e || null, status: e ? 'user' : 'none' };
  }
  const checks = checkEmail(next, d.facts || {}, { followup: d.kind === 'followup' });
  await q(
    `UPDATE drafts SET subject = $3, body = $4, to_email = $5, email_status = $6, to_name = $7, contact_id = $8, checks = $9::jsonb, status = CASE WHEN status = 'failed' THEN 'draft' ELSE status END, updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [id, userId, next.subject, next.body, to.email, to.status, to.name, to.contactId, JSON.stringify(checks)]
  );
  if (body != null && body.trim() !== d.body.trim() && Math.abs(body.length - d.body.length) + diffWords(d.body, body) > 12) {
    await q('INSERT INTO style_samples (user_id, before, after) VALUES ($1, $2, $3)', [userId, d.body, body]);
    const samples = await q('SELECT before, after FROM style_samples WHERE user_id = $1 ORDER BY id DESC LIMIT 10', [userId]);
    await q('UPDATE users SET style = $2::jsonb WHERE id = $1', [userId, JSON.stringify(learnStyle(samples))]);
    event(userId, 'draft_edited', { draft: id });
  }
  return getDraft(userId, id);
}

const diffWords = (a, b) => {
  const A = new Set(String(a).toLowerCase().split(/\W+/));
  return String(b).toLowerCase().split(/\W+/).filter((w) => w && !A.has(w)).length;
};

export async function skipDraft(userId, id) {
  const d = await one("UPDATE drafts SET status = 'skipped', updated_at = now() WHERE id = $1 AND user_id = $2 AND status IN ('draft','failed','gmail_draft') RETURNING *", [id, userId]);
  if (!d) throw Object.assign(new Error('Nothing to skip'), { status: 409 });
  if (d.kind === 'followup' && d.parent_send_id) await q('UPDATE sends SET stopped = true, next_followup_at = NULL WHERE id = $1', [d.parent_send_id]);
  event(userId, 'draft_skipped', { draft: id });
  return draftView(d);
}

// Start of today in India, where the people using this live (send caps reset at midnight IST).
const IST_DAY = "date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'";

export async function sendsToday(userId) {
  return (await one(`SELECT COUNT(*)::int AS n FROM sends WHERE user_id = $1 AND status IN ('queued','sent') AND COALESCE(sent_at, send_after) >= ${IST_DAY} AND COALESCE(sent_at, send_after) < ${IST_DAY} + interval '1 day'`, [userId])).n;
}

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * The person approved this email. mode: 'send' (queue it from their Gmail) | 'gmail_draft' (put it in Gmail drafts)
 * | 'self' (they sent it themselves, e.g. from their mail app). Returns the draft view.
 */
export async function approveDraft(userId, id, { mode = 'send' } = {}) {
  const d = await one('SELECT * FROM drafts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!d) throw Object.assign(new Error('Draft not found'), { status: 404 });
  if (!['draft', 'gmail_draft', 'failed'].includes(d.status)) throw Object.assign(new Error('This email has already been approved.'), { status: 409 });
  if (!d.to_email || !EMAIL_RE.test(d.to_email)) throw Object.assign(new Error('Add who this goes to first.'), { status: 400, code: 'NO_RECIPIENT' });
  const user = await one('SELECT * FROM users WHERE id = $1', [userId]);
  const root = d.parent_send_id ? await one('SELECT * FROM sends WHERE id = $1', [d.parent_send_id]) : null;

  if (mode === 'self') {
    await one(
      `INSERT INTO sends (draft_id, user_id, company_id, root_send_id, to_email, subject, status, send_after, sent_at, next_followup_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'sent', now(), now(), CASE WHEN $4::int IS NULL THEN now() + ($7 || ' days')::interval END) RETURNING id`,
      [d.id, userId, d.company_id, root?.id || null, d.to_email, d.subject, String(config.sending.followupDays[0])]
    );
    await q("UPDATE drafts SET status = 'sent', updated_at = now() WHERE id = $1", [d.id]);
    await setTracking(userId, d.job_id, 'applied');
    event(userId, 'email_sent', { draft: d.id, via: 'self' });
    return getDraft(userId, id);
  }

  if (!user.gmail_token) throw Object.assign(new Error('Connect Gmail to send from your own account.'), { status: 400, code: 'NO_GMAIL' });

  if (mode === 'gmail_draft') {
    const g = await gmail.createDraft(userId, { to: d.to_email, subject: d.subject, body: d.body, threadId: root?.gmail_thread_id, inReplyTo: root?.rfc_message_id });
    await q("UPDATE drafts SET status = 'gmail_draft', gmail_draft_id = $2, updated_at = now() WHERE id = $1", [d.id, g.draftId]);
    event(userId, 'draft_approved', { draft: d.id, mode });
    return getDraft(userId, id);
  }

  // Send: respect the daily cap and space emails out like a person would.
  const cap = Math.min(user.daily_cap || config.sending.defaultCap, config.sending.maxCap);
  const today = await sendsToday(userId);
  const last = await one("SELECT MAX(send_after) AS t FROM sends WHERE user_id = $1 AND status = 'queued'", [userId]);
  let after;
  if (today >= cap) {
    after = `${IST_DAY} + interval '1 day' + interval '${rand(9 * 60 + 30, 11 * 60)} minutes'`; // tomorrow morning
  } else if (last?.t && new Date(last.t).getTime() > Date.now() - 60_000) {
    after = `GREATEST(now(), '${new Date(last.t).toISOString()}'::timestamptz) + interval '${rand(90, 300)} seconds'`;
  } else {
    after = `now() + interval '${rand(3, 25)} seconds'`;
  }
  await q(
    `INSERT INTO sends (draft_id, user_id, company_id, root_send_id, to_email, subject, status, send_after) VALUES ($1, $2, $3, $4, $5, $6, 'queued', ${after})`,
    [d.id, userId, d.company_id, root?.id || null, d.to_email, d.subject]
  );
  await q("UPDATE drafts SET status = 'queued', error = NULL, updated_at = now() WHERE id = $1", [d.id]);
  event(userId, 'draft_approved', { draft: d.id, mode, capped: today >= cap });
  background(processQueue({ userId }));
  return { ...(await getDraft(userId, id)), capped: today >= cap, cap };
}

/** Send everything that's due. Waits for items due in the next few minutes when there's time. */
export async function processQueue({ userId = null, budgetMs = 200_000 } = {}) {
  const stop = Date.now() + budgetMs;
  let sent = 0;
  for (;;) {
    const due = await q(
      `SELECT * FROM sends WHERE status = 'queued' AND send_after <= now() ${userId ? 'AND user_id = $1' : ''} ORDER BY send_after LIMIT 20`,
      userId ? [userId] : []
    );
    for (const s of due) {
      // Claim it, so two runs never send the same email.
      const claimed = await one("UPDATE sends SET status = 'sending' WHERE id = $1 AND status = 'queued' RETURNING id", [s.id]);
      if (claimed) {
        await sendOne(s);
        sent++;
      }
    }
    const next = await one(`SELECT MIN(send_after) AS t FROM sends WHERE status = 'queued' ${userId ? 'AND user_id = $1' : ''}`, userId ? [userId] : []);
    const wait = next?.t ? new Date(next.t).getTime() - Date.now() : Infinity;
    if (wait === Infinity || Date.now() + Math.max(wait, 0) > stop - 15_000) break;
    await new Promise((r) => setTimeout(r, Math.max(wait, 500)));
  }
  return { sent };
}

async function sendOne(s) {
  const d = await one('SELECT * FROM drafts WHERE id = $1', [s.draft_id]);
  const root = s.root_send_id ? await one('SELECT * FROM sends WHERE id = $1', [s.root_send_id]) : null;
  try {
    if (root?.replied_at || root?.stopped) throw Object.assign(new Error('They already replied, so this follow-up was cancelled.'), { cancel: true });
    const r = await gmail.sendEmail(s.user_id, { to: s.to_email, subject: root ? `Re: ${root.subject.replace(/^re:\s*/i, '')}` : d.subject, body: d.body, threadId: root?.gmail_thread_id, inReplyTo: root?.rfc_message_id });
    const days = config.sending.followupDays;
    await q(
      `UPDATE sends SET status = 'sent', sent_at = now(), gmail_message_id = $2, gmail_thread_id = $3, rfc_message_id = $4,
         next_followup_at = CASE WHEN $5 THEN now() + ($6 || ' days')::interval END WHERE id = $1`,
      [s.id, r.messageId, r.threadId, r.rfcId, !root, String(days[0])]
    );
    if (root) {
      const n = root.followups + 1;
      await q('UPDATE sends SET followups = $2, next_followup_at = CASE WHEN $2 < $3 THEN sent_at + ($4 || \' days\')::interval END WHERE id = $1', [root.id, n, days.length, String(days[Math.min(n, days.length - 1)])]);
    }
    await q("UPDATE drafts SET status = 'sent', error = NULL, updated_at = now() WHERE id = $1", [d.id]);
    await setTracking(s.user_id, d.job_id, 'applied');
    event(s.user_id, 'email_sent', { draft: d.id, followup: Boolean(root) });
    await hooks.notify(s.user_id, { type: 'sent', draftId: d.id, sendId: root?.id || s.id, to: d.to_name || s.to_email, company: (await one('SELECT name FROM companies WHERE id = $1', [d.company_id]))?.name });
  } catch (err) {
    await q("UPDATE sends SET status = 'failed', error = $2 WHERE id = $1", [s.id, err.message.slice(0, 300)]);
    await q('UPDATE drafts SET status = $2, error = $3, updated_at = now() WHERE id = $1', [d.id, err.cancel ? 'skipped' : 'failed', err.message.slice(0, 300)]);
    if (!err.cancel) await hooks.notify(s.user_id, { type: 'failed', draftId: d.id, error: err.message });
  }
}

/** "I got a reply": stops follow-ups and moves the role along the pipeline. */
export async function markReplied(userId, { sendId = null, draftId = null }) {
  let s = sendId ? await one('SELECT * FROM sends WHERE id = $1 AND user_id = $2', [sendId, userId]) : null;
  if (!s && draftId) s = await one('SELECT * FROM sends WHERE draft_id = $1 AND user_id = $2 ORDER BY id LIMIT 1', [draftId, userId]);
  if (!s) throw Object.assign(new Error('Nothing sent for that one yet'), { status: 404 });
  const rootId = s.root_send_id || s.id;
  await q('UPDATE sends SET replied_at = COALESCE(replied_at, now()), stopped = true, next_followup_at = NULL WHERE id = $1', [rootId]);
  await q("UPDATE drafts SET status = 'skipped', updated_at = now() WHERE parent_send_id = $1 AND status = 'draft'", [rootId]);
  const d = await one('SELECT job_id FROM drafts WHERE id = (SELECT draft_id FROM sends WHERE id = $1)', [rootId]);
  await setTracking(userId, d?.job_id, 'replied');
  event(userId, 'reply', { send: rootId });
  return { ok: true };
}

/** Daily: notice replies (Gmail headers only) and write the next follow-up for threads that went quiet. */
export async function runFollowups({ log = console.log } = {}) {
  const due = await q(
    `SELECT s.*, d.to_name, d.company_id, d.job_id, u.name AS uname FROM sends s
     JOIN drafts d ON d.id = s.draft_id JOIN users u ON u.id = s.user_id
     WHERE s.status = 'sent' AND s.root_send_id IS NULL AND s.replied_at IS NULL AND NOT s.stopped
       AND s.next_followup_at IS NOT NULL AND s.next_followup_at <= now() AND s.followups < $1
       AND NOT EXISTS (SELECT 1 FROM drafts f WHERE f.parent_send_id = s.id AND f.status IN ('draft','queued'))
     LIMIT 200`,
    [config.sending.followupDays.length]
  );
  let drafted = 0;
  let replies = 0;
  for (const s of due) {
    if (s.gmail_thread_id) {
      try {
        if (await gmail.threadHasReply(s.user_id, s.gmail_thread_id)) {
          await markReplied(s.user_id, { sendId: s.id });
          await hooks.notify(s.user_id, { type: 'replied', sendId: s.id, to: s.to_name || s.to_email });
          replies++;
          continue;
        }
      } catch {
        /* can't read Gmail right now; still offer the follow-up */
      }
    }
    const company = await one('SELECT name FROM companies WHERE id = $1', [s.company_id]);
    const job = s.job_id ? await one('SELECT title FROM jobs WHERE id = $1', [s.job_id]) : null;
    const n = s.followups + 1;
    const { body } = followupEmail({ n, toFirstName: firstName(s.to_name || ''), senderFirstName: firstName(s.uname || ''), companyName: company?.name || 'your team', roleTitle: job?.title });
    const facts = { followup: n, company: company?.name, role: job?.title };
    const row = await one(
      `INSERT INTO drafts (user_id, job_id, company_id, kind, parent_send_id, to_name, to_email, email_status, subject, body, original_body, facts, checks, model)
       SELECT $1, $2, $3, 'followup', $4, d.to_name, s.to_email, d.email_status, 'Re: ' || s.subject, $5, $5, $6::jsonb, $7::jsonb, 'template'
       FROM sends s JOIN drafts d ON d.id = s.draft_id WHERE s.id = $4 RETURNING *`,
      [s.user_id, s.job_id, s.company_id, s.id, body, JSON.stringify(facts), JSON.stringify(checkEmail({ subject: 'Re', body }, facts, { followup: true }))]
    );
    await q('UPDATE sends SET next_followup_at = NULL WHERE id = $1', [s.id]);
    await hooks.notify(s.user_id, { type: 'followup', draftId: row.id, n });
    drafted++;
  }
  log(`[followups] ${replies} replies noticed, ${drafted} follow-ups drafted`);
  return { replies, drafted };
}
