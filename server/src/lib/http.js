// Small fetch wrapper: timeout, one retry on rate limits / server errors, polite User-Agent.

const UA = 'InternHunt/1.0 (personal job aggregator)';

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.status = status;
    this.url = url;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, { method = 'GET', body, headers = {}, timeoutMs = 25000, retries = 1, as = 'json' } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        headers: {
          'User-Agent': UA,
          Accept: as === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml, */*',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        signal: controller.signal,
      });
      if (res.ok) return as === 'json' ? await res.json() : await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(err.name === 'AbortError' ? `Timed out: ${url}` : `${err.message}: ${url}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export const getJson = (url, opts) => request(url, { ...opts, as: 'json' });
export const getText = (url, opts) => request(url, { ...opts, as: 'text' });
export const postJson = (url, body, opts) => request(url, { ...opts, method: 'POST', body, as: 'json' });

// Run async tasks with a concurrency cap.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
