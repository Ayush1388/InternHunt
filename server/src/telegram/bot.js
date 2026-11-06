// The Telegram bot: onboarding in chat, the morning digest, and SEND / EDIT / SKIP on every draft.
// Updates arrive on POST /api/telegram/webhook (see routes). Callback data: "<action>:<arg>" (64 bytes max).
import { q, one } from '../db/index.js';
import { BRAND, PUBLIC_URL, features } from '../config.js';
import { send, edit, answer, esc, downloadFile, tgEnabled } from './api.js';
import { telegramUser, linkTelegram, saveProfile, settings, updateSettings, deleteUser } from '../users.js';
import { matchJobs } from '../match.js';
import { createDraft, getDraft, editDraft, skipDraft, approveDraft, markReplied, listDrafts, hooks, EMAIL_RE } from '../drafts/service.js';
import { skillsFromText, rolesFromSkills, summaryFromText, githubFromText } from '../lib/skills.js';
import { firstName } from '../lib/names.js';

const ROLES = [
  ['frontend', 'Frontend'], ['backend', 'Backend'], ['fullstack', 'Full-stack'], ['mobile', 'Mobile'], ['data', 'Data'],
  ['ml', 'ML / AI'], ['devops', 'DevOps'], ['design', 'Design'], ['qa', 'QA'], ['security', 'Security'],
];
const PLACES = { india: ['india_onsite', 'remote_india'], remote: ['remote_india', 'remote_worldwide'], anywhere: [] };
const LOC_NAME = { india_onsite: 'India', remote_india: 'Remote (India/APAC)', remote_worldwide: 'Remote', remote_region: 'Remote, one region', abroad_onsite: 'Abroad' };
const web = (path = '') => `${PUBLIC_URL}/#/app/${path}`;

/* ---------------- conversation state */
const getState = (chatId) => one('SELECT state, data FROM bot_state WHERE chat_id = $1', [String(chatId)]);
const setState = (chatId, state, data = {}) =>
  q('INSERT INTO bot_state (chat_id, state, data, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (chat_id) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = now()', [String(chatId), state, JSON.stringify(data)]);
const clearState = (chatId) => q('DELETE FROM bot_state WHERE chat_id = $1', [String(chatId)]);

