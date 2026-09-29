// Differences between running as a normal Node server and as a Vercel serverless function.
import { waitUntil } from '@vercel/functions';
import os from 'node:os';
import path from 'node:path';

export const ON_VERCEL = Boolean(process.env.VERCEL);

// Vercel's filesystem is read-only except for the temp dir.
export const WRITABLE_DIR = ON_VERCEL ? path.join(os.tmpdir(), 'internhunt') : null;

/** Run work after the response is sent. On Vercel this keeps the function alive until it finishes. */
export function background(promise) {
  if (ON_VERCEL) waitUntil(promise);
  return promise;
}
