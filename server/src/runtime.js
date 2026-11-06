// Differences between a normal Node server and a Vercel serverless function.
import { waitUntil } from '@vercel/functions';

export const ON_VERCEL = Boolean(process.env.VERCEL);

/** Keep working after the response is sent. On Vercel this keeps the function alive until it finishes. */
export function background(promise) {
  const p = Promise.resolve(promise).catch((err) => console.error('[background]', err));
  if (ON_VERCEL) waitUntil(p);
  return p;
}
