// Encryption for stored secrets (Gmail refresh tokens) and signed state for OAuth redirects.
// Key: APP_SECRET. Without it (local dev) a random key is created once and kept in the database.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getMeta, setMeta } from '../db/index.js';

let key = null;
async function getKey() {
  if (key) return key;
  let secret = config.appSecret;
  if (!secret) {
    secret = await getMeta('dev_app_secret');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      await setMeta('dev_app_secret', secret);
    }
  }
  key = crypto.createHash('sha256').update(secret).digest();
  return key;
}

export async function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', await getKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export async function decrypt(blob) {
  const [v, iv, tag, data] = String(blob || '').split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', await getKey(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

/** A short-lived signed value, e.g. the OAuth `state`: payload.expiry.signature */
export async function sign(payload, ttlSec = 600) {
  const body = Buffer.from(JSON.stringify({ p: payload, e: Date.now() + ttlSec * 1000 })).toString('base64url');
  const mac = crypto.createHmac('sha256', await getKey()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export async function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', await getKey()).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const { p, e } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return Date.now() < e ? p : null;
}

export const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
