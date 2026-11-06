// Who to write to at a company, best source first (the yc-outreach approach):
//   verified    Apify email finder with our token said the mailbox exists
//   unverified  Apify found it but couldn't confirm
//   on_site     published on the company's homepage or /contact page
//   guess       first@, first.last@, flast@, firstlast@ on the company domain (clearly labelled as a guess)
// No SMTP probing from our servers (port 25 is often blocked and probing gets IPs blacklisted).
// Every contact row records where it came from (source + source_url). LinkedIn is never scraped.
import dns from 'node:dns/promises';
import { q, one } from './db/index.js';
import { config } from './config.js';
import { getText, postJson } from './lib/http.js';
import { decodeEntities } from './lib/text.js';
import { nameParts } from './lib/names.js';
import { ycCompanyPage } from './sources/yc.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|sentry|wixpress|example\.|@2x|u00|domain\.com|email\.com/i;
const GENERIC = /^(info|hello|hi|contact|support|help|team|admin|sales|press|media|hr|jobs|careers|hiring|founders?|privacy|legal|security|billing|noreply|no-reply)@/i;

export const STATUS_RANK = { verified: 4, unverified: 3, on_site: 2, guess: 1, none: 0 };
export const STATUS_LABEL = {
  verified: 'Verified',
  unverified: 'Found, not verified',
  on_site: 'On their website',
  guess: 'Best guess',
  none: 'No email yet',
};

/** Pattern guesses in the order most likely to be right (first@ was right ~80% of the time in yc-outreach's test). */
export function emailGuesses(fullName, domain) {
  const parts = nameParts(fullName);
  if (!parts.length || !domain) return [];
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return [`${first}@${domain}`, ...(last ? [`${first}.${last}@${domain}`, `${first[0]}${last}@${domain}`, `${first}${last}@${domain}`] : [])];
}

/** Does the domain accept mail at all? (MX record, else an A record as the RFC fallback.) */
export async function acceptsMail(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length) return true;
  } catch {
    /* fall through */
  }
  try {
    return (await dns.resolve4(domain)).length > 0;
  } catch {
    return false;
  }
}

