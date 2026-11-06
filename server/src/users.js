// People: Google sign-in on the web, Telegram-only accounts from the bot, linking the two, the profile,
// settings, export and "delete my data".
import crypto from 'node:crypto';
import { q, one, tx, iso } from './db/index.js';
import { config, features } from './config.js';
import { randomId, sha256 } from './lib/secrets.js';
import { CATEGORIES } from './lib/classify.js';
import { LEVELS, LOC_TAGS } from './jobs.js';
import { embedUser } from './embed.js';
import { sendsToday } from './drafts/service.js';
import * as gmail from './gmail.js';

const SESSION_DAYS = 60;

/* ---------------- Google sign-in (ID token from Google Identity Services, no client secret needed) */
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
let keys = { byKid: {}, expires: 0 };
async function googleKey(kid) {
  if (!keys.byKid[kid] || Date.now() > keys.expires) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) throw new Error(`Couldn't fetch Google's keys (${res.status})`);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
    const { keys: list } = await res.json();
    keys = { byKid: Object.fromEntries(list.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])), expires: Date.now() + maxAge * 1000 };
  }
  const key = keys.byKid[kid];
  if (!key) throw new Error('Unknown Google signing key');
  return key;
}
const b64json = (part) => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed token');
  }
};

export async function verifyGoogleIdToken(idToken) {
  if (!config.google.clientId) throw new Error('Google sign-in is not configured (GOOGLE_CLIENT_ID)');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const header = b64json(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), await googleKey(header.kid), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Bad token signature');
  const claims = b64json(parts[1]);
  if (!ISSUERS.has(claims.iss)) throw new Error('Token not issued by Google');
  if (claims.aud !== config.google.clientId) throw new Error('Token is for a different app');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('Token expired');
  if (!claims.sub || !claims.email || claims.email_verified === false) throw new Error('Google account email is not verified');
  return claims;
}

async function newSession(userId) {
  const token = randomId(32);
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)", [sha256(token), userId, String(SESSION_DAYS)]);
  return token;
}

export async function signInWithGoogle(claims) {
  const existing = await one('SELECT id FROM users WHERE google_sub = $1', [claims.sub]);
  const id = existing?.id || `g_${randomId(9)}`;
  await q(
    `INSERT INTO users (id, google_sub, email, name, picture) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = COALESCE(users.name, excluded.name), picture = excluded.picture, last_seen_at = now()`,
    [id, claims.sub, claims.email, claims.name || claims.email, claims.picture || null]
  );
  if (!existing) await q("INSERT INTO events (user_id, kind) VALUES ($1, 'signup')", [id]);
  return { token: await newSession(id), user: await publicUser(id) };
}

export const signOut = (token) => (token ? q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]) : null);

const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || null;

export async function attachUser(req, res, next) {
  req.user = null;
  req.sessionToken = bearer(req);
  try {
    if (req.sessionToken) {
      const row = await one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha256(req.sessionToken)]);
      if (row) req.user = { id: row.id, email: row.email, name: row.name, picture: row.picture };
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do this', signIn: true });
  next();
}

/* ---------------- Telegram accounts */
export async function telegramUser(chatId, from = {}) {
  const row = await one('SELECT * FROM users WHERE telegram_chat_id = $1', [String(chatId)]);
  if (row) return row;
  const id = `t_${randomId(9)}`;
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'there';
  await q('INSERT INTO users (id, name, telegram_chat_id, telegram_username) VALUES ($1, $2, $3, $4)', [id, name, String(chatId), from.username || null]);
  await q("INSERT INTO events (user_id, kind, data) VALUES ($1, 'signup', '{\"via\":\"telegram\"}'::jsonb)", [id]);
  return one('SELECT * FROM users WHERE id = $1', [id]);
}

/** A one-time code for t.me/<bot>?start=<code>, valid 30 minutes. */
export async function telegramLinkCode(userId) {
  const code = `L${randomId(12).replace(/[-_]/g, 'x')}`;
  await q("UPDATE users SET tg_link_code = $2, tg_link_expires = now() + interval '30 minutes' WHERE id = $1", [userId, code]);
  return code;
}

/** /start <code>: attach this chat to the web account, folding in anything the chat-only account had. */
export async function linkTelegram(code, chatId, from = {}) {
  const web = await one('SELECT * FROM users WHERE tg_link_code = $1 AND tg_link_expires > now()', [code]);
  if (!web) return null;
  const chat = await one('SELECT * FROM users WHERE telegram_chat_id = $1', [String(chatId)]);
  await tx(async (run) => {
    if (chat && chat.id !== web.id) {
      for (const t of ['drafts', 'sends', 'style_samples', 'events']) await run(`UPDATE ${t} SET user_id = $1 WHERE user_id = $2`, [web.id, chat.id]);
      await run('INSERT INTO tracking (user_id, job_id, status, notes, updated_at) SELECT $1, job_id, status, notes, updated_at FROM tracking WHERE user_id = $2 ON CONFLICT DO NOTHING', [web.id, chat.id]);
      await run('INSERT INTO digest_items (user_id, job_id, sent_at, action) SELECT $1, job_id, sent_at, action FROM digest_items WHERE user_id = $2 ON CONFLICT DO NOTHING', [web.id, chat.id]);
      // Keep the richer profile.
      const webProfile = web.profile || {};
      if (!(webProfile.skills || []).length && (chat.profile?.skills || []).length) await run('UPDATE users SET profile = $2::jsonb WHERE id = $1', [web.id, JSON.stringify(chat.profile)]);
      await run('DELETE FROM users WHERE id = $1', [chat.id]);
    }
    await run('UPDATE users SET telegram_chat_id = $2, telegram_username = $3, tg_link_code = NULL, tg_link_expires = NULL WHERE id = $1', [web.id, String(chatId), from.username || null]);
  });
  return one('SELECT * FROM users WHERE id = $1', [web.id]);
}