const ago = (d) => {
  const n = Math.max(0, Math.round((Date.now() - Date.parse(d)) / 86400000));
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n}d ago`;
};

/* ---------------- onboarding */
async function welcome(chatId, user) {
  await send(
    chatId,
    `Hi ${esc(firstName(user.name) || 'there')} 👋 I'm <b>${BRAND}</b>.\n\nEvery morning I'll send you a few startups that just raised money or are hiring, matched to you, with a short email to the founder already written.\n\n<b>You approve every email.</b> Nothing is sent without you tapping Send.\n\nFirst, what are you looking for?`,
    { buttons: [[{ text: 'Internship', callback_data: 'k:intern' }, { text: 'Job', callback_data: 'k:job' }, { text: 'Both', callback_data: 'k:any' }]] }
  );
}

function rolesKeyboard(selected) {
  const rows = [];
  for (let i = 0; i < ROLES.length; i += 2) {
    rows.push(ROLES.slice(i, i + 2).map(([id, label]) => ({ text: `${selected.includes(id) ? '✓ ' : ''}${label}`, callback_data: `r:${id}` })));
  }
  rows.push([{ text: selected.length ? `Done (${selected.length})` : 'Skip', callback_data: 'r:done' }]);
  return rows;
}

async function askWhere(chatId) {
  await send(chatId, 'Where do you want to work?', {
    buttons: [[{ text: '🇮🇳 India', callback_data: 'w:india' }, { text: '🌍 Remote', callback_data: 'w:remote' }, { text: 'Anywhere', callback_data: 'w:anywhere' }]],
  });
}

async function askResume(chatId) {
  await setState(chatId, 'resume');
  await send(chatId, 'Now send me your <b>resume as a PDF</b>, or paste your skills (e.g. <i>React, Node.js, Python</i>).\n\nI only keep the list of skills and a one-line summary, never the file.', { reply: true });
}

async function askProof(chatId) {
  await setState(chatId, 'proof');
  await send(
    chatId,
    'Last one, and it matters most: <b>one thing you built</b>, in a sentence, with a real number if you have one.\n\n<i>e.g. Built a React Native app for my college canteen, 600 students use it</i>\n\nEvery email uses this. I never make things up about you.',
    { reply: true, buttons: [[{ text: 'Skip for now', callback_data: 'p:skip' }]] }
  );
}

async function finishOnboarding(chatId, user) {
  await clearState(chatId);
  const f = features();
  const lines = [`You're set ✅ I'll message you every morning around 8:30.`];
  if (f.gmail && !user.gmail_token) lines.push(`\nTo send emails from your own Gmail, sign in on the web and connect Gmail (drafts and sending only):`);
  await send(chatId, lines.join('\n'), f.gmail && !user.gmail_token ? { buttons: [[{ text: 'Connect Gmail', url: web('settings') }]] } : {});
  await sendPicks(chatId, user, { limit: 3, intro: 'Here are a few to start with:' });
}

/* ---------------- picks and drafts as messages */
function pickCard(i, m) {
  const sig = m.signal;
  const signal = sig?.kind === 'funding' ? `💸 Raised ${esc(sig.amount || 'funding')}${sig.round ? ` ${esc(sig.round)}` : ''} · ${ago(sig.date)}`
    : sig?.kind === 'launch' ? `🚀 Launched ${ago(sig.date)}: ${esc(sig.title)}`
      : m.ycBatch ? `🟧 YC ${esc(m.ycBatch)}` : '';
  const where = LOC_NAME[m.locTag] || '';
  return [
    `<b>${i}. ${esc(m.company)}</b>${m.oneLiner ? ` · ${esc(m.oneLiner)}` : ''}`,
    signal,
    `Hiring: <a href="${esc(m.url)}">${esc(m.title)}</a>${where ? ` · ${where}` : ''}`,
    m.why?.line ? `<i>${esc(m.why.line)}</i>` : '',
  ].filter(Boolean).join('\n');
}

export async function sendPicks(chatId, user, { limit = 5, intro = '', onlyNew = false } = {}) {
  const u = await one('SELECT * FROM users WHERE id = $1', [user.id]);
  const shown = (await q('SELECT job_id FROM digest_items WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 400', [u.id])).map((r) => r.job_id);
  const res = await matchJobs(u.profile || {}, {
    limit, uid: u.id, excludeIds: shown,
    onlyNewSince: onlyNew ? (u.last_digest_at ? new Date(u.last_digest_at).toISOString() : new Date(Date.now() - 3 * 86400000).toISOString()) : null,
    userVector: u.embedding ? String(u.embedding) : null,
  });
  const picks = res.matches;
  if (!picks.length) {
    if (!onlyNew) await send(chatId, 'Nothing new that fits you right now. I’ll check again tomorrow morning.');
    return 0;
  }
  if (intro) await send(chatId, intro);
  let i = 1;
  for (const m of picks) {
    await send(chatId, pickCard(i++, m), {
      buttons: [[{ text: '✍️ Write the email', callback_data: `d:${m.id}`.slice(0, 64) }, { text: 'Skip', callback_data: `x:${m.id}`.slice(0, 64) }]],
    });
    await q('INSERT INTO digest_items (user_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [u.id, m.id]);
  }
  return picks.length;
}

function draftText(d) {
  const to = d.to.email
    ? `<b>To ${esc(d.to.name || d.to.email)}</b>${d.to.title ? ` (${esc(d.to.title)}${d.company ? `, ${esc(d.company.name)}` : ''})` : d.company ? ` at ${esc(d.company.name)}` : ''}\n${esc(d.to.email)} · ${esc(d.to.statusLabel || '')}`
    : `<b>${d.company ? esc(d.company.name) : 'Draft'}</b>\n⚠️ No email address yet. Tap “Change recipient” to add one.`;
  const checks = (d.checks.items || []).map((c) => `${c.ok ? '✓' : '✗'} ${esc(c.label)}`).join('\n');
  return `✉️ ${to}\n\n<b>Subject:</b> ${esc(d.subject)}\n\n<blockquote>${esc(d.body)}</blockquote>\n${checks}${d.why ? `\n\n<i>Why this one: ${esc(d.why)}</i>` : ''}`;
}

const draftButtons = (d) => [
  [{ text: '✅ Send', callback_data: `s:${d.id}` }, { text: '✏️ Edit', callback_data: `e:${d.id}` }, { text: '⏭ Skip', callback_data: `k2:${d.id}` }],
  [{ text: '📧 Change recipient', callback_data: `t:${d.id}` }, { text: '🔁 Rewrite', callback_data: `rw:${d.id}` }],
];

async function showDraft(chatId, d, messageId = null) {
  const text = draftText(d);
  if (messageId) return edit(chatId, messageId, text, { buttons: draftButtons(d) });
  return send(chatId, text, { buttons: draftButtons(d) });
}

/* ---------------- incoming messages */
async function onMessage(msg) {
  const chatId = msg.chat.id;
  if (msg.chat.type !== 'private') return; // one person, one chat
  const text = String(msg.text || '').trim();
  const [cmd, arg] = text.startsWith('/') ? text.slice(1).split(/\s+/, 2) : [null, null];
  const command = cmd?.replace(/@.*$/, '').toLowerCase();

  if (command === 'start') {
    if (arg && arg.startsWith('L')) {
      const linked = await linkTelegram(arg, chatId, msg.from);
      if (linked) {
        await send(chatId, `Linked to your ${BRAND} account (${esc(linked.email || linked.name)}) ✅\nYour profile, drafts and pipeline are shared between here and the web.`);
        if ((linked.profile?.skills || []).length) return sendPicks(chatId, linked, { limit: 3, intro: 'Here are a few for you:' });
        return welcome(chatId, linked);
      }
      await send(chatId, 'That link has expired. Open Settings on the web and tap “Connect Telegram” again.');
    }
    const user = await telegramUser(chatId, msg.from);
    if ((user.profile?.skills || []).length || (user.profile?.roles || []).length) {
      return send(chatId, `Welcome back, ${esc(firstName(user.name))}. Tap /today for today’s picks or /drafts for emails waiting for you.`);
    }
    return welcome(chatId, user);
  }

  const user = await telegramUser(chatId, msg.from);
  const state = await getState(chatId);

  if (command) {
    await clearState(chatId);
    switch (command) {
      case 'today':
        return sendPicks(chatId, user, { limit: 5, intro: 'Today’s picks for you:' });
      case 'drafts': {
        const { drafts } = await listDrafts(user.id, { status: 'review' });
        if (!drafts.length) return send(chatId, 'No emails waiting. Tap /today and “Write the email” on one you like.');
        await send(chatId, `${drafts.length} email${drafts.length === 1 ? '' : 's'} waiting for your OK:`);
        for (const d of drafts.slice(0, 5)) await showDraft(chatId, d);
        return;
      }
      case 'profile': {
        const p = user.profile || {};
        return send(
          chatId,
          `<b>What I know about you</b>\nLooking for: ${p.kind === 'intern' ? 'internships' : p.kind === 'job' ? 'jobs' : 'internships and jobs'}\nRoles: ${esc((p.roles || []).join(', ') || 'any')}\nSkills: ${esc((p.skills || []).join(', ') || 'none yet')}\nProof: ${esc((p.proofs || [])[0] || 'none yet')}\n\nSend a new PDF any time to update it.`,
          { buttons: [[{ text: 'Change roles', callback_data: 'k:again' }, { text: 'Change proof', callback_data: 'p:again' }]] }
        );
      }
      case 'settings': {
        const s = await settings(user.id);
        return send(
          chatId,
          `<b>Settings</b>\nDaily email limit: ${s.dailyCap} (sent today: ${s.sentToday})\nMorning picks: ${s.paused ? 'paused' : 'on'}\nGmail: ${s.gmail.connected ? esc(s.gmail.email || 'connected') : 'not connected'}\n\n<i>/cap 10 sets the limit (1–${s.maxCap}).</i>`,
          { buttons: [[{ text: s.paused ? '▶️ Resume picks' : '⏸ Pause picks', callback_data: s.paused ? 'set:resume' : 'set:pause' }], [{ text: 'Open settings on the web', url: web('settings') }]] }
        );
      }
      case 'cap': {
        const n = Number(arg);
        if (!n) return send(chatId, 'Send it like this: <code>/cap 10</code>');
        const s = await updateSettings(user.id, { dailyCap: n });
        return send(chatId, `Daily limit set to ${s.dailyCap}. Keeping it low protects your Gmail from spam flags.`);
      }
      case 'pause':
        await updateSettings(user.id, { paused: true });
        return send(chatId, 'Paused. No morning picks until you send /resume.');
      case 'resume':
        await updateSettings(user.id, { paused: false });
        return send(chatId, 'Back on. See you tomorrow morning.');
      case 'privacy':
        return send(
          chatId,
          `<b>What ${BRAND} stores</b>\n• From your resume: the list of skills and a one-line summary. Never the file.\n• Your proof points, the drafts you write and what you sent.\n• For each founder contact: where we found it (YC page, their website, or a labelled guess).\n\nWe never send an email you didn't approve. /delete removes everything.\n\nFull policy: ${PUBLIC_URL}/#/privacy`
        );
      case 'delete':
        return send(chatId, 'This deletes your profile, drafts, pipeline and Gmail connection. It can’t be undone.', {
          buttons: [[{ text: 'Yes, delete everything', callback_data: 'del:yes' }, { text: 'Cancel', callback_data: 'del:no' }]],
        });
      case 'help':
      default:
        return send(
          chatId,
          `<b>How ${BRAND} works</b>\n1. Every morning: startups that just raised, launched or are hiring, matched to you.\n2. Tap “Write the email”: a short note to the founder using one real fact about them and one real thing you built.\n3. Tap <b>Send</b>, <b>Edit</b> or <b>Skip</b>. Nothing goes out without your tap.\n4. Up to 3 polite follow-ups, stopped the moment they reply.\n\n/today · /drafts · /profile · /settings · /privacy · /delete`
        );
    }
  }

  // Free text / files, depending on what we asked for.
  if (msg.document) return onResumeFile(chatId, user, msg.document);
  if (state?.state === 'resume' && text) return onResumeText(chatId, user, text);
  if (state?.state === 'proof' && text) {
    const p = user.profile || {};
    await saveProfile(user.id, { ...p, proofs: [text, ...(p.proofs || []).filter((x) => x !== text)].slice(0, 5) });
    if (state.data?.again) {
      await clearState(chatId);
      return send(chatId, 'Saved. Your next emails will use it.');
    }
    return finishOnboarding(chatId, await one('SELECT * FROM users WHERE id = $1', [user.id]));
  }
  if (state?.state === 'edit' && text) {
    const d = await editDraft(user.id, state.data.draftId, { body: text });
    await clearState(chatId);
    await send(chatId, 'Updated. Here it is:');
    return showDraft(chatId, d);
  }
  if (state?.state === 'recipient' && text) {
    if (!EMAIL_RE.test(text)) return send(chatId, 'That doesn’t look like an email address. Try again, or /drafts to go back.', { reply: true });
    const d = await editDraft(user.id, state.data.draftId, { toEmail: text });
    await clearState(chatId);
    return showDraft(chatId, d);
  }
  return send(chatId, 'Tap /today for today’s picks, /drafts for emails waiting for you, or /help.');
}

