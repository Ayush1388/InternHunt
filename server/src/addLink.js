// "Add from link": paste any official link and InternHunt works out what it is.
//  - A careers page / job link on a hiring system we can read → the company's whole board is added.
//  - Amazon / Microsoft links → already covered by their own feeds.
//  - Anything else (a program or announcement page) → watched in Programs for deadlines and changes.
import { getText } from './lib/http.js';
import { detectAts, jobListLinks } from './lib/detectAts.js';
import { htmlToText } from './lib/text.js';
import { addBoard, PROBES } from './discovery.js';
import { addUserProgram } from './programs.js';

const COVERED = [
  { re: /(^|\.)amazon\.jobs$/i, name: 'Amazon' },
  { re: /(^|\.)careers\.microsoft\.com$/i, name: 'Microsoft' },
];
// Sites whose listings we can't read or trust as a source; the user should link the official page instead.
const NOT_OFFICIAL = /(^|\.)(linkedin\.com|naukri\.com|indeed\.com|internshala\.com|unstop\.com|foundit\.in|glassdoor\.[a-z.]+|youtube\.com|youtu\.be|t\.me|telegram\.me|whatsapp\.com|chat\.whatsapp\.com|wa\.me|instagram\.com|facebook\.com|x\.com|twitter\.com)$/i;

function pageTitle(html) {
  const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  // "Careers | Acme Robotics" → "Acme Robotics"; "Deep Tech Fellowship 2027 - Apply" → "Deep Tech Fellowship 2027"
  const parts = htmlToText(t).split(/\s+[|–—-]\s+|\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  const GENERIC = /^(careers?|jobs?|home|apply( now)?|join us|work with us|open positions|official (site|website))$/i;
  const useful = parts.filter((x) => !GENERIC.test(x));
  return (useful[0] || parts[0] || '').slice(0, 100);
}

export async function addFromLink(rawUrl, givenName = '') {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return { ok: false, message: 'That doesn’t look like a web link.' };
  }
  if (url.protocol !== 'https:') return { ok: false, message: 'Please use an https:// link.' };
  const host = url.hostname.replace(/^www\./, '');

  if (NOT_OFFICIAL.test(host)) {
    return {
      ok: false,
      message: `${host} isn't an official source. Open the post, find the company's own careers or program page, and paste that link instead.`,
    };
  }
  const covered = COVERED.find((c) => c.re.test(url.hostname));
  if (covered) return { ok: true, kind: 'covered', message: `${covered.name} jobs are already fetched automatically.` };

  // 1. The link itself is on a hiring system (e.g. jobs.lever.co/acme/123).
  let board = detectAts(url.toString());
  let html = '';
  if (!board) {
    try {
      html = await getText(url.toString(), { timeoutMs: 20000, retries: 0 });
    } catch (err) {
      return { ok: false, message: `Couldn't open that page (${err.message.split(':')[0]}). Check the link and try again.` };
    }
    // 2. The page embeds or links to one.
    board = detectAts(html);
    for (const link of board ? [] : jobListLinks(html, url.toString()).slice(0, 3)) {
      board = detectAts(link);
      if (!board) {
        try {
          board = detectAts(await getText(link, { timeoutMs: 15000, retries: 0 }));
        } catch {
          /* next */
        }
      }
      if (board) break;
    }
  }

  if (board) {
    let jobs = null;
    try {
      jobs = await PROBES[board.type](board);
    } catch {
      board = null; // the reference was stale; treat the page as a program page instead
    }
    if (board) {
      const name = givenName || pageTitle(html) || board.token || board.tenant;
      const { targetKey, already } = addBoard(board, name);
      return {
        ok: true,
        kind: 'company',
        targetKey,
        name,
        message: already
          ? `${name} is already tracked (${board.type}).`
          : `Added ${name} — ${jobs} open job${jobs === 1 ? '' : 's'} on their ${board.type} board. Relevant ones will appear in Browse in a moment.`,
      };
    }
  }

  // 3. A program / announcement page → watch it.
  const name = givenName || pageTitle(html) || host;
  const id = addUserProgram(name, url.toString());
  return {
    ok: true,
    kind: 'program',
    id,
    name,
    message: `Added "${name}" to Programs. InternHunt will check it daily for deadlines and changes.`,
  };
}