export const unlinkTelegram = (userId) => q('UPDATE users SET telegram_chat_id = NULL, telegram_username = NULL WHERE id = $1', [userId]);

/* ---------------- Profile */
const GITHUB_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const cleanUrl = (v) => {
  try {
    const u = new URL(String(v || '').trim());
    return /^https?:$/.test(u.protocol) ? u.href.slice(0, 200) : '';
  } catch {
    return '';
  }
};
export const cleanList = (v, max, len, allowed) =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase().trim()).filter((x) => x && x.length <= len && (!allowed || allowed.includes(x))))].slice(0, max);

/** Only what the browser or bot extracted: skills, roles, links, a short summary, the person's own proof lines. */
export function cleanProfile(p = {}) {
  return {
    skills: cleanList(p.skills, 60, 40),
    roles: cleanList(p.roles, 11, 20, CATEGORIES),
    kind: LEVELS.includes(p.kind) ? p.kind : '',
    loc: cleanList(p.loc, 5, 20, LOC_TAGS),
    github: GITHUB_RE.test(String(p.github || '')) ? String(p.github) : '',
    portfolio: cleanUrl(p.portfolio),
    linkedin: cleanUrl(p.linkedin),
    summary: String(p.summary || '').slice(0, 600),
    resumeName: String(p.resumeName || '').slice(0, 120),
    proofs: (Array.isArray(p.proofs) ? p.proofs : []).map((s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 5),
  };
}

export async function saveProfile(userId, profile) {
  const clean = cleanProfile(profile);
  const before = await one('SELECT profile FROM users WHERE id = $1', [userId]);
  await q('UPDATE users SET profile = $2::jsonb WHERE id = $1', [userId, JSON.stringify(clean)]);
  if (!(before?.profile?.skills || []).length && clean.skills.length) await q("INSERT INTO events (user_id, kind) VALUES ($1, 'activated')", [userId]);
  try {
    await embedUser(userId, clean);
  } catch (err) {
    console.error('[profile] embedding failed', err.message);
  }
  return clean;
}

/* ---------------- Settings, export, delete */
export async function publicUser(userId) {
  const u = await one('SELECT * FROM users WHERE id = $1', [userId]);
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, picture: u.picture };
}

export async function settings(userId) {
  const u = await one('SELECT * FROM users WHERE id = $1', [userId]);
  const f = features();
  return {
    user: { id: u.id, email: u.email, name: u.name, picture: u.picture },
    profile: u.profile || {},
    dailyCap: u.daily_cap,
    maxCap: config.sending.maxCap,
    paused: u.paused,
    digest: u.digest,
    style: u.style || {},
    sentToday: await sendsToday(userId),
    telegram: { available: f.telegram, bot: f.telegramBot, linked: Boolean(u.telegram_chat_id), username: u.telegram_username },
    gmail: { available: f.gmail, connected: Boolean(u.gmail_token), email: u.gmail_email },
    ai: f.ai,
  };
}

export async function updateSettings(userId, s = {}) {
  if (s.dailyCap != null) await q('UPDATE users SET daily_cap = $2 WHERE id = $1', [userId, Math.max(1, Math.min(config.sending.maxCap, Math.round(Number(s.dailyCap)) || config.sending.defaultCap))]);
  if (s.paused != null) await q('UPDATE users SET paused = $2 WHERE id = $1', [userId, Boolean(s.paused)]);
  if (s.digest != null) await q('UPDATE users SET digest = $2 WHERE id = $1', [userId, Boolean(s.digest)]);
  if (typeof s.name === 'string' && s.name.trim()) await q('UPDATE users SET name = $2 WHERE id = $1', [userId, s.name.trim().slice(0, 80)]);
  return settings(userId);
}

export async function exportData(userId) {
  const u = await one('SELECT id, email, name, telegram_username, gmail_email, profile, daily_cap, paused, style, created_at FROM users WHERE id = $1', [userId]);
  const tables = {
    tracking: 'SELECT job_id, status, notes, updated_at FROM tracking WHERE user_id = $1',
    drafts: 'SELECT id, job_id, to_name, to_email, subject, body, status, created_at FROM drafts WHERE user_id = $1',
    sends: 'SELECT id, to_email, subject, status, sent_at, replied_at, followups FROM sends WHERE user_id = $1',
    styleSamples: 'SELECT before, after, created_at FROM style_samples WHERE user_id = $1',
    reports: 'SELECT job_id, reason, created_at FROM reports WHERE user_id = $1',
    blocked: 'SELECT company, reason, created_at FROM blocked WHERE user_id = $1',
  };
  const out = { exportedAt: new Date().toISOString(), account: { ...u, created_at: iso(u?.created_at) } };
  for (const [k, sql] of Object.entries(tables)) out[k] = await q(sql, [userId]);
  return out;
}

/** "Delete my data": revoke Gmail, then remove the account and everything that hangs off it. */
export async function deleteUser(userId) {
  try {
    await gmail.disconnect(userId);
  } catch {
    /* already gone */
  }
  const u = await one('SELECT email FROM users WHERE id = $1', [userId]);
  if (u?.email) await q('DELETE FROM waitlist WHERE email = $1', [u.email]);
  await q('DELETE FROM bot_state WHERE chat_id = (SELECT telegram_chat_id FROM users WHERE id = $1)', [userId]);
  await q('DELETE FROM users WHERE id = $1', [userId]); // sessions, drafts, sends, tracking, ... cascade
  return { ok: true };
}