async function onResumeFile(chatId, user, doc) {
  if (!/pdf/i.test(doc.mime_type || '') && !/\.pdf$/i.test(doc.file_name || '')) return send(chatId, 'Send it as a PDF, or paste your skills as text.');
  if (doc.file_size > 8 * 1024 * 1024) return send(chatId, 'That file is over 8 MB. Try a smaller PDF.');
  await send(chatId, 'Reading it…');
  let text = '';
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await downloadFile(doc.file_id)));
    text = (await extractText(pdf, { mergePages: true })).text || '';
  } catch {
    return send(chatId, 'I couldn’t read that PDF. Paste your skills as text instead.');
  }
  if (text.trim().length < 40) return send(chatId, 'That PDF has no readable text (it may be a scan). Paste your skills as text instead.');
  return onResumeText(chatId, user, text, doc.file_name);
}

async function onResumeText(chatId, user, text, fileName = '') {
  const skills = skillsFromText(text);
  if (!skills.length) return send(chatId, 'I didn’t spot any skills I know. Try a list like: <i>React, Node.js, Python, SQL</i>', { reply: true });
  const p = user.profile || {};
  const merged = [...new Set([...(p.skills || []), ...skills])];
  const roles = (p.roles || []).length ? p.roles : rolesFromSkills(merged);
  await saveProfile(user.id, { ...p, skills: merged, roles, summary: p.summary || summaryFromText(text), github: p.github || githubFromText(text), resumeName: fileName || p.resumeName });
  await send(chatId, `Got it: <b>${esc(skills.slice(0, 12).join(', '))}</b>${skills.length > 12 ? ` and ${skills.length - 12} more` : ''}.`);
  const fresh = await one('SELECT * FROM users WHERE id = $1', [user.id]);
  if (!(fresh.profile?.proofs || []).length) return askProof(chatId);
  await clearState(chatId);
  return send(chatId, 'Profile updated. /today shows what fits now.');
}