/** Addresses on the company's own domain, from its homepage and /contact page. */
export async function siteEmails(website, domain) {
  const found = new Set();
  const base = String(website || `https://${domain}`).replace(/\/$/, '');
  for (const path of ['', '/contact', '/about']) {
    let body = '';
    try {
      body = await getText(base + path, { timeoutMs: 5000, retries: 0, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Knockd/1.0)' } });
    } catch {
      continue;
    }
    let text = decodeEntities(body);
    try {
      text = decodeURIComponent(text);
    } catch {
      /* not URI-encoded */
    }
    for (const raw of text.match(EMAIL_RE) || []) {
      const e = raw.toLowerCase().replace(/\.$/, '');
      const host = e.split('@')[1];
      if (!BAD_EMAIL.test(e) && (host === domain || host.endsWith(`.${domain}`))) found.add(e);
    }
  }
  return [...found].sort();
}

/** Apify email finder for a few people at one domain. Token stays on the server; each run has a $ cap. */
export async function apifyFind(names, domain) {
  if (!config.apify.token || !names.length) return {};
  const url = `https://api.apify.com/v2/acts/${config.apify.actor}/run-sync-get-dataset-items?token=${encodeURIComponent(config.apify.token)}&maxTotalChargeUsd=${config.apify.maxChargeUsd}&memory=1024&timeout=120`;
  const items = await postJson(url, { names, domains: names.map(() => domain) }, { timeoutMs: 150000, retries: 0 });
  const out = {};
  // Field names aren't documented, so match each item by the name/domain it echoes back.
  for (const it of Array.isArray(items) ? items : []) {
    const vals = new Set(Object.values(it).filter((v) => typeof v === 'string').map((v) => v.trim().toLowerCase()));
    const emails = (JSON.stringify(it).match(EMAIL_RE) || []).map((e) => e.toLowerCase()).filter((e) => e.endsWith(`@${domain}`));
    for (const n of names) {
      if (vals.has(n.toLowerCase()) && emails.length) {
        const status = String(it.Validation || it.validation || it.status || '').toLowerCase();
        out[n] = { email: emails[0], verified: /valid|deliverable|verified/.test(status) && !/invalid|undeliverable/.test(status) };
      }
    }
  }
  return out;
}

async function saveContact(companyId, c) {
  await q(
    `INSERT INTO contacts (company_id, name, title, email, email_status, guesses, linkedin, twitter, source, source_url, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
     ON CONFLICT (company_id, name) DO UPDATE SET
       title = COALESCE(excluded.title, contacts.title),
       email = CASE WHEN excluded.email_status = 'none' THEN contacts.email ELSE excluded.email END,
       email_status = CASE WHEN excluded.email_status = 'none' THEN contacts.email_status ELSE excluded.email_status END,
       guesses = excluded.guesses, linkedin = COALESCE(NULLIF(excluded.linkedin, ''), contacts.linkedin),
       twitter = COALESCE(NULLIF(excluded.twitter, ''), contacts.twitter),
       source = excluded.source, source_url = excluded.source_url, verified_at = COALESCE(excluded.verified_at, contacts.verified_at)`,
    [companyId, c.name, c.title || null, c.email || null, c.status, JSON.stringify(c.guesses || []), c.linkedin || '', c.twitter || '', c.source, c.sourceUrl, c.verifiedAt || null]
  );
}

/** Founders from a YC page, saved with guesses (called from the daily YC run too). */
export async function saveFounders(company, founders, sourceUrl, { mail = null } = {}) {
  const domain = company.domain;
  const okMail = domain ? (mail ?? (await acceptsMail(domain))) : false;
  for (const f of founders) {
    const guesses = okMail ? emailGuesses(f.name, domain) : [];
    await saveContact(company.id, {
      name: f.name, title: f.title, linkedin: f.linkedin, twitter: f.twitter, guesses,
      email: guesses[0] || null, status: guesses.length ? 'guess' : 'none', source: 'yc_page', sourceUrl,
    });
  }
}

/**
 * Find (or refresh) the people to write to at a company. Cheap steps always run; Apify runs only when
 * `verify` is set and a token is configured.
 */
export async function findContacts(companyId, { verify = false } = {}) {
  const company = await one('SELECT * FROM companies WHERE id = $1', [companyId]);
  if (!company) throw new Error('Company not found');
  const domain = company.domain;
  const mail = domain ? await acceptsMail(domain) : false;

  if (company.yc_slug) {
    try {
      const page = await ycCompanyPage(company.yc_slug);
      await saveFounders(company, page.founders, page.url, { mail });
    } catch {
      /* YC page unavailable; keep what we have */
    }
  }

  if (domain && company.website) {
    const emails = await siteEmails(company.website, domain);
    await q('UPDATE companies SET site_emails = $2::jsonb WHERE id = $1', [companyId, JSON.stringify(emails)]);
    // A personal address on the site that starts with a founder's first name beats a guess.
    const people = await q('SELECT * FROM contacts WHERE company_id = $1', [companyId]);
    for (const p of people) {
      if (STATUS_RANK[p.email_status] >= STATUS_RANK.on_site) continue;
      const first = nameParts(p.name)[0];
      const hit = emails.find((e) => first && !GENERIC.test(e) && e.split('@')[0].startsWith(first));
      if (hit) await q("UPDATE contacts SET email = $2, email_status = 'on_site', source = 'company_site', source_url = $3 WHERE id = $1", [p.id, hit, company.website]);
    }
  }

  if (verify && config.apify.token && domain) {
    const people = await q("SELECT * FROM contacts WHERE company_id = $1 AND email_status IN ('guess','none','on_site') LIMIT 5", [companyId]);
    if (people.length) {
      try {
        const found = await apifyFind(people.map((p) => p.name), domain);
        for (const p of people) {
          const f = found[p.name];
          if (!f) continue;
          await q(
            `UPDATE contacts SET email = $2, email_status = $3, source = 'apify', source_url = $4, verified_at = CASE WHEN $3 = 'verified' THEN now() END WHERE id = $1`,
            [p.id, f.email, f.verified ? 'verified' : 'unverified', `https://apify.com/${config.apify.actor.replace('~', '/')}`]
          );
        }
      } catch (err) {
        console.error('[contacts] apify failed', err.message);
      }
    }
  }

  await q('UPDATE companies SET contacts_checked_at = now() WHERE id = $1', [companyId]);
  return contactsFor(companyId);
}

export async function contactsFor(companyId) {
  const rows = await q('SELECT * FROM contacts WHERE company_id = $1 ORDER BY id', [companyId]);
  const company = await one('SELECT site_emails FROM companies WHERE id = $1', [companyId]);
  return {
    people: rows
      .map((r) => ({
        id: r.id, name: r.name, title: r.title, email: r.email, status: r.email_status, statusLabel: STATUS_LABEL[r.email_status],
        guesses: r.guesses || [], linkedin: r.linkedin || '', twitter: r.twitter || '', source: r.source, sourceUrl: r.source_url,
      }))
      .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || founderRank(a.title) - founderRank(b.title)),
    siteEmails: company?.site_emails || [],
  };
}

// CEOs first, then other founders, then everyone else.
const founderRank = (t = '') => (/ceo|chief executive/i.test(t) ? 0 : /founder/i.test(t) ? 1 : /cto/i.test(t) ? 2 : 3);

/** The best person to write to, or null. */
export async function bestContact(companyId) {
  const { people } = await contactsFor(companyId);
  return people.find((p) => p.email) || people[0] || null;
}
