// Gmail tracking: once a day, look at the sender and subject of recent inbox mail (never the body) and move
// roles along the board: Applied, Replied, Interview, Offer, Rejected. Only mail that matches a role you track
// is kept; everything else is ignored and forgotten.
import { q, one } from './db/index.js';
import { recentInbox } from './gmail.js';
import { hooks } from './drafts/service.js';

const RULES = [
  ['rejected', /unfortunately|regret to inform|not (be )?(moving|proceeding) forward|will not be (moving|proceeding)|other candidates|decided not to|no longer (considering|being considered)|not (been )?selected|position has been filled|we went with/i],
  ['offer', /offer letter|pleased to offer|(job|internship) offer|your offer|offer of employment|like to offer you/i],
  ['interview', /interview|schedule a (call|chat)|your availability|next steps|technical round|coding (test|challenge|assessment)|online assessment|quick chat|invite(d)? you to/i],
  ['applied', /thanks? (you )?for applying|application (received|confirmation)|we('| ha)ve received your application|received your application/i],
];
export const classifySubject = (subject = '') => RULES.find(([, re]) => re.test(subject))?.[0] || null;

const RANK = { saved: 0, drafted: 1, applied: 2, no_reply: 2, replied: 3, interview: 4, offer: 5, rejected: 5 };
/** The status a role should have after a message of kind `found`, or null to leave it alone. */
export function nextStatus(current, found) {
  if (found === 'rejected') return current === 'offer' ? null : 'rejected';
  if (found === 'applied') return (RANK[current] ?? 0) <= 1 ? 'applied' : null;
  return RANK[found] > (RANK[current] ?? 0) ? found : null;
}

const addrOf = (from) => (/<([^>]+)>/.exec(from)?.[1] || from).trim().toLowerCase();
const nameOf = (from) => from.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();

function matchRole(m, cands, ownAddr) {
  const addr = addrOf(m.from);
  if (!addr || addr === ownAddr) return null;
  const dom = addr.split('@')[1] || '';
  const hay = `${m.subject} ${nameOf(m.from)}`.toLowerCase();
  let best = null;
  for (const c of cands) {
    let score = 0;
    if (c.thread && c.thread === m.threadId) score = 100;
    else if (c.domain && (dom === c.domain || dom.endsWith(`.${c.domain}`))) score = 50;
    else if (c.company.length >= 4 && hay.includes(c.company.toLowerCase())) score = 20 + c.company.length / 100;
    if (score && (!best || score > best.score)) best = { ...c, score };
  }
  return best;
}

export async function scanUser(userId) {
  const u = await one('SELECT gmail_token, gmail_email, gmail_scanned_at FROM users WHERE id = $1', [userId]);
  if (!u?.gmail_token) throw Object.assign(new Error('Connect Gmail first'), { code: 'NO_GMAIL', status: 400 });
  const since = u.gmail_scanned_at ? new Date(u.gmail_scanned_at).getTime() - 86400000 : Date.now() - 45 * 86400000;
  const cands = await q(
    `SELECT t.job_id, t.status, j.company, c.domain,
            (SELECT s.gmail_thread_id FROM sends s JOIN drafts d ON d.id = s.draft_id
              WHERE s.user_id = $1 AND d.job_id = t.job_id AND s.gmail_thread_id IS NOT NULL ORDER BY s.id LIMIT 1) AS thread
     FROM tracking t JOIN jobs j ON j.id = t.job_id LEFT JOIN companies c ON c.id = j.company_id
     WHERE t.user_id = $1 AND t.status IN ('saved','drafted','applied','no_reply','replied','interview')`,
    [userId]
  );
  const messages = await recentInbox(userId, since);
  const updates = [];
  for (const m of messages) {
    const role = matchRole(m, cands, (u.gmail_email || '').toLowerCase());
    if (!role) continue;
    const kind = classifySubject(m.subject) || (role.score >= 50 ? 'replied' : null);
    if (!kind) continue;
    const fresh = await q(
      'INSERT INTO mail_events (user_id, message_id, job_id, status, from_addr, subject, at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING message_id',
      [userId, m.id, role.job_id, kind, addrOf(m.from).slice(0, 200), m.subject.slice(0, 200), m.at]
    );
    if (!fresh.length) continue;
    const cur = (await one('SELECT status FROM tracking WHERE user_id = $1 AND job_id = $2', [userId, role.job_id]))?.status;
    const next = nextStatus(cur, kind);
    if (kind !== 'applied') {
      // Someone wrote back: stop the follow-ups for this role.
      await q(
        `UPDATE sends s SET replied_at = COALESCE(s.replied_at, now()), stopped = true, next_followup_at = NULL
         FROM drafts d WHERE d.id = s.draft_id AND d.job_id = $2 AND s.user_id = $1 AND s.root_send_id IS NULL`,
        [userId, role.job_id]
      );
    }
    if (next) {
      await q('UPDATE tracking SET status = $3, updated_at = now() WHERE user_id = $1 AND job_id = $2', [userId, role.job_id, next]);
      role.status = next;
      updates.push({ jobId: role.job_id, company: role.company, status: next, subject: m.subject });
    }
  }
  await q('UPDATE users SET gmail_scanned_at = now() WHERE id = $1', [userId]);
  for (const up of updates) await hooks.notify(userId, { type: 'tracked', ...up });
  return { scanned: messages.length, updates };
}

export async function scanAll({ log = console.log } = {}) {
  const users = await q('SELECT id FROM users WHERE gmail_token IS NOT NULL');
  let moved = 0;
  for (const { id } of users) {
    try {
      moved += (await scanUser(id)).updates.length;
    } catch (err) {
      log(`[tracking] ${id}: ${err.message}`);
    }
  }
  log(`[tracking] scanned ${users.length} inboxes, ${moved} roles moved`);
  return { users: users.length, moved };
}
