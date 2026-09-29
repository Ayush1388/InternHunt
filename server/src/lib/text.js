import { createHash } from 'node:crypto';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s = '') {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Greenhouse returns HTML that is itself entity-encoded, so decode before and after stripping tags.
export function htmlToText(html = '') {
  if (!html) return '';
  const decoded = decodeEntities(html);
  return decodeEntities(
    decoded
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d|br|nav|footer|header|section|article|tr|td|th|ul|ol|table|main|aside|form|option|label|button)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function norm(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

export function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'number' ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
