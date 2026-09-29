// Finds companies' job boards automatically and saves them to config/discovered.json.
//
// For each company it (1) opens its careers page and looks for an embedded/linked hiring system
// (Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, SmartRecruiters, Workday), following
// a few "open roles" links if needed; (2) failing that, guesses the board name from the company
// name/domain; (3) failing that, lists the careers page under Programs → "check directly".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson, getText, postJson, mapLimit } from './lib/http.js';
import { detectAts, jobListLinks } from './lib/detectAts.js';
import { loadCompanies, DISCOVERED_PATH } from './ingest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(here, 'config', 'india-companies.json');
const opts = { timeoutMs: 12000, retries: 0 };

// Each probe resolves to the number of open jobs (0 is fine: the board exists), or throws if it doesn't.
const PROBES = {
  ashby: async (b) => (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${enc(b.token)}`, opts))?.jobs?.length ?? 0,
  greenhouse: async (b) => (await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc(b.token)}/jobs`, opts))?.jobs?.length ?? 0,
  lever: async (b) => {
    const r = await getJson(`https://api.lever.co/v0/postings/${enc(b.token)}?mode=json&limit=50`, opts);
    if (!Array.isArray(r)) throw new Error('not a lever board');
    return r.length;
  },
  workable: async (b) => (await getJson(`https://apply.workable.com/api/v1/widget/accounts/${enc(b.token)}`, opts))?.jobs?.length ?? 0,
  recruitee: async (b) => (await getJson(`https://${enc(b.token)}.recruitee.com/api/offers/`, opts))?.offers?.length ?? 0,
  personio: async (b) => ((await getText(`https://${enc(b.token)}.jobs.personio.${b.domain || 'de'}/xml?language=en`, opts)).match(/<position>/g) || []).length,
  smartrecruiters: async (b) => (await getJson(`https://api.smartrecruiters.com/v1/companies/${enc(b.token)}/postings?limit=1`, opts))?.totalFound ?? 0,
  workday: async (b) =>
    (await postJson(`https://${b.host}/wday/cxs/${b.tenant}/${b.site}/jobs`, { appliedFacets: {}, limit: 1, offset: 0, searchText: '' }, opts))?.total ?? 0,
};
const GUESS_TYPES = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee'];
const enc = encodeURIComponent;

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Loose company-name match: one name's first word appears in the other. */
export function sameCompany(a, b) {
  const first = (s) => squash(String(s || '').split(/[\s(,.]+/)[0]);
  const A = squash(a), B = squash(b);
  if (!A || !B) return true; // nothing to compare against
  return A.includes(first(b)) || B.includes(first(a));
}

export function candidateTokens(name = '', website = '', slug = '') {
  const base = name.toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(inc|ltd|llc|pvt|private|limited|technologies|labs|india|bengaluru|bangalore|chennai|hyderabad|pune|gcc|tech|global)\b\.?/g, '').trim();
  const out = [slug, base.replace(/[^a-z0-9]/g, ''), base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')];
  try {
    const host = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '');
    out.push(host.split('.')[0]);
  } catch {
    /* no website */
  }
  return [...new Set(out.filter((t) => t && t.length >= 2 && t.length <= 60))];
}

/** Careers URLs worth trying for a company: the one given, else common patterns on its domain. */
export function careersCandidates(company) {
  if (company.careers) return [company.careers];
  const domain = String(company.domain || company.website || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
  if (!domain) return [];
  return [`https://www.${domain}/careers`, `https://careers.${domain}`, `https://${domain}/careers`, `https://www.${domain}/jobs`];
}

/** Opens the company's careers page(s); returns the detected board and the page that loaded. */
async function fromCareersPages(company) {
  let loadedUrl = null;
  for (const url of careersCandidates(company)) {
    let html;
    try {
      html = await getText(url, opts);
    } catch {
      continue;
    }
    loadedUrl = loadedUrl || url;
    const direct = detectAts(html);
    if (direct) return { board: direct, loadedUrl: url };
    for (const link of jobListLinks(html, url).slice(0, 3)) {
      const inLink = detectAts(link);
      if (inLink) return { board: inLink, loadedUrl: url };
      try {
        const found = detectAts(await getText(link, opts));
        if (found) return { board: found, loadedUrl: url };
      } catch {
        /* try next link */
      }
    }
    if (company.careers) break;
  }
  return { board: null, loadedUrl };
}

async function findBoard(company) {
  const { board: detected, loadedUrl } = await fromCareersPages(company);
  company.loadedUrl = loadedUrl;
  if (detected) {
    try {
      const jobs = await PROBES[detected.type](detected);
      return { ...detected, jobs, how: 'careers page' };
    } catch {
      /* detected link was stale; fall through to guessing */
    }
  }
  // Guessing by name is weaker, so short/generic tokens are skipped and Greenhouse boards must
  // also carry a matching company name.
  const tokens = candidateTokens(company.name, company.domain || company.website || company.careers || '', company.slug).filter((t) => t.length >= 3);
  for (const token of tokens) {
    for (const type of GUESS_TYPES) {
      try {
        if (type === 'greenhouse') {
          const r = await getJson(`https://boards-api.greenhouse.io/v1/boards/${enc(token)}/jobs`, opts);
          const jobs = r?.jobs || [];
          if (jobs.length && sameCompany(jobs[0].company_name, company.name)) return { type, token, jobs: jobs.length, how: 'name match' };
          continue;
        }
        const jobs = await PROBES[type]({ token });
        if (jobs > 0) return { type, token, jobs, how: 'name match' };
      } catch {
        /* not this one */
      }
    }
  }
  return null;
}

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).companies;
}

