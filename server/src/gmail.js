// Gmail in the person's own account: create drafts, send what they approved, and notice replies so
// follow-ups stop. Scopes: gmail.compose (drafts + send) and gmail.metadata (read headers to see replies,
// never message bodies). Both need Google's app verification before going public; until then, add
// testers in the Google Cloud console.
import { q, one } from './db/index.js';
import { config, PUBLIC_URL } from './config.js';
import { encrypt, decrypt, sign, verify } from './lib/secrets.js';

export const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.metadata'];
const REDIRECT = () => `${PUBLIC_URL}/api/gmail/callback`;
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const gmailEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);

export async function connectUrl(user) {
  const state = await sign({ uid: user.id }, 900);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: REDIRECT(),
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    ...(user.email ? { login_hint: user.email } : {}),
  }).toString();
  return u.toString();
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Google token error ${res.status}`);
  return json;
}

/** OAuth callback: swap the code for tokens and keep the (encrypted) refresh token. */
export async function finishConnect({ code, state }) {
  const s = await verify(state);
  if (!s?.uid) throw new Error('This Gmail link expired. Try connecting again.');
  const t = await tokenRequest({ code, redirect_uri: REDIRECT(), grant_type: 'authorization_code' });
  if (!t.refresh_token) throw new Error('Google didn’t return a refresh token. Remove Doorstep from your Google account permissions and try again.');
  const granted = String(t.scope || '').split(' ');
  if (!granted.includes('https://www.googleapis.com/auth/gmail.compose')) throw new Error('Gmail permission wasn’t granted, so we can’t create drafts.');
  const claims = JSON.parse(Buffer.from(String(t.id_token || '').split('.')[1] || 'e30', 'base64url').toString('utf8'));
  await q('UPDATE users SET gmail_token = $2, gmail_email = $3 WHERE id = $1', [s.uid, await encrypt(t.refresh_token), claims.email || null]);
  cache.delete(s.uid);
  return { uid: s.uid, email: claims.email || null };
}

const cache = new Map(); // uid -> { token, expires }

async function accessToken(uid) {
  const hit = cache.get(uid);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;
  const row = await one('SELECT gmail_token FROM users WHERE id = $1', [uid]);
  if (!row?.gmail_token) throw Object.assign(new Error('Gmail isn’t connected'), { code: 'NO_GMAIL' });
  try {
    const t = await tokenRequest({ refresh_token: await decrypt(row.gmail_token), grant_type: 'refresh_token' });
    cache.set(uid, { token: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000 });
    return t.access_token;
  } catch (err) {
    if (/invalid_grant/i.test(err.message)) {
      await q('UPDATE users SET gmail_token = NULL WHERE id = $1', [uid]);
      throw Object.assign(new Error('Gmail access was removed. Connect Gmail again.'), { code: 'NO_GMAIL' });
    }
    throw err;
  }
}

async function gmail(uid, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(uid)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${json?.error?.message || 'request failed'}`);
  return json;
}

const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

/** RFC 2822 message, base64url as Gmail wants it. */
export function mime({ from, fromName, to, subject, body, inReplyTo }) {
  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} <${from}>` : from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
  ];
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${String(body).replace(/\r?\n/g, '\r\n')}`, 'utf8').toString('base64url');
}

async function sender(uid) {
  const u = await one('SELECT name, gmail_email FROM users WHERE id = $1', [uid]);
  return { from: u?.gmail_email, fromName: u?.name || '' };
}

export async function createDraft(uid, { to, subject, body, threadId, inReplyTo }) {
  const raw = mime({ ...(await sender(uid)), to, subject, body, inReplyTo });
  const d = await gmail(uid, '/drafts', { method: 'POST', body: { message: { raw, ...(threadId ? { threadId } : {}) } } });
  return { draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId };
}

export async function sendEmail(uid, { to, subject, body, threadId, inReplyTo }) {
  const raw = mime({ ...(await sender(uid)), to, subject, body, inReplyTo });
  const m = await gmail(uid, '/messages/send', { method: 'POST', body: { raw, ...(threadId ? { threadId } : {}) } });
  let rfcId = null;
  try {
    const meta = await gmail(uid, `/messages/${m.id}?format=metadata&metadataHeaders=Message-ID`);
    rfcId = meta.payload?.headers?.find((h) => h.name.toLowerCase() === 'message-id')?.value || null;
  } catch {
    /* follow-ups still thread by threadId */
  }
  return { messageId: m.id, threadId: m.threadId, rfcId };
}

/** True when someone other than the sender has written in the thread. */
export async function threadHasReply(uid, threadId) {
  const { from } = await sender(uid);
  const t = await gmail(uid, `/threads/${threadId}?format=metadata&metadataHeaders=From`);
  return (t.messages || []).some((m) => {
    const f = m.payload?.headers?.find((h) => h.name.toLowerCase() === 'from')?.value || '';
    return from && !f.toLowerCase().includes(from.toLowerCase());
  });
}

export async function disconnect(uid) {
  const row = await one('SELECT gmail_token FROM users WHERE id = $1', [uid]);
  if (row?.gmail_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await decrypt(row.gmail_token))}`, { method: 'POST' });
    } catch {
      /* revoked or unreachable; we forget it either way */
    }
  }
  cache.delete(uid);
  await q('UPDATE users SET gmail_token = NULL, gmail_email = NULL WHERE id = $1', [uid]);
}

const header = (m, name) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || '';

/** Newest-first inbox messages since a time: sender, subject and date only (the metadata scope can't read bodies). */
export async function recentInbox(uid, sinceMs, cap = 150) {
  const out = [];
  let pageToken = '';
  while (out.length < cap) {
    const l = await gmail(uid, `/messages?labelIds=INBOX&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    const ids = (l.messages || []).map((m) => m.id);
    let reachedOld = false;
    for (let i = 0; i < ids.length; i += 10) {
      const got = await Promise.all(ids.slice(i, i + 10).map((id) => gmail(uid, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)));
      for (const m of got) {
        const t = Number(m.internalDate);
        if (t < sinceMs) reachedOld = true;
        else out.push({ id: m.id, threadId: m.threadId, at: new Date(t), from: header(m, 'from'), subject: header(m, 'subject') });
      }
    }
    if (reachedOld || !l.nextPageToken) break;
    pageToken = l.nextPageToken;
  }
  return out;
}
