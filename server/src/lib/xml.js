import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false, // keep ids like "0012" as strings
  trimValues: true,
});

export const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

// Text content of a node that may be a string, a CDATA object, or {#text}.
export function text(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in v) return String(v['#text']);
  return '';
}

export function parseXml(xml) {
  return parser.parse(xml);
}

/** Items of an RSS 2.0 feed as plain objects. */
export function rssItems(xml) {
  const doc = parseXml(xml);
  return asArray(doc?.rss?.channel?.item);
}
