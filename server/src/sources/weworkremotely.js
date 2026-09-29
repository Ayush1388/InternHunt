import { htmlToText, toIso } from '../lib/text.js';
import { getText } from '../lib/http.js';
import { rssItems, text } from '../lib/xml.js';

// We Work Remotely RSS feeds: https://weworkremotely.com/remote-job-rss-feed
// Terms: anyone can use the feed; attribute the links back to We Work Remotely.
const FEEDS = [
  'remote-programming-jobs',
  'remote-full-stack-programming-jobs',
  'remote-back-end-programming-jobs',
  'remote-front-end-programming-jobs',
  'remote-devops-sysadmin-jobs',
];

async function fetchAll() {
  const items = new Map();
  for (const f of FEEDS) {
    const xml = await getText(`https://weworkremotely.com/categories/${f}.rss`);
    for (const it of rssItems(xml)) items.set(text(it.guid) || text(it.link), it);
  }
  return [...items.values()];
}

export default {
  id: 'weworkremotely',
  label: 'We Work Remotely',
  attribution: 'We Work Remotely (weworkremotely.com)',
  minIntervalMinutes: 120,
  targets: () => [{ key: 'weworkremotely', label: 'We Work Remotely', fetch: fetchAll }],
  parse(items) {
    return (items || []).map((it) => {
      const full = text(it.title);
      const cut = full.indexOf(': ');
      const region = [text(it.region), text(it.country)].filter(Boolean).join(', ');
      const link = text(it.link) || text(it.guid);
      return {
        source: 'weworkremotely',
        sourceJobId: link.replace(/^https?:\/\/[^/]+\/remote-jobs\//, ''),
        company: cut > 0 ? full.slice(0, cut) : '',
        title: (cut > 0 ? full.slice(cut + 2) : full).trim(),
        description: htmlToText(text(it.description)),
        locations: [`Remote - ${region || 'Anywhere in the World'}`],
        isRemote: true,
        employmentType: text(it.type),
        tags: [text(it.category), ...String(text(it.skills)).split(',')].map((s) => s.trim()).filter(Boolean),
        url: link,
        postedAt: toIso(text(it.pubDate)),
        salary: null,
      };
    });
  },
};
