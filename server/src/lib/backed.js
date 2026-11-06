// Which companies are backed by Y Combinator or Techstars, from config/backed.json.
// Matching is by normalised company name (case, punctuation and "Inc/Labs"-style suffixes ignored).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(here, '..', 'config', 'backed.json'), 'utf8'));

const SUFFIX = /\b(inc|llc|ltd|limited|corp|corporation|co|company|pvt|private|technologies|technology|labs?)\b/g;
export const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, '');

const yc = new Map();
for (const [name, batch] of data.yc) {
  const k = normName(name);
  if (k.length >= 4 && !yc.has(k)) yc.set(k, batch);
}
const techstars = new Set(data.techstars.map(normName).filter((k) => k.length >= 4));

/** @returns {{ backed: string, ycBatch: string }} backed is '', 'yc', 'techstars' or 'yc,techstars'. */
export function backedFor(company) {
  const k = normName(company);
  const tags = [];
  if (yc.has(k)) tags.push('yc');
  if (techstars.has(k)) tags.push('techstars');
  return { backed: tags.join(','), ycBatch: yc.get(k) || '' };
}

export const BACKED_COUNTS = { yc: yc.size, techstars: techstars.size };
