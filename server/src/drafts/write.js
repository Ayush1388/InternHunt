// Writing one email. Inputs are only verified facts: one about the company (funding, launch, YC batch or the role),
// one real proof point from the person, one ask. With a Gemini key: draft, then a critic pass that checks
// every claim against the facts and tightens it. Without one: a careful template. Code checks run either way.
import { aiEnabled, generateJson } from '../ai/gemini.js';
import { RULES_TEXT, OPT_OUT_LINES, checkEmail, pickExamples, WORDS } from './rules.js';
import { firstName } from '../lib/names.js';
import { skillRe } from '../lib/skills.js';

const SOURCE_NAME = { entrackr: 'Entrackr', inc42: 'Inc42', startuptalky: 'StartupTalky', yc: 'YC' };
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const roundWord = (r) => (/^series/i.test(r) ? r : r.toLowerCase());
const trimDot = (s) => String(s || '').trim().replace(/[.\s]+$/, '');

/** The single company fact we're allowed to mention, best first. */
export function companyFact(company, job, signal) {
  if (signal?.kind === 'funding' && Date.now() - Date.parse(signal.date) < 120 * 86400000) {
    return {
      kind: 'funding',
      text: `${company.name} raised ${signal.amount || 'a round'}${signal.round ? ` (${signal.round})` : ''}, reported by ${SOURCE_NAME[signal.source] || signal.source}`,
      amount: signal.amount, round: signal.round, source: SOURCE_NAME[signal.source] || signal.source, url: signal.url,
    };
  }
  if (signal?.kind === 'launch') return { kind: 'launch', text: `${company.name} launched: ${signal.title}`, title: signal.title, url: signal.url };
  if (company.yc_batch && company.one_liner) return { kind: 'yc', text: `${company.name} (YC ${company.yc_batch}): ${company.one_liner}`, batch: company.yc_batch, oneLiner: company.one_liner };
  if (job) return { kind: 'role', text: `${company.name} is hiring: ${job.title}`, title: job.title, url: job.url };
  if (company.one_liner) return { kind: 'about', text: `${company.name}: ${company.one_liner}`, oneLiner: company.one_liner };
  return { kind: 'none', text: company.name };
}

/** The person's proof point that best fits this role: one of their own lines, else their matching skills. */
export function proofPoint(profile = {}, job) {
  const proofs = (profile.proofs || []).map((s) => trimDot(s)).filter(Boolean);
  const jobText = job ? `${job.title} ${(job.tags || []).join(' ')} ${(job.languages || []).join(' ')} ${String(job.description || '').slice(0, 4000)}` : '';
  const skills = profile.skills || [];
  const matching = jobText ? skills.filter((s) => skillRe(s).test(jobText)) : skills;
  if (proofs.length) {
    const scored = proofs.map((p) => ({ p, n: skills.filter((s) => skillRe(s).test(p) && (!jobText || skillRe(s).test(jobText))).length }));
    scored.sort((a, b) => b.n - a.n);
    return { kind: 'proof', text: scored[0].p, skills: matching.slice(0, 3) };
  }
  return { kind: 'skills', text: '', skills: (matching.length ? matching : skills).slice(0, 3) };
}

export function buildFacts({ user, company, job, contact, signal }) {
  const profile = user.profile || {};
  const links = [profile.github ? `github.com/${profile.github}` : '', profile.portfolio || '', profile.linkedin || ''].filter(Boolean);
  return {
    to: { name: contact?.name || '', firstName: firstName(contact?.name || ''), title: contact?.title || '' },
    company: companyFact(company, job, signal),
    companyName: company.name,
    role: job ? { title: job.title, level: job.level, newGrad: /new grads? ok|any/i.test(job.description || ''), url: job.url } : null,
    proof: proofPoint(profile, job),
    sender: { firstName: firstName(user.name || profile.name || ''), links },
    ask: job?.level === 'intern' || profile.kind === 'intern' ? 'internship' : 'role',
  };
}