/* ---------------- button taps */
async function onCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const [action, ...rest] = String(cb.data || '').split(':');
  const arg = rest.join(':');
  const user = await telegramUser(chatId, cb.from);
  const p = user.profile || {};

  switch (action) {
    case 'k': {
      if (arg === 'again') {
        await answer(cb.id);
        return send(chatId, 'What are you looking for?', { buttons: [[{ text: 'Internship', callback_data: 'k:intern' }, { text: 'Job', callback_data: 'k:job' }, { text: 'Both', callback_data: 'k:any' }]] });
      }
      await saveProfile(user.id, { ...p, kind: arg === 'any' ? '' : arg });
      await answer(cb.id);
      await edit(chatId, messageId, `Looking for: <b>${arg === 'intern' ? 'internships' : arg === 'job' ? 'jobs' : 'internships and jobs'}</b>`);
      return send(chatId, 'Which roles? Tap all that fit, then Done.', { buttons: rolesKeyboard(p.roles || []) });
    }
    case 'r': {
      if (arg === 'done') {
        await answer(cb.id);
        await edit(chatId, messageId, `Roles: <b>${esc((p.roles || []).map((r) => ROLES.find(([id]) => id === r)?.[1] || r).join(', ') || 'any')}</b>`);
        return askWhere(chatId);
      }
      const roles = (p.roles || []).includes(arg) ? p.roles.filter((r) => r !== arg) : [...(p.roles || []), arg];
      await saveProfile(user.id, { ...p, roles });
      await answer(cb.id);
      return edit(chatId, messageId, 'Which roles? Tap all that fit, then Done.', { buttons: rolesKeyboard(roles) });
    }
    case 'w': {
      await saveProfile(user.id, { ...p, loc: PLACES[arg] || [] });
      await answer(cb.id);
      await edit(chatId, messageId, `Where: <b>${arg === 'india' ? 'India' : arg === 'remote' ? 'Remote' : 'Anywhere'}</b>`);
      if ((p.skills || []).length) return (p.proofs || []).length ? finishOnboarding(chatId, user) : askProof(chatId);
      return askResume(chatId);
    }
    case 'p': {
      await answer(cb.id);
      if (arg === 'again') {
        await setState(chatId, 'proof', { again: true });
        return send(chatId, 'Send me one thing you built, in a sentence:', { reply: true });
      }
      return finishOnboarding(chatId, user);
    }
    case 'x': {
      await q("UPDATE digest_items SET action = 'skip' WHERE user_id = $1 AND job_id = $2", [user.id, arg]);
      await answer(cb.id, 'Skipped');
      return edit(chatId, messageId, `<s>${esc(cb.message.text?.split('\n')[0] || 'Skipped')}</s>`);
    }
    case 'd': {
      await answer(cb.id, 'Writing it…');
      await q("UPDATE digest_items SET action = 'draft' WHERE user_id = $1 AND job_id = $2", [user.id, arg]);
      try {
        const d = await createDraft(user, { jobId: arg });
        return showDraft(chatId, d);
      } catch (err) {
        return send(chatId, `Couldn’t write that one: ${esc(err.message)}`);
      }
    }
    case 'rw': {
      await answer(cb.id, 'Rewriting…');
      const old = await getDraft(user.id, Number(arg));
      if (!old) return;
      const d = await createDraft(user, { jobId: old.job?.id, companyId: old.company?.id, regenerate: true });
      return showDraft(chatId, d, messageId);
    }
    case 'e': {
      await answer(cb.id);
      const d = await getDraft(user.id, Number(arg));
      if (!d) return;
      await setState(chatId, 'edit', { draftId: d.id });
      await send(chatId, 'Copy the email, change what you like, and send it back to me as one message:');
      return send(chatId, `<code>${esc(d.body)}</code>`, { reply: true });
    }
    case 't': {
      await answer(cb.id);
      const d = await getDraft(user.id, Number(arg));
      if (!d) return;
      const guesses = (d.to.guesses || []).filter((g) => g !== d.to.email).slice(0, 3);
      await setState(chatId, 'recipient', { draftId: d.id });
      return send(chatId, `Who should this go to? Send an email address${guesses.length ? `, or tap one of the other guesses` : ''}.`, {
        buttons: guesses.length ? guesses.map((g) => [{ text: g, callback_data: `tg:${d.id}:${g}`.slice(0, 64) }]) : undefined,
        reply: !guesses.length,
      });
    }
    case 'tg': {
      const [id, ...e] = arg.split(':');
      await answer(cb.id);
      await clearState(chatId);
      const d = await editDraft(user.id, Number(id), { toEmail: e.join(':') });
      return showDraft(chatId, d);
    }
    case 'k2': {
      await answer(cb.id, 'Skipped');
      try {
        await skipDraft(user.id, Number(arg));
      } catch {
        /* already gone */
      }
      return edit(chatId, messageId, '⏭ Skipped. It won’t be sent.');
    }
    case 's': {
      try {
        const d = await approveDraft(user.id, Number(arg), { mode: 'send' });
        await answer(cb.id, 'Approved');
        const when = d.capped ? `You've hit today's limit of ${d.cap}, so it goes tomorrow morning.` : 'Sending from your Gmail in a moment.';
        return edit(chatId, messageId, `✅ Approved: <b>${esc(d.subject)}</b> to ${esc(d.to.email)}\n${when}`);
      } catch (err) {
        if (err.code === 'NO_GMAIL') {
          await answer(cb.id);
          return send(chatId, 'To send from your own Gmail, connect it once on the web. Or send it yourself and tell me, so I can track follow-ups.', {
            buttons: [[{ text: 'Connect Gmail', url: web('settings') }], [{ text: 'I sent it myself', callback_data: `self:${arg}` }]],
          });
        }
        if (err.code === 'NO_RECIPIENT') {
          await answer(cb.id);
          await setState(chatId, 'recipient', { draftId: Number(arg) });
          return send(chatId, 'Who should this go to? Send me their email address.', { reply: true });
        }
        return answer(cb.id, err.message, true);
      }
    }
    case 'self': {
      const d = await approveDraft(user.id, Number(arg), { mode: 'self' }).catch((err) => ({ error: err.message }));
      await answer(cb.id, d.error || 'Marked as sent');
      if (!d.error) await send(chatId, `Noted. I’ll remind you to follow up if ${esc(d.to.name || 'they')} doesn’t reply.`, { buttons: [[{ text: '🎉 I got a reply', callback_data: `rep:${d.id}` }]] });
      return;
    }
    case 'rep': {
      await markReplied(user.id, { draftId: Number(arg) }).catch(() => {});
      await answer(cb.id, 'Nice!');
      return send(chatId, '🎉 Great. Follow-ups stopped, and it’s moved to Replied in your pipeline.');
    }
    case 'set': {
      await updateSettings(user.id, { paused: arg === 'pause' });
      await answer(cb.id, arg === 'pause' ? 'Paused' : 'Resumed');
      return edit(chatId, messageId, arg === 'pause' ? '⏸ Morning picks paused. /resume to turn them back on.' : '▶️ Morning picks are on.');
    }
    case 'del': {
      await answer(cb.id);
      if (arg !== 'yes') return edit(chatId, messageId, 'Cancelled. Nothing was deleted.');
      await deleteUser(user.id);
      return edit(chatId, messageId, 'Done. Everything is deleted. Send /start if you ever want to come back.');
    }
    default:
      return answer(cb.id);
  }
}

