// Embeddings for resume-to-role matching (pgvector). Jobs are embedded in the daily run; a person is
// embedded from their profile (skills, roles, summary, proof points), never from a raw resume.
import { q, vec } from './db/index.js';
import { aiEnabled, embed } from './ai/gemini.js';

export const jobText = (j) =>
  [j.title, `at ${j.company}`, (j.tags || []).join(', '), (j.languages || []).join(', '), String(j.description || '').slice(0, 1800)].filter(Boolean).join('\n');

export const profileText = (p = {}) =>
  [
    p.roles?.length ? `Looking for ${p.kind === 'job' ? 'jobs' : p.kind === 'intern' ? 'internships' : 'roles'} in ${p.roles.join(', ')}` : '',
    p.skills?.length ? `Skills: ${p.skills.join(', ')}` : '',
    p.summary || '',
    ...(p.proofs || []),
  ]
    .filter(Boolean)
    .join('\n');

export async function embedPendingJobs({ limit = 1500, log = console.log } = {}) {
  if (!aiEnabled()) return { skipped: 'no GEMINI_API_KEY' };
  const rows = await q('SELECT id, title, company, tags, languages, description FROM jobs WHERE is_active AND embedding IS NULL ORDER BY first_seen DESC LIMIT $1', [limit]);
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const vectors = await embed(chunk.map(jobText), 'RETRIEVAL_DOCUMENT');
    for (let k = 0; k < chunk.length; k++) {
      if (!vectors[k]) continue;
      await q('UPDATE jobs SET embedding = $2::vector, embedded_at = now() WHERE id = $1', [chunk[k].id, vec(vectors[k])]);
      done++;
    }
  }
  if (rows.length) log(`[refresh] embedded ${done} roles`);
  return { embedded: done };
}

/** Embed one person's profile. Returns the vector literal (or null when AI is off / profile empty). */
export async function embedUser(userId, profile) {
  const text = profileText(profile);
  if (!aiEnabled() || !text) {
    await q('UPDATE users SET embedding = NULL, embedded_at = NULL WHERE id = $1', [userId]);
    return null;
  }
  const [v] = await embed([text], 'RETRIEVAL_QUERY');
  const literal = vec(v);
  await q('UPDATE users SET embedding = $2::vector, embedded_at = now() WHERE id = $1', [userId, literal]);
  return literal;
}