const pretty = (s) => ({ typescript: 'TypeScript', javascript: 'JavaScript', 'node.js': 'Node.js', 'next.js': 'Next.js', 'c++': 'C++', 'c#': 'C#', sql: 'SQL', aws: 'AWS', css: 'CSS', html: 'HTML', llm: 'LLMs', ios: 'iOS', graphql: 'GraphQL', postgresql: 'Postgres', mongodb: 'MongoDB' })[s] || s.replace(/\b\w/g, (c) => c.toUpperCase());
const andList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** No-AI writer: short sentences assembled from the facts, with a few variants so they don't all match. */
export function templateEmail(facts, rand = Math.random) {
  const f = facts.company;
  const co = facts.companyName;
  const hello = `${pick(['Hi', 'Hey'], rand)} ${facts.to.firstName || 'there'},`;
  const opener = {
    funding: () => pick([`Saw on ${f.source} that ${co} raised ${f.amount || 'a new round'}${f.round ? ` in its ${roundWord(f.round)} round` : ''}. Congrats.`, `Congrats on the ${f.amount ? `${f.amount} ` : ''}${f.round ? `${roundWord(f.round)} round` : 'raise'}, I read about it on ${f.source}.`], rand),
    launch: () => `Saw the launch: ${lc(trimDot(f.title))}. Nice work getting it out.`,
    yc: () => pick([`${co} caught my eye in the YC ${f.batch} list: ${lc(trimDot(f.oneLiner))}.`, `I've been reading about ${co} from YC ${f.batch}. ${trimDot(f.oneLiner)} is a problem worth working on.`], rand),
    role: () => `I saw ${co} is hiring for a ${f.title}.`,
    about: () => `${trimDot(f.oneLiner)} is the kind of product I'd like to help build.`,
    none: () => `I've been following what ${co} is building.`,
  }[f.kind]();
  const p = facts.proof;
  const skills = andList(p.skills.map(pretty));
  const many = p.skills.length > 1;
  const VERB = /^(built|made|created|wrote|shipped|designed|developed|led|won|launched|trained|scaled|deployed|automated|contributed|ran|organised|organized|published|reduced|improved)\b/i;
  const proof = p.kind === 'proof'
    ? VERB.test(p.text.replace(/^i\s+/i, '')) ? `I ${lc(p.text.replace(/^i\s+/i, ''))}.` : `One thing I've built: ${lc(p.text)}.`
    : skills ? `I work mostly in ${skills} and ship small projects with ${many ? 'them' : 'it'}.` : 'I build web projects in my own time and ship them end to end.';
  const extra = skills && p.kind === 'proof' ? `Day to day I work in ${skills}.` : '';
  const role = facts.role;
  const link = role ? `That's close to what the ${role.title} role asks for.` : '';
  const ask = role
    ? pick([`Would you be open to a 15-minute call about the ${role.title} role?`, `Could I send a short demo, or take 15 minutes of your time about the ${role.title} opening?`], rand)
    : facts.ask === 'internship'
      ? `You don't have an internship listed, but would a short chat about one be worth 15 minutes?`
      : `Would you be open to a 15-minute call about joining the team?`;
  const links = facts.sender.links.length ? `\n${facts.sender.links[0]}` : '';
  const fillers = ['Happy to share more of what I have built if useful.', 'I can send a short walkthrough of the code if that is easier than a call.'];
  const optOut = pick(OPT_OUT_LINES, rand);
  const compose = (n) => {
    const middle = [opener, [proof, extra, link].filter(Boolean).join(' '), ...fillers.slice(0, n), ask].filter(Boolean);
    return `${hello}\n\n${middle.join('\n\n')}\n\n${optOut}\n\n${facts.sender.firstName || 'Thanks'}${links}`;
  };
  let body = compose(0);
  for (let n = 1; n <= fillers.length && checkEmail({ subject: 'x', body }, facts).words < WORDS.min; n++) body = compose(n);
  const subject = role
    ? pick([`${role.title} at ${co}`, `${co}: ${facts.ask === 'internship' ? 'internship' : 'the open role'}`], rand)
    : `${facts.ask === 'internship' ? 'Internship' : 'Joining'} at ${co}?`;
  return { subject, body };
}

const SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
};
const CRITIC_SCHEMA = {
  type: 'object',
  properties: { problems: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, body: { type: 'string' } },
  required: ['problems', 'subject', 'body'],
};

function styleText(style = {}, samples = []) {
  const notes = [];
  if (style.greeting) notes.push(`They greet with "${style.greeting}".`);
  if (style.signoff) notes.push(`They sign off with "${style.signoff}".`);
  if (style.avgWords) notes.push(`Their edited emails average ${style.avgWords} words.`);
  if (style.contractions === false) notes.push('They avoid contractions.');
  const ex = samples.slice(0, 2).map((s, i) => `Email they edited and sent (${i + 1}):\n${s.after}`).join('\n\n');
  return notes.length || ex ? `\nThe sender's own writing style (match it):\n${notes.join(' ')}\n${ex}` : '';
}

/**
 * @returns {{ subject, body, checks, model, facts }}
 */