export async function ycCompanies(all = false) {
  const list = await getJson('https://yc-oss.github.io/api/companies/all.json', { timeoutMs: 60000 });
  return list
    .filter((c) => ['Active', 'Public'].includes(c.status))
    .filter((c) => all || /india/i.test(`${(c.regions || []).join(' ')} ${c.all_locations || ''}`))
    .map((c) => ({ name: c.name, website: c.website || '', slug: c.slug || '' }));
}

export function namesFrom(text) {
  return text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, website = ''] = line.split(/\s*;\s*|\s+(?=https?:\/\/)/);
      return /^https?:\/\//.test(name) ? { name: new URL(name).hostname, careers: name } : { name, website, careers: website || '' };
    });
}

const boardKey = (b) => (b.type === 'workday' ? `${b.host}/${b.site}` : `${b.type}:${b.token}`).toLowerCase();

/** Run discovery for a list of companies and merge results into discovered.json. */
export async function discover(companies, { log = console.log, dryRun = false } = {}) {
  const known = loadCompanies();
  const knownKeys = new Set(
    Object.entries(known).flatMap(([type, list]) => list.map((c) => boardKey({ type, ...c })))
  );
  log(`[discover] checking ${companies.length} companies…`);

  let done = 0;
  const results = await mapLimit(companies, 10, async (c) => {
    const board = await findBoard(c).catch(() => null);
    done++;
    if (board) log(`[discover]  ✓ ${c.name} → ${board.type} (${board.jobs} open jobs, via ${board.how})`);
    if (done % 50 === 0) log(`[discover]  …${done}/${companies.length}`);
    return { company: c, board };
  });

  const found = results.filter((r) => r.board);
  // Only list pages that actually loaded, so every "check directly" link works.
  const unreadable = results
    .filter((r) => !r.board && r.company.loadedUrl)
    .map((r) => ({ name: r.company.name, careers: r.company.loadedUrl, group: r.company.group || '' }));
  log(`[discover] found ${found.length} boards; ${unreadable.length} careers pages need checking by hand`);
  if (dryRun) return { found, unreadable };

  const out = existsSync(DISCOVERED_PATH) ? JSON.parse(readFileSync(DISCOVERED_PATH, 'utf8')) : {};
  let added = 0;
  for (const { company, board } of found) {
    if (knownKeys.has(boardKey(board))) continue;
    const entry =
      board.type === 'workday'
        ? { host: board.host, tenant: board.tenant, site: board.site, name: company.name }
        : { token: board.token, name: company.name, ...(board.domain ? { domain: board.domain } : {}) };
    out[board.type] = out[board.type] || [];
    out[board.type].push(entry);
    knownKeys.add(boardKey(board));
    added++;
  }
  // Keep the "check by hand" list current: drop names that now have a board.
  const withBoard = new Set(found.map((f) => f.company.name));
  const previous = (out._unreadable || []).filter((u) => !withBoard.has(u.name) && !unreadable.some((n) => n.name === u.name));
  out._unreadable = [...previous, ...unreadable];
  out._updated = new Date().toISOString();
  writeFileSync(DISCOVERED_PATH, `${JSON.stringify(out, null, 2)}\n`);
  log(`[discover] added ${added} new boards to discovered.json`);
  return { found, unreadable, added };
}

export function discoveryAgeDays() {
  if (!existsSync(DISCOVERED_PATH)) return Infinity;
  const updated = JSON.parse(readFileSync(DISCOVERED_PATH, 'utf8'))._updated;
  return updated ? (Date.now() - Date.parse(updated)) / 86400000 : Infinity;
}

/** Registry + YC companies with an Indian presence. Used by the weekly automatic run. */
export async function discoverDefault({ log = console.log } = {}) {
  let companies = loadRegistry();
  try {
    const yc = await ycCompanies(false);
    const names = new Set(companies.map((c) => c.name.toLowerCase()));
    companies = [...companies, ...yc.filter((c) => !names.has(c.name.toLowerCase()))];
  } catch (err) {
    log(`[discover] YC list unavailable (${err.message}); using the built-in company list only`);
  }
  return discover(companies, { log });
}

/** Add one board to discovered.json (no-op if already known). Returns the refresh target key. */
export function addBoard(board, name) {
  const known = loadCompanies();
  const key = boardKey(board);
  const already = Object.entries(known).some(([type, list]) => list.some((c) => boardKey({ type, ...c }) === key));
  if (!already) {
    const out = existsSync(DISCOVERED_PATH) ? JSON.parse(readFileSync(DISCOVERED_PATH, 'utf8')) : {};
    const entry =
      board.type === 'workday'
        ? { host: board.host, tenant: board.tenant, site: board.site, name }
        : { token: board.token, name, ...(board.domain ? { domain: board.domain } : {}) };
    out[board.type] = [...(out[board.type] || []), entry];
    out._unreadable = (out._unreadable || []).filter((u) => u.name.toLowerCase() !== String(name).toLowerCase());
    writeFileSync(DISCOVERED_PATH, `${JSON.stringify(out, null, 2)}\n`);
  }
  const targetKey = board.type === 'workday' ? `workday:${board.tenant}:${board.site}` : `${board.type}:${board.token}`;
  return { targetKey, already };
}

export { PROBES, fromCareersPages };
