// What a good cold email is, written down: the banned phrases, the examples the model sees, and the
// checks every draft has to pass in code after it's written (length, no slop, nothing made up, opt-out line).

export const WORDS = { min: 60, max: 90 };
export const FOLLOWUP_WORDS = { min: 20, max: 60 };

export const BANNED = [
  'i hope this email finds you well', 'i hope this finds you well', 'i hope you are doing well', 'i am writing to', "i'm writing to",
  'i am reaching out', "i'm reaching out", 'reaching out to express', 'i came across your', 'to whom it may concern', 'dear sir', 'dear madam',
  'passionate', 'leverage', 'synergy', 'delve', 'dynamic team', 'innovative', 'cutting-edge', 'cutting edge', 'game-changer', 'game changer',
  'revolutioniz', 'in today’s fast-paced', "in today's fast-paced", 'fast-paced world', 'esteemed', 'thrilled', 'excited to apply',
  'perfect fit', 'rockstar', 'ninja', 'tapestry', 'elevate', 'unlock', 'seamless', 'robust', 'furthermore', 'moreover', 'additionally',
  'valuable addition', 'great addition', 'i believe i would be', 'i am confident that', 'look forward to hearing from you',
  'thank you for your time and consideration', 'kindly', 'do the needful', 'revert back', 'humbly', 'hardworking', 'hard-working',
  'team player', 'go-getter', 'self-starter', 'detail-oriented', 'results-driven', 'proven track record', 'deeply resonate', 'resonates with me',
  'align with my', 'aligns with my', 'aligns perfectly', 'testament to', 'journey', 'realm', 'landscape', 'spearhead', 'embark',
];