export async function writeEmail({ facts, style = {}, samples = [], rand = Math.random }) {
  if (!aiEnabled()) {
    const t = templateEmail(facts, rand);
    return { ...t, checks: checkEmail(t, facts), model: 'template', facts };
  }
  const { good, bad } = pickExamples(rand);
  const prompt = `Write one cold email.

Facts you may use (and nothing else):
${JSON.stringify(facts, null, 2)}

Opt-out line to end with (use it word for word): "${pick(OPT_OUT_LINES, rand)}"

Good examples (different facts; copy the tone, not the words):
${good.map((g, i) => `Example ${i + 1}. Facts: ${g.facts}\n${g.email}`).join('\n\n')}

Bad example (never write like this): ${bad.email}
Why it's bad: ${bad.why}
${styleText(style, samples)}

Return JSON {"subject": "...", "body": "..."}. The body includes the greeting, the opt-out line and the sender's first name on the last line${facts.sender.links.length ? `, then ${facts.sender.links[0]} on its own line` : ''}.`;
  let model = 'gemini';
  let draft;
  try {
    const r = await generateJson({ system: `You write short, specific cold emails from students to startup founders.\n${RULES_TEXT}`, prompt, schema: SCHEMA, temperature: 0.9 });
    draft = r.data;
    model = r.model;
  } catch (err) {
    console.error('[drafts] model failed, using template', err.message);
    const t = templateEmail(facts, rand);
    return { ...t, checks: checkEmail(t, facts), model: 'template', facts };
  }

  // Critic pass: fact-check against the inputs, cut slop, fix length. Then the code checks decide.
  let best = draft;
  let checks = checkEmail(best, facts);
  for (let round = 0; round < 2 && !checks.ok; round++) {
    try {
      const r = await generateJson({
        system: `You are a strict editor. ${RULES_TEXT}`,
        prompt: `Facts (the only things the email may claim):\n${JSON.stringify(facts, null, 2)}\n\nDraft:\nSubject: ${best.subject}\n\n${best.body}\n\nAutomatic checks that failed:\n${checks.items.filter((i) => !i.ok).map((i) => `- ${i.label}${i.detail ? ` (${i.detail})` : ''}`).join('\n')}\n\nList every problem (claims not in the facts, slop, length, missing opt-out), then return the corrected subject and body. Keep the person's voice.`,
        schema: CRITIC_SCHEMA,
        temperature: 0.3,
      });
      const next = { subject: r.data.subject, body: r.data.body };
      const nextChecks = checkEmail(next, facts);
      if (nextChecks.items.filter((i) => i.ok).length >= checks.items.filter((i) => i.ok).length) {
        best = next;
        checks = nextChecks;
      }
    } catch {
      break;
    }
  }
  // Always one critic pass for facts even when checks pass (cheap, and catches invented praise).
  if (checks.ok) {
    try {
      const r = await generateJson({
        system: `You are a strict fact-checker and editor. ${RULES_TEXT}`,
        prompt: `Facts:\n${JSON.stringify(facts, null, 2)}\n\nEmail:\nSubject: ${best.subject}\n\n${best.body}\n\nIf any sentence claims something that isn't in the facts, or sounds generic, fix it. Otherwise return it unchanged. Return problems found (empty list if none) and the final subject and body.`,
        schema: CRITIC_SCHEMA,
        temperature: 0.2,
      });
      const next = { subject: r.data.subject, body: r.data.body };
      const nextChecks = checkEmail(next, facts);
      if (nextChecks.ok) {
        best = next;
        checks = nextChecks;
      }
    } catch {
      /* keep the checked draft */
    }
  }
  return { subject: best.subject.trim(), body: best.body.trim(), checks, model, facts };
}

/** A short bump in the same thread. Always template: there is nothing new to say, so keep it human and brief. */
export function followupEmail({ n, toFirstName, senderFirstName, companyName, roleTitle }, rand = Math.random) {
  const hi = `Hi ${toFirstName || 'there'},`;
  const lines = {
    1: [`Bumping this in case it got buried. Still keen on ${roleTitle ? `the ${roleTitle} role` : `working with ${companyName}`}, and happy to send a short demo of what I've built instead of a call.`],
    2: [`Quick follow-up on my note about ${roleTitle ? `the ${roleTitle} role` : companyName}. If someone else on the team is the right person, I'd be grateful for a pointer.`],
    3: [`Last note from me on this. If the timing changes and ${companyName} needs help, I'd love to hear from you.`],
  }[n] || [];
  const close = n >= 3 ? "Thanks either way, and I won't follow up again." : "If it's not a fit, just say so and I won't follow up.";
  const body = `${hi}\n\n${pick(lines, rand)}\n\n${close}\n\n${senderFirstName || 'Thanks'}`;
  return { body };
}

/** Learn simple style notes from the person's edits (greeting, sign-off, length, contractions). */
export function learnStyle(samples) {
  if (!samples.length) return {};
  const after = samples.map((s) => s.after);
  const greet = after.map((b) => /^(hi|hey|hello|dear)\b/i.exec(b.trim())?.[1]).filter(Boolean);
  const sign = after.map((b) => /\n\s*(thanks|thank you|best|cheers|regards)[^\n]*\n[^\n]*$/i.exec(b)?.[1]).filter(Boolean);
  const mode = (xs) => xs.sort((a, b) => xs.filter((x) => x === b).length - xs.filter((x) => x === a).length)[0];
  const words = after.map((b) => b.split(/\s+/).length);
  const contractions = after.some((b) => /\b\w+'(s|re|ll|ve|d|t|m)\b/i.test(b));
  return {
    greeting: greet.length ? mode(greet).replace(/^./, (c) => c.toUpperCase()) : undefined,
    signoff: sign.length ? mode(sign).replace(/^./, (c) => c.toUpperCase()) : undefined,
    avgWords: Math.round(words.reduce((a, b) => a + b, 0) / words.length),
    contractions,
    samples: samples.length,
  };
}
