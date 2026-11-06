// Indian startup funding news from public RSS feeds, parsed with our own rules.
// We only keep headlines that clearly say a named startup raised money; everything else
// (results, IPO filings, "in talks", VC funds raising their own fund) is skipped.
import { XMLParser } from 'fast-xml-parser';
import { getText } from '../lib/http.js';
import { decodeEntities, htmlToText, toIso } from '../lib/text.js';

export const FEEDS = [
  { id: 'entrackr', label: 'Entrackr', url: 'https://entrackr.com/rss' },
  { id: 'inc42', label: 'Inc42', url: 'https://inc42.com/buzz/feed/' },
  { id: 'startuptalky', label: 'StartupTalky', url: 'https://startuptalky.com/tag/funding/rss/' },
];

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, cdataPropName: false });
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v) => decodeEntities(typeof v === 'object' && v ? String(v['#text'] ?? '') : String(v ?? '')).trim();

export function parseFeed(body) {
  const doc = xml.parse(body || '');
  return arr(doc?.rss?.channel?.item).map((it) => ({
    title: txt(it.title).replace(/\s+/g, ' '),
    url: txt(it.link),
    summary: htmlToText(txt(it.description)).slice(0, 400),
    publishedAt: toIso(txt(it.pubDate)),
  }));
}

const VERB = '(?:raises|raised|bags|secures|nets|gets|lands|picks up|mops up|garners|receives|closes|scoops up|attracts)';
const MONEY = '((?:\\$|₹|rs\\.?\\s?|inr\\s?|usd\\s?)\\s?[\\d.,]+\\s?(?:mn|million|m|bn|billion|cr|crore|crores|lakh|k)\\b|undisclosed (?:amount|funding)|funding|seed funding|pre-seed funding)';
const ROUND = /\b(pre[\s-]?seed|seed|angel|pre[\s-]?series [a-e]|series [a-f](?:\d)?|bridge|debt|growth)\b(?: round| funding)?/i;
const SKIP = /\b(in talks|to raise|plans to raise|eyes|seeks|fund(?:s)? (?:i|ii|iii|iv|\d)|maiden fund|first close|venture fund|ipo|drhp|q[1-4]\b|fy\d{2}|profit|revenue|loss|acquires|acquisition|layoffs?)\b/i;
// Words in front of the name that describe the startup, not name it: "Spacetech startup Cosmoserve Space raises..."
const LEAD = /^(?:(?:exclusive|update|\[update\]|breaking)\s*:?\s*)*(?:(?:[\w&/-]+\s){0,4}?(?:startup|platform|company|firm|player|maker|brand|marketplace|app|unicorn|venture)\s+)?/i;

/**
 * "Spacetech startup Cosmoserve Space raises $6 Mn in seed round"
 *   -> { company: 'Cosmoserve Space', amount: '$6 Mn', round: 'Seed' }
 * Returns null when the headline isn't a clear raise by one named company.
 */
export function parseFundingHeadline(title = '') {
  const t = decodeEntities(title).replace(/\s+/g, ' ').trim();
  if (SKIP.test(t)) return null;
  const m = new RegExp(`^(.{2,80}?)\\s+${VERB}\\s+(?:an?\\s+)?${MONEY}`, 'i').exec(t);
  if (!m) return null;
  let company = m[1].replace(LEAD, '').replace(/[’']s$/i, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '').trim();
  // "X-backed Foo", "Ex-Google founders' Foo": keep the last capitalised run.
  const parts = company.split(/,\s*|\s+-\s+|\s+–\s+/);
  company = parts[parts.length - 1].replace(/^.*\b(?:backed|founded|led|owned)\s+/i, '').trim();
  if (!company || company.length < 2 || company.length > 50) return null;
  if (!/^[A-Z0-9]/.test(company) && !/[A-Z]/.test(company)) return null; // names are capitalised somewhere ("altM", "iMocha")
  if (company.split(/\s+/).length > 5) return null;
  if (/\b(startups?|companies|firms|platforms|this|these)\b/i.test(company)) return null;
  const amountRaw = m[2];
  const amount = /funding|undisclosed/i.test(amountRaw) ? '' : amountRaw.replace(/\s+/g, ' ').replace(/^rs\.?\s?/i, '₹').replace(/^inr\s?/i, '₹').replace(/^usd\s?/i, '$');
  const r = ROUND.exec(t);
  const round = r ? r[1].replace(/\s+/g, ' ').replace(/-/g, '-').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Pre Seed$/i, 'Pre-Seed') : '';
  return { company, amount, round };
}

/** Funding announcements from all feeds: [{ company, amount, round, title, url, summary, publishedAt, source }] */
export async function fundingNews({ feeds = FEEDS, fetchText = getText } = {}) {
  const out = [];
  const errors = [];
  for (const f of feeds) {
    try {
      const items = parseFeed(await fetchText(f.url, { timeoutMs: 20000, retries: 1 }));
      for (const it of items) {
        const p = parseFundingHeadline(it.title);
        if (p && it.url && it.publishedAt) out.push({ ...p, ...it, source: f.id });
      }
    } catch (err) {
      errors.push(`${f.label}: ${err.message}`);
    }
  }
  return { items: out, errors };
}