export const OPT_OUT_RE = /\b(not (a|the right)? ?(fit|relevant|a good time)|no worries|won['’]t follow up|won['’]t bother|just say so|reply ['"“]?no|feel free to ignore|ignore this)\b/i;
export const OPT_OUT_LINES = [
  "If it's not a fit, just say so and I won't follow up.",
  "If this isn't relevant, no worries. I won't follow up.",
  "Not a fit right now? Just say so and I won't bother you again.",
];

const GOOD = [
  {
    facts: 'Company: Ledgerly, raised $4M seed (Entrackr). Role: Backend Intern. Proof: built a Go service that syncs 40k bank transactions a day for a college fintech club.',
    email: `Hi Priya,

Saw the $4M seed on Entrackr, congrats. Reconciling bank feeds is the part of fintech I keep getting pulled into.

Last semester I wrote a Go service for our college fintech club that syncs about 40k transactions a day from three bank APIs, with retries and idempotency keys so nothing double-counts.

Would you be open to a 15-minute call about the backend internship?

If it's not a fit, just say so and I won't follow up.

Rahul`,
  },
  {
    facts: 'Company: Tinyform (YC S25), forms that fill themselves. Role: Frontend Engineer, new grads ok. Proof: React drag-and-drop form builder, 1,200 GitHub stars.',
    email: `Hi Sam,

Tinyform's auto-filling forms are a neat idea. Most form builders still make people type the same address five times.

I built an open-source drag-and-drop form builder in React that's at 1,200 stars on GitHub, so I've spent a lot of time on form state and keyboard flows.

You're hiring a frontend engineer and say new grads are ok. Could I send a short demo or jump on a call?

No worries if not, I won't follow up.

Aditi`,
  },
  {
    facts: 'Company: Kisanly, launched crop-price alerts on WhatsApp. Role: none listed. Proof: Python scraper for mandi prices across 120 markets.',
    email: `Hi Arjun,

Saw the WhatsApp crop-price alerts launch. Getting mandi prices to farmers that fast is hard.

I wrote a Python scraper that pulls daily prices from 120 mandis and cleans the unit mess (quintals vs kg), which sounds close to your data pipeline.

You don't have an internship listed, but would a 3-month data internship be worth a quick chat?

If it's not relevant, just say so and I won't follow up.

Neha`,
  },
];

const BAD = [
  {
    email: `Dear Sir/Madam, I hope this email finds you well. I am writing to express my keen interest in joining your innovative and dynamic team. I am a passionate, hardworking self-starter with a proven track record, and I am confident I would be a valuable addition. I look forward to hearing from you. Thank you for your time and consideration.`,
    why: 'Generic, no company fact, no proof, every sentence could be sent to anyone, banned phrases throughout.',
  },
  {
    email: `Hi! Your company is revolutionizing the industry and I'd love to leverage my skills in AI, ML, blockchain, cloud and web to elevate your product to the next level. Let's connect!`,
    why: 'Invented praise, a list of buzzwords instead of one real thing built, no clear ask, no opt-out.',
  },
];

/** Two or three examples picked at random, so emails don't all come out sounding the same. */
export function pickExamples(rand = Math.random) {
  const good = [...GOOD].sort(() => rand() - 0.5).slice(0, 2);
  const bad = BAD[Math.floor(rand() * BAD.length)];
  return { good, bad };
}

const GREETING = /^(hi|hey|hello|dear)\b[^\n]*$/i;
const SIGNOFF = /^(thanks|thank you|best|cheers|regards|warmly|sincerely)\b/i;

/** Words in the email's main text: not the greeting, the sign-off/name, or the opt-out line. */
export function bodyWords(body) {
  let lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && GREETING.test(lines[0])) lines = lines.slice(1);
  lines = lines.filter((l) => !OPT_OUT_RE.test(l) || l.split(/\s+/).length > 22);
  // Name / sign-off at the end: a short last line (and a sign-off before it).
  while (lines.length && (SIGNOFF.test(lines[lines.length - 1]) || lines[lines.length - 1].split(/\s+/).length <= 3 || /^(https?:\/\/|github\.com|linkedin\.com)/i.test(lines[lines.length - 1]))) lines.pop();
  return lines.join(' ').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[’]/g, "'");

/**
 * Checks run on every draft. `facts` is everything we're allowed to say (company fact, role, proof points, links).
 * Returns { ok, words, items: [{ id, ok, label, detail }] }
 */
export function checkEmail({ subject, body }, facts, { followup = false } = {}) {
  const items = [];
  const range = followup ? FOLLOWUP_WORDS : WORDS;
  const words = bodyWords(body);
  items.push({ id: 'length', ok: words >= range.min && words <= range.max, label: `${words} words`, detail: `Aim for ${range.min}–${range.max} words.` });

  const text = norm(`${subject}\n${body}`);
  const banned = BANNED.filter((b) => text.includes(b));
  items.push({ id: 'slop', ok: banned.length === 0, label: banned.length ? `Sounds like AI: “${banned[0]}”` : 'No AI-sounding phrases', detail: banned.join(', ') });

  items.push({ id: 'optout', ok: OPT_OUT_RE.test(body), label: OPT_OUT_RE.test(body) ? 'Has an easy way to say no' : 'Missing the opt-out line', detail: '' });

  // Nothing made up: every number and every link in the email must come from the facts.
  const allowed = norm(JSON.stringify(facts));
  const numbers = (String(body).match(/\d[\d,.]*(?:\s?(?:%|k\b|m\b|mn\b|million\b|cr\b|crore\b|x\b))?/gi) || [])
    .map((n) => n.trim().replace(/[.,]$/, ''))
    .filter((n) => n.length && !/^(15|20|30|10|5|3|2|1)(-| )?$/.test(n)); // "a 15-minute call" is fine
  const unknownNumbers = numbers.filter((n) => !allowed.includes(norm(n).replace(/\s/g, '')) && !allowed.includes(norm(n)));
  const links = String(body).match(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s)]*/gi) || [];
  const unknownLinks = links.filter((l) => !allowed.includes(norm(l).replace(/^https?:\/\//, '').replace(/\/$/, '')));
  const madeUp = [...unknownNumbers, ...unknownLinks];
  items.push({ id: 'facts', ok: madeUp.length === 0, label: madeUp.length ? `Check this: “${madeUp[0]}” isn’t in your profile or our facts` : 'Every claim is from your profile or a source', detail: madeUp.join(', ') });

  const placeholders = String(body + subject).match(/\[[^\]]+\]|\{[^}]+\}|<[^>]+>/g) || [];
  items.push({ id: 'placeholders', ok: placeholders.length === 0, label: placeholders.length ? `Fill in ${placeholders[0]}` : 'No blanks left', detail: '' });

  const subj = String(subject || '').trim();
  const subjectOk = subj.length > 0 && subj.split(/\s+/).length <= 9 && !/^(application|applying) for/i.test(subj) && subj !== subj.toUpperCase();
  if (!followup) items.push({ id: 'subject', ok: subjectOk, label: subjectOk ? 'Short, specific subject' : 'Subject should be short and specific', detail: '' });

  return { ok: items.every((i) => i.ok), words, items };
}

export const RULES_TEXT = `Rules for the email:
- ${WORDS.min}-${WORDS.max} words in the main text (not counting the greeting, sign-off and opt-out line).
- Greeting with the person's first name. Plain words, short sentences, the way a sharp student texts a busy founder.
- Exactly one company fact, the one given. Exactly one proof point from the person, the one given, with its real numbers.
- One clear ask (a short call, or permission to send a demo). End with the opt-out line given, then the sender's first name.
- Use ONLY the facts provided. Never invent numbers, customers, features, mutual friends, praise or experience.
- Never use these phrases or anything like them: ${BANNED.slice(0, 40).join('; ')}.
- No em dashes, no exclamation marks, no emojis, no buzzword lists, no "I am passionate about".
- Subject: 2-7 words, specific to them, lowercase is fine, never "Application for".`;
