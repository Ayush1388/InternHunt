// Google sign-in without a client secret: the browser gets a signed ID token from Google Identity
// Services, we check its signature against Google's public keys, then issue our own session token.
// Only a SHA-256 hash of each session token is stored, so a database leak can't be replayed.
import crypto from 'node:crypto';
import { db } from './db.js';

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_DAYS = 60;
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

/** Verify a Google ID token and return its claims, or throw. */
export async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured (GOOGLE_CLIENT_ID)');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const header = b64json(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), await googleKey(header.kid), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Bad token signature');
  const claims = b64json(parts[1]);
  if (!ISSUERS.has(claims.iss)) throw new Error('Token not issued by Google');
  if (claims.aud !== GOOGLE_CLIENT_ID) throw new Error('Token is for a different app');
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error('Token expired');
  if (!claims.sub || !claims.email || claims.email_verified === false) throw new Error('Google account email is not verified');
  return claims;
}

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Create or update the user from Google's claims and start a session. */
export function signIn(claims) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, picture, created_at, last_login) VALUES (@id, @email, @name, @picture, @now, @now)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, last_login = excluded.last_login`
  ).run({ id: claims.sub, email: claims.email, name: claims.name || claims.email, picture: claims.picture || null, now });
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hash(token), claims.sub, now, expires);
  return { token, user: publicUser({ id: claims.sub, email: claims.email, name: claims.name || claims.email, picture: claims.picture || null }) };
}

export function signOut(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, picture: u.picture });

const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || null;

/** Middleware: sets req.user (or null) and req.sessionToken from "Authorization: Bearer <token>". */
export function attachUser(req, res, next) {
  req.user = null;
  req.sessionToken = bearer(req);
  if (req.sessionToken) {
    const row = db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .get(hash(req.sessionToken), new Date().toISOString());
    if (row) req.user = publicUser(row);
  }
  next();
}

/** Middleware: 401 unless signed in. */
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do this', signIn: true });
  next();
}