/** Entry point for one webhook update. Errors are logged, never thrown at Telegram (it would retry forever). */
export async function handleUpdate(update) {
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (err) {
    console.error('[telegram] update failed', err);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) await send(chatId, 'Something went wrong on my side. Try again in a minute.').catch(() => {});
  }
}

/** The morning digest for everyone who has the bot. */
export async function runDigest({ log = console.log } = {}) {
  if (!tgEnabled()) return { skipped: 'no TELEGRAM_BOT_TOKEN' };
  const users = await q("SELECT * FROM users WHERE telegram_chat_id IS NOT NULL AND digest AND NOT paused AND (profile->'skills' <> '[]'::jsonb OR profile->'roles' <> '[]'::jsonb)");
  let sent = 0;
  for (const u of users) {
    try {
      const pending = (await one("SELECT COUNT(*)::int AS n FROM drafts WHERE user_id = $1 AND status = 'draft'", [u.id])).n;
      const n = await sendPicks(u.telegram_chat_id, u, { limit: 4, onlyNew: true, intro: `☀️ Morning, ${esc(firstName(u.name))}. New for you today:` });
      if (pending) await send(u.telegram_chat_id, `${pending} email${pending === 1 ? '' : 's'} still waiting for your OK: /drafts`);
      if (n) sent++;
      await q('UPDATE users SET last_digest_at = now() WHERE id = $1', [u.id]);
    } catch (err) {
      if (err.status === 403) await q('UPDATE users SET digest = false WHERE id = $1', [u.id]); // they blocked the bot
      log(`[digest] ${u.id}: ${err.message}`);
    }
  }
  log(`[digest] sent picks to ${sent}/${users.length} people`);
  return { people: users.length, sent };
}

// Tell people on Telegram what happened to their emails.
hooks.notify = async (userId, e) => {
  if (!tgEnabled()) return;
  const u = await one('SELECT telegram_chat_id FROM users WHERE id = $1', [userId]);
  if (!u?.telegram_chat_id) return;
  const chat = u.telegram_chat_id;
  try {
    if (e.type === 'sent') await send(chat, `📤 Sent to ${esc(e.to)}${e.company ? ` at ${esc(e.company)}` : ''}. I’ll follow up if they don’t reply.`, { buttons: [[{ text: '🎉 I got a reply', callback_data: `rep:${e.draftId}` }]] });
    if (e.type === 'failed') await send(chat, `⚠️ Couldn’t send that email: ${esc(e.error)}\nOpen /drafts to try again.`);
    if (e.type === 'replied') await send(chat, `🎉 ${esc(e.to)} replied! Follow-ups stopped. Go get it.`);
    if (e.type === 'followup') {
      const d = await getDraft(userId, e.draftId);
      await send(chat, `No reply yet, so here's follow-up ${e.n} of 3. Same thread, short and polite:`);
      await showDraft(chat, d);
    }
  } catch (err) {
    console.error('[telegram] notify failed', err.message);
  }
};
