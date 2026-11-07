import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BadgeCheck, BellRing, Building2, Check, ChevronLeft, ChevronRight, Clock, FileText, GraduationCap, House, IndianRupee, LayoutGrid, Lock,
  Mail, Newspaper, Plus, Reply, Rocket, Send, Settings, ShieldCheck, Sparkles, Wallet, Zap, KanbanSquare, Inbox, Trash2, Search,
} from 'lucide-react';
import { BRAND, siteConfig, telegramUrl } from '@/brand';
import './landing.css';
import './landing-tg.css';

// Palette copied from backdoorai.app (see backdoorai.app.md): white page, #111 ink, #6E6E72 muted, #F5F4F1 chips,
// pastel tiles, one dark band, Gmail-style red/green highlights. Hero is a real photo (Unsplash, billy_huy)
// faded out at the left and bottom. Motion: short fades, drawn strokes, tilted labels sliding in.
// All startups, numbers and emails shown are made-up examples and are labelled as such.
const APP_HREF = '#/app';
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ data */
const WORDS = ['Inc42', 'Entrackr', 'Y Combinator', 'Greenhouse', 'Lever', 'Ashby', 'StartupTalky', 'Workable', 'Recruitee', 'SmartRecruiters', 'Careers pages'];

const COMPANIES = [
  { n: 'Lumen Labs', l: 'L', city: 'Bengaluru', role: 'ML intern', stipend: 25, wfh: true, batch: 2027, funded: true, sig: 'Raised a seed round' },
  { n: 'Tiffin.ai', l: 'T', city: 'Pune', role: 'SDE intern', stipend: 18, wfh: false, batch: 2027, funded: false, sig: 'Hiring on its careers page' },
  { n: 'Paperkite', l: 'P', city: 'Remote', role: 'Design intern', stipend: 12, wfh: true, batch: 2028, funded: false, sig: 'Launched on Product Hunt' },
  { n: 'Orbit Pay', l: 'O', city: 'Mumbai', role: 'Backend intern', stipend: 30, wfh: false, batch: 2027, funded: true, sig: 'Raised a seed round' },
  { n: 'Kiln', l: 'K', city: 'Remote', role: 'Growth intern', stipend: 22, wfh: true, batch: 2028, funded: true, sig: 'Raised a pre-seed' },
  { n: 'Nimbus Health', l: 'N', city: 'Hyderabad', role: 'Data intern', stipend: 15, wfh: false, batch: 2027, funded: false, sig: 'Launched a new product' },
];
const FILTERS = [
  { id: 'wfh', label: 'Work from home', icon: House, test: (c) => c.wfh },
  { id: 'pay', label: '₹20k+ stipend', icon: Wallet, test: (c) => c.stipend >= 20 },
  { id: 'batch', label: '2027 batch', icon: GraduationCap, test: (c) => c.batch === 2027 },
  { id: 'fund', label: 'Funded this week', icon: Zap, test: (c) => c.funded },
];

// Bad email: [text] is kept, [text, realWords] gets crossed out with the real words written underneath.
const SLOP_SUBJECT = ['Internship Opportunity', 'Your seed round + an ML intern?'];
const SLOP = [
  [['Dear Hiring Manager,', 'Hi Riya,']],
  [['I hope this email finds you well.', 'cut it. says nothing'], [' I am writing to express my '], ['keen interest', 'I want to work on your ML'], [' in an internship at your '], ['esteemed company', 'Lumen Labs'], ['.']],
  [['I am a '], ['passionate, hardworking team player', 'I built a resume ranker'], [' eager to '], ['leverage my skills', 'ship real features'], [' in a dynamic environment. '], ['I believe I would be a great fit.', 'here is the proof']],
  [['Please find my resume attached.', 'can I show you a 2-min demo?']],
  [['Regards,'], <br key="b" />, ['Student', 'Aarav']],
];
// Good email: [text, colour, label] gets a coloured box and a tilted label.
const GOOD = [
  [['Hi Riya,']],
  [["Congrats on Lumen's seed round", 'c1', 'company fact'], [' — saw you’re hiring an ML intern.']],
  [['Last term I built '], ['a resume-ranking tool that sorted 2,000 applications', 'c2', 'real proof'], [' for my college placement cell. It’s the same problem your hiring page describes.']],
  [['Could I send you a 2-minute demo this week?', 'c3', 'one clear ask']],
  [['Not the right person? Tell me and I won’t write again.', 'c4', 'opt-out']],
  [['Aarav']],
];
const countWords = (paras) => paras.flat().filter(Array.isArray).map((s) => s[0]).join(' ').trim().split(/\s+/).length;

const STEPS = [
  { t: 'Tell us what you want', d: 'Upload your resume and say what you want: roles, stipend, duration, remote or on-site. Once, in a minute.' },
  { t: 'We find who’s recruiting', d: 'Funding news, launches and fresh roles, checked every day, so you see startups that are about to hire.' },
  { t: 'Every listed internship too', d: 'Openings from company careers pages and official programs, with last dates, in one list. Scam-like posts are filtered out.' },
  { t: 'We match, you see why', d: 'Hard filters first, then a ranking by fit, with a one-line reason on every match.' },
  { t: 'Apply, or reach the founder', d: 'Apply to listed roles in one click. For the rest, approve a short draft to the founder. Nothing leaves without your tap.' },
];

const FAQ = [
  ['Is this just cold emailing?', 'No. You get two things: every listed internship from company careers pages and official programs, with last dates, and a daily list of startups that are recruiting but may not have posted yet. Outreach is for the second kind.'],
  ['Do you send emails without my approval?', 'Never. Every email is a draft you read, edit and approve, on the web or in Telegram. It goes out from your own Gmail, within a daily limit you set, and nothing is sent until you tap Send.'],
  ['Will my emails sound like AI?', 'Each draft may use only facts we checked: one thing about the company and one real thing from your resume. A second pass checks those facts, code checks length and banned phrases, and we learn your style from your edits.'],
  ['Is it really free?', 'Yes. We are free and invite-only while we learn from our first users. A Pro plan is coming, priced in ₹ and paid by UPI, and early joiners get a better price.'],
  ['What do you store from my resume?', 'Only the list of skills and a one-line summary. On the web your resume is read in your browser; in Telegram we read the PDF once and don’t keep it. Delete everything from Settings, or send /delete to the bot.'],
  ['Where do founder emails come from?', 'Public pages only: Y Combinator company pages and the startup’s own website. Every address is labelled: verified, found on their site, or a best guess from the usual pattern. We never scrape LinkedIn.'],
  ['Is there a Telegram bot?', 'Yes. Open it, tap Start, send your resume as a PDF and pick your roles. Every morning at 8:30 you get a few startups that fit, and each email can be sent, edited or skipped right in the chat. WhatsApp comes later.'],
  ['What happens if they don’t reply?', 'Up to three short follow-ups in the same thread, a few days apart, and each one waits for your OK. The moment anyone replies, follow-ups stop.'],
];

/* ------------------------------------------------------------------ pieces */
function LogoMark({ size = 16, color = '#fff' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M9 7.5h6.2c4.6 0 7.8 3.1 7.8 8.5s-3.2 8.5-7.8 8.5H9zm3.4 3.2v10.6h2.6c2.6 0 4.5-2 4.5-5.3s-1.9-5.3-4.5-5.3z" fillRule="evenodd" fill={color} />
    </svg>
  );
}

/** Real cloud-sky photo, faded to white at the left and bottom, with a few birds crossing the sky. */
function PhotoBg({ birds = true, pos = '50% 40%' }) {
  return (
    <div className="lp-photo" aria-hidden="true">
      <img src="/hero-sky.jpg" alt="" style={{ objectPosition: pos }} decoding="async" fetchpriority="high" />
      <div className="lp-wash" />
      {birds && (
        <>
          <svg className="lp-birds" viewBox="0 0 46 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 9q5-6 10 0q5-6 10 0" /><path d="M26 5q4-4 8 0q4-4 8 0" /></svg>
          <svg className="lp-birds b2" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 7q5-6 10 0q5-6 10 0" /></svg>
          <svg className="lp-birds b3" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 7q5-6 10 0q5-6 10 0" /></svg>
        </>
      )}
    </div>
  );
}

function CountUp({ to }) {
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) return;
    let raf, start;
    const tick = (t) => {
      start ??= t + 900;
      const p = Math.min(1, Math.max(0, (t - start) / 1400));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

function Dashboard() {
  const rows = [['L', 'Lumen Labs', 'ML intern · Remote · raised seed', 'Recruiting', 'hi'], ['T', 'Tiffin.ai', 'SDE intern · Pune · apply by 20 Nov', 'Listed', 'clay'], ['O', 'Orbit Pay', 'Backend intern · Mumbai · founder posted', 'Recruiting', 'hi']];
  return (
    <div className="lp-dash-wrap">
      <div className="lp-dash" role="img" aria-label="Example product screen showing today's startup matches, a fit breakdown and a drafted email">
        <div className="lp-win">
          <aside className="lp-side">
            <div className="brand"><i /> Doorstep</div>
            {[[LayoutGrid, 'Today', 1], [Sparkles, 'Matches'], [Mail, 'Drafts'], [KanbanSquare, 'Pipeline'], [Inbox, 'Replies'], [Settings, 'Settings']].map(([I, t, on]) => (
              <div key={t} className={`it ${on ? 'on' : ''}`}><I size={15} aria-hidden="true" /> {t}</div>
            ))}
          </aside>
          <div className="lp-main">
            <div className="top"><div><h4>Today</h4><div className="sub">Good morning. Here is what happened overnight · example data</div></div><span className="lp-pill">+ New draft</span></div>
            <div className="lp-stats">
              <div className="lp-stat"><small>Recruiting now</small><b><CountUp to={6} /></b></div>
              <div className="lp-stat"><small>Listed internships</small><b><CountUp to={24} /></b></div>
              <div className="lp-stat"><small>Best match</small><b><CountUp to={96} /><em>%</em></b></div>
            </div>
            {rows.map(([l, n, d, tag, hi]) => (
              <div className="lp-row" key={n}>
                <span className="lg" style={hi === 'hi' ? { background: 'var(--moss-t)' } : undefined}>{l}</span>
                <span className="tx"><b>{n}</b><span>{d}</span></span>
                <span className={`lp-tag ${hi}`}>{tag}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-float f1"><span className="ck"><Check size={11} color="#fff" aria-hidden="true" /></span> Sources verified</div>
        <div className="lp-float f3">
          <h5>Fit breakdown</h5><small>Lumen Labs · ML intern</small>
          <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
            <div className="hatch" style={{ '--w': '92%' }} /><div className="hatch" style={{ '--w': '78%' }} /><div className="hatch red" style={{ '--w': '36%' }} />
          </div>
        </div>
        <div className="lp-float f4">
          <small>Draft for Riya</small>
          <h5 style={{ marginTop: 2 }}>“Congrats on the seed round. I built a resume-ranking tool…”</h5>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}><span className="lp-tag" style={{ background: 'var(--ink)', color: '#fff' }}>SEND</span><span className="lp-tag">EDIT</span><span className="lp-tag">SKIP</span></div>
        </div>
      </div>
    </div>
  );
}

function StepVisual({ i }) {
  if (i === 0) return (
    <div className="lp-box">
      <div className="lp-row" style={{ marginBottom: 14 }}><span className="lg"><FileText size={16} aria-hidden="true" /></span><span className="tx"><b>resume.pdf</b><span>Parsed · 2 pages</span></span><span className="lp-tag hi">Ready</span></div>
      <div className="lp-chips">{['2027 batch', 'ML / Backend', 'Remote', '₹15k+', '3 months+', 'Bengaluru'].map((c, k) => <span key={c} className={`lp-chip ${k < 4 ? 'on' : ''}`}>{c}</span>)}</div>
    </div>
  );
  if (i === 1) return (
    <div>
      {[['L', 'Lumen Labs', 'Raised a seed round · 2 days ago', 'Funding news'], ['O', 'Orbit Pay', 'Founder posted “we’re hiring”', 'Recruiting'], ['P', 'Paperkite', 'Launched this week', 'Product Hunt']].map(([l, n, d, s]) => (
        <div className="lp-row" key={n}><span className="lg">{l}</span><span className="tx"><b>{n}</b><span>{d}</span></span><span className="lp-tag hi">{s}</span></div>
      ))}
    </div>
  );
  if (i === 2) return (
    <div>
      {[['T', 'Tiffin.ai', 'SDE intern · Pune · ₹18k', 'Apply by 20 Nov'], ['K', 'Kiln', 'Growth intern · Remote · ₹22k', 'Apply by 28 Nov'], ['N', 'Nimbus Health', 'Data intern · Hyderabad · ₹15k', 'Rolling']].map(([l, n, d, s]) => (
        <div className="lp-row" key={n}><span className="lg">{l}</span><span className="tx"><b>{n}</b><span>{d}</span></span><span className="lp-tag clay">{s}</span></div>
      ))}
    </div>
  );
  if (i === 3) return (
    <div className="lp-box">
      <div className="lp-big"><div><small style={{ color: 'var(--muted)' }}>Lumen Labs · ML intern</small><br /><b>96%</b></div><span className="lp-tag hi">Strong fit</span></div>
      <div className="lp-fit">
        {[['Skills', 92, ''], ['Stipend', 100, ''], ['Location', 80, ''], ['Batch', 36, 'red']].map(([k, v, r]) => (
          <div className="r" key={k}><span>{k}</span><div className={`hatch ${r}`} style={{ '--w': `${v}%` }} /><b>{v}%</b></div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="lp-box">
      <div className="lp-row" style={{ marginBottom: 12 }}><span className="lg">T</span><span className="tx"><b>Tiffin.ai · listed role</b><span>Opens their application page and adds it to your tracker</span></span><span className="lp-tag clay">Apply</span></div>
      <small style={{ color: 'var(--muted)' }}>Lumen Labs · not posted yet · draft to Riya</small>
      <p style={{ marginTop: 6, fontSize: 15 }}>Congrats on Lumen’s seed round. I built a resume-ranking tool that sorted 2,000 applications for my college placement cell. Could I send you a 2-minute demo this week?</p>
      <div className="lp-qr"><span>SEND</span><span>EDIT</span><span>SKIP</span></div>
    </div>
  );
}

function HowApp() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || reduced()) return;
    const t = setTimeout(() => setI((x) => (x + 1) % STEPS.length), 5500);
    return () => clearTimeout(t);
  }, [i, auto]);
  return (
    <div className="lp-app rv">
      <div className="lp-steps" role="tablist" aria-label="How it works">
        {STEPS.map((s, k) => (
          <button key={s.t} role="tab" id={`tab-${k}`} aria-selected={i === k} aria-controls="how-panel" className="lp-stepbtn" onClick={() => { setI(k); setAuto(false); }}>
            <span className="n">{k + 1}</span>{s.t}
            <span className="bar">{i === k && auto && <i key={`${i}`} />}</span>
          </button>
        ))}
      </div>
      <div className="lp-panel" role="tabpanel" id="how-panel" aria-labelledby={`tab-${i}`}>
        <div className="lp-panel-h"><h3>{STEPS[i].t}</h3><span>/ step {i + 1}</span></div>
        <p>{STEPS[i].d}</p>
        <div className="lp-vis step-on" key={i}><StepVisual i={i} /></div>
      </div>
    </div>
  );
}

function MailChrome({ kind, status, subject, children, words, verdict }) {
  return (
    <article className={`lp-mail ${kind} rv`} style={{ '--d': kind === 'good' ? 2 : 0 }}>
      <div className="lp-mail-top"><span className="st"><i />{status}</span><span>New message</span></div>
      <div className="lp-mail-to">To <span className="chip"><i>R</i>Riya · Founder, Lumen Labs (example)</span></div>
      <div className="lp-mail-to">{subject}</div>
      <div className="lp-mail-b">{children}</div>
      <div className="lp-mail-foot"><span className="send">Send</span><span>{words} words · {verdict}</span></div>
    </article>
  );
}

function BadMail() {
  let k = 0;
  const seg = (s, i) => {
    if (!Array.isArray(s)) return s;
    const [old, real] = s;
    if (!real) return <span key={i}>{old}</span>;
    return <span key={i} className="sw" style={{ '--k': k++ }}><span className="o">{old}</span><span className="n">{real}</span></span>;
  };
  const subj = <>Subject:&nbsp;{seg(SLOP_SUBJECT, 's')}</>;
  return (
    <MailChrome kind="bad" status="Why founders skip it" subject={subj} words={countWords(SLOP)} verdict="6 empty phrases">
      {SLOP.map((p, i) => <p key={i} style={{ marginBottom: 6 }}>{p.map(seg)}</p>)}
    </MailChrome>
  );
}

function GoodMail() {
  let k = 0;
  return (
    <MailChrome kind="good" status="Why founders reply" subject="Subject: Your seed round + an ML intern?" words={countWords(GOOD)} verdict="0 empty phrases">
      {GOOD.map((p, i) => (
        <p key={i} style={{ marginBottom: 8 }}>
          {p.map(([t, c, label], j) => {
            if (!c) return <span key={j}>{t}</span>;
            const kk = k++;
            return <span key={j}><mark className={`fx ${c}`} style={{ '--k': kk }}>{t}</mark><em className={`lbl ${c}`} style={{ '--k': kk }}>{label}</em></span>;
          })}
        </p>
      ))}
    </MailChrome>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="lp-faq">
      {FAQ.map(([q, a], i) => (
        <div key={q} className="rv" style={{ '--d': i }}>
          <div className={`lp-q ${open === i ? 'open' : ''}`}>
            <button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
              {q}<span className="plus"><Plus size={16} aria-hidden="true" /></span>
            </button>
            <div className="lp-a" id={`faq-${i}`} role="region"><div><p>{a}</p></div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterDemo() {
  const [on, setOn] = useState(new Set(['wfh']));
  const toggle = (id) => setOn((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const active = FILTERS.filter((f) => on.has(f.id));
  const matches = COMPANIES.map((c) => active.every((f) => f.test(c)));
  const count = matches.filter(Boolean).length;
  return (
    <div className="lp-demo rv">
      <div className="lp-filters" role="group" aria-label="Try the filters">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button key={id} className="lp-fchip" aria-pressed={on.has(id)} onClick={() => toggle(id)}><Icon size={16} aria-hidden="true" /> {label}</button>
        ))}
      </div>
      <div className="lp-list">
        {COMPANIES.map((c, i) => (
          <article key={c.n} className={`lp-co ${matches[i] ? '' : 'off'}`}>
            <div className="lp-co-h"><span className="lg">{c.l}</span><div><b>{c.n}</b><span>{c.role} · {c.city}</span></div></div>
            <p>{c.sig}</p>
            <div className="lp-tags" style={{ marginTop: 0 }}>
              <span>₹{c.stipend}k / mo</span><span>{c.wfh ? 'WFH' : 'On-site'}</span><span>{c.batch} batch</span>{c.funded && <span style={{ background: 'var(--rose-t)', color: '#7c2343' }}>funded last week</span>}
            </div>
          </article>
        ))}
      </div>
      <p className="lp-count" aria-live="polite"><b>{count}</b> of {COMPANIES.length} example startups match · every name here is made up for the demo</p>
    </div>
  );
}

function Waitlist() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const confetti = (el) => {
    if (reduced() || !el) return;
    const r = el.getBoundingClientRect();
    const colors = ['#111111', '#3aa5f6', '#feefc3', '#fff1e6', '#e3f6ea', '#d3e3fd'];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('i');
      p.className = 'lp-conf';
      p.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${colors[i % 6]};--x:${(Math.random() - 0.5) * 340}px;--y:${-110 - Math.random() * 170}px;--r:${Math.random() * 720}deg`;
      document.querySelector('.lp').appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('That email doesn’t look right.');
    setErr('');
    const btn = e.currentTarget.querySelector('button');
    fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, kind: 'pro' }) })
      .then((r) => r.json().then((b) => (r.ok ? b : Promise.reject(new Error(b.error || 'Try again')))))
      .then(() => { setDone(true); confetti(btn); })
      .catch((x) => setErr(x.message));
  };
  if (done) return <div className="lp-ok" role="status" style={{ marginTop: 'auto' }}><BadgeCheck size={20} aria-hidden="true" /> You’re on the list. We’ll email you before Pro opens.</div>;
  return (
    <form onSubmit={submit} noValidate style={{ marginTop: 'auto' }}>
      <div className="lp-form">
        <input className="lp-field" type="email" inputMode="email" autoComplete="email" placeholder="you@college.edu" aria-label="Email for the Pro waitlist" aria-invalid={Boolean(err)} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn clay" type="submit" data-mag>Join waitlist</button>
      </div>
      {err && <p role="alert" style={{ color: '#ff8a80', fontSize: 14, marginTop: 8 }}>{err}</p>}
    </form>
  );
}

/* ------------------------------------------------------------------ Telegram */
// The morning chat, played as a short scene: typing dots, then each message. Everything in it is an example.
const CHAT = [
  { who: 'bot', t: 'text', text: '☀️ Morning, Riya. 3 new startups for you today:', at: '8:30' },
  { who: 'bot', t: 'pick', at: '8:30' },
  { who: 'tap', target: 'write' },
  { who: 'bot', t: 'draft', at: '8:31' },
  { who: 'tap', target: 'send' },
  { who: 'bot', t: 'sent', at: '8:31' },
];

function TgPhone({ bot }) {
  const ref = useRef(null);
  const [step, setStep] = useState(reduced() ? CHAT.length : 0);
  const [typing, setTyping] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (reduced()) return;
    const io = new IntersectionObserver(([e]) => setLive(e.isIntersecting), { threshold: 0.35 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!live || reduced()) return;
    let t;
    if (step >= CHAT.length) {
      t = setTimeout(() => setStep(0), 6000);
    } else if (CHAT[step].who === 'bot') {
      setTyping(true);
      t = setTimeout(() => { setTyping(false); setStep((s) => s + 1); }, step === 0 ? 900 : 1300);
    } else {
      t = setTimeout(() => setStep((s) => s + 1), 1100);
    }
    return () => clearTimeout(t);
  }, [step, live]);
  const shown = CHAT.slice(0, step);
  const tapped = (target) => shown.some((m) => m.who === 'tap' && m.target === target);
  const scroller = useRef(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' }); }, [step, typing]);

  return (
    <div className="tg-phone" ref={ref} role="img" aria-label={`Example ${BRAND} Telegram chat: a morning pick, a drafted email with Send, Edit and Skip buttons, and a sent confirmation`}>
      <div className="tg-notch" />
      <div className="tg-top">
        <ChevronLeft size={20} aria-hidden="true" />
        <span className="tg-av"><LogoMark size={15} /></span>
        <div><b>{BRAND}</b><small>{typing ? 'typing…' : 'bot'}</small></div>
      </div>
      <div className="tg-chat" ref={scroller}>
        <span className="tg-day">Today</span>
        {shown.map((m, i) => {
          if (m.who === 'tap') return null;
          if (m.t === 'text') return <div key={i} className="tg-b in">{m.text}<time>{m.at}</time></div>;
          if (m.t === 'pick') {
            return (
              <div key={i} className="tg-grp">
                <div className="tg-b in">
                  <b>1. Lumen Labs</b> · resume screening for colleges<br />
                  💸 Raised $2 Mn seed · yesterday<br />
                  Hiring: <u>ML Intern</u> · Remote<br />
                  <i>Python and PyTorch from your profile are in this role</i>
                  <time>{m.at}</time>
                </div>
                <div className="tg-kb two"><span className={tapped('write') ? 'tap' : ''}>✍️ Write the email</span><span>Skip</span></div>
              </div>
            );
          }
          if (m.t === 'draft') {
            return (
              <div key={i} className="tg-grp">
                <div className="tg-b in draft">
                  ✉️ <b>To Aditya</b> (CEO, Lumen Labs)<br />
                  <span className="mono">aditya@lumenlabs.in</span> · best guess<br />
                  <b>Subject:</b> ML intern, and a 2,000-resume ranker
                  <blockquote>Hi Aditya, congrats on the $2 Mn seed. Last term I built a resume ranker that sorted 2,000 applications for our placement cell… <em>(74 words)</em></blockquote>
                  <span className="ok">✓ 74 words · ✓ no AI phrases · ✓ opt-out line</span>
                  <time>{m.at}</time>
                </div>
                <div className="tg-kb three"><span className={tapped('send') ? 'tap' : ''}>✅ Send</span><span>✏️ Edit</span><span>⏭ Skip</span></div>
              </div>
            );
          }
          return (
            <div key={i} className="tg-grp">
              <div className="tg-b in">📤 Sent from your Gmail. I’ll follow up in 4 days if Aditya doesn’t reply.<time>{m.at}</time></div>
              <div className="tg-kb"><span>🎉 I got a reply</span></div>
            </div>
          );
        })}
        {typing && <div className="tg-b in typing" aria-hidden="true"><i /><i /><i /></div>}
      </div>
      <div className="tg-input"><span>Message</span><i /></div>
      <span className="tg-label">Example chat</span>
    </div>
  );
}

function TelegramSection({ bot }) {
  const href = telegramUrl(bot) || APP_HREF + '/settings';
  const points = [
    [BellRing, 'Morning picks, only new ones', 'Every day at 8:30: startups that just raised, launched or opened a role, matched to you. Never the same one twice.'],
    [Mail, 'SEND, EDIT, SKIP', 'Tap “Write the email” and it’s ready in seconds. Edit by replying with your version. Nothing goes without your tap.'],
    [Reply, 'Follow-ups that stop themselves', 'Up to three short nudges in the same thread, each one waits for your OK, and they stop the moment someone replies.'],
    [FileText, 'Your resume, as a PDF', 'Send it once. We keep the list of skills, never the file. /delete wipes everything.'],
  ];
  return (
    <section className="lp-sec" id="telegram">
      <div className="lp-wrap lp-tg">
        <div className="lp-tg-copy">
          <span className="lp-eyebrow rv"><i className="dot" style={{ background: '#229ed9' }} /> New · Telegram bot</span>
          <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Your mornings, sorted. <span className="tgword">In Telegram.</span></h2>
          <p className="lp-sub rv" style={{ '--d': 2 }}>The whole thing works from one chat. Wake up to a few startups worth writing to, and approve each email with one tap.</p>
          <ul className="lp-tg-pts">
            {points.map(([Icon, t, d], k) => (
              <li key={t} className="rv" style={{ '--d': 3 + k }}><span className="ic"><Icon size={18} aria-hidden="true" /></span><div><b>{t}</b><p>{d}</p></div></li>
            ))}
          </ul>
          <div className="lp-cta-row rv" style={{ '--d': 7, justifyContent: 'flex-start' }}>
            <a className="btn tg" href={href} target={bot ? '_blank' : undefined} rel="noopener noreferrer" data-mag><TgIcon /> Open {BRAND} in Telegram</a>
            <a className="btn light" href={APP_HREF} data-mag>Or use the web app</a>
          </div>
          <p className="lp-trust rv" style={{ '--d': 8 }}><Lock size={14} aria-hidden="true" /> Free. Telegram bots cost us nothing to run, so they cost you nothing.</p>
        </div>
        <div className="lp-tg-phone rv" style={{ '--d': 2 }}><TgPhone bot={bot} /></div>
      </div>
    </section>
  );
}

const TgIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M21.9 4.6 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 6.6c.4-.4-.1-.6-.6-.2L6 13.6l-4.9-1.5c-1.1-.3-1.1-1.1.2-1.6L20.6 3c.9-.3 1.7.2 1.3 1.6z" /></svg>
);

const Squiggle = () => (
  <svg className="draw" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 6 C 14 1, 22 9, 34 5 S 56 1, 68 6 S 88 9, 98 4" /></svg>
);

/* ------------------------------------------------------------------ page */
export default function Landing() {
  const root = useRef(null);
  const hero = useRef(null);
  const [hide, setHide] = useState(false);
  const [spy, setSpy] = useState('');
  const [bot, setBot] = useState(null);
  useEffect(() => { siteConfig().then((c) => setBot(c.telegramBot || null)); }, []);

  useEffect(() => {
    document.title = `${BRAND}: startups that are hiring, and emails you approve`;
    window.scrollTo(0, 0);
    const el = root.current;
    const motion = !reduced();

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); e.target.setAttribute('data-in', ''); io.unobserve(e.target); } }),
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    el.querySelectorAll('.rv').forEach((n) => io.observe(n));

    const ids = ['how', 'telegram', 'diff', 'india', 'pricing', 'faq'];
    let lastY = 0, raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY, vh = window.innerHeight;
        const max = document.documentElement.scrollHeight - vh;
        el.style.setProperty('--p', max > 0 ? Math.min(1, y / max) : 0);
        if (motion) el.style.setProperty('--sy', y);
        setHide(y > lastY && y > 320);
        lastY = y;
        let cur = '';
        for (const id of ids) { const n = document.getElementById(id); if (n && n.getBoundingClientRect().top < vh * 0.4) cur = id; }
        setSpy(cur);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    let mag = null;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const onMove = (e) => {
      if (!motion || !fine) return;
      const card = e.target.closest?.('.lp-card');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
      const m = e.target.closest?.('[data-mag]');
      if (mag && mag !== m) mag.style.transform = '';
      if (m) {
        const r = m.getBoundingClientRect();
        m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px, ${(e.clientY - r.top - r.height / 2) * 0.2}px)`;
      }
      mag = m;
    };
    document.addEventListener('pointermove', onMove);

    const h = hero.current;
    const onHero = (e) => {
      if (!motion || !fine) return;
      const r = h.getBoundingClientRect();
      h.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5) * 2);
      h.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    h.addEventListener('pointermove', onHero);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointermove', onHero);
    };
  }, []);

  const words = ['Find', 'who’s', 'hiring.', 'Land', 'the', 'internship.'];
  const links = [['how', 'How it works'], ['telegram', 'Telegram'], ['diff', 'Why it works'], ['pricing', 'Pricing'], ['faq', 'FAQ']];

  return (
    <div className="lp" ref={root}>
      <div className="lp-progress" aria-hidden="true" />

      <header className={`lp-nav ${hide ? 'hide' : ''}`}>
        <div className="lp-nav-in">
          <a href="#top" className="lp-logo" aria-label="Doorstep home"><span className="lp-logo-mark"><LogoMark size={15} /></span><span className="t">Doorstep</span></a>
          <nav className="lp-nav-links" aria-label="Sections">
            {links.map(([id, t]) => <a key={id} href={`#${id}`} className={spy === id ? 'on' : ''}>{t}</a>)}
          </nav>
          <a className="go" href={APP_HREF} data-mag>Open the app</a>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="lp-hero" ref={hero}>
          <PhotoBg />
          <div className="lp-wrap">
            <div className="lp-badge rv"><b>New</b><span>The {BRAND} Telegram bot is live</span><a href="#telegram">See it <ChevronRight size={14} aria-hidden="true" /></a></div>
            <h1 className="lp-h1" aria-label="Find who’s hiring. Land the internship.">
              {words.map((w, i) => (
                <span key={i} aria-hidden="true" className={w === 'internship.' ? 'hand' : undefined}>
                  <span className="w"><span style={{ '--i': i }}>{w}</span></span>
                  {w === 'internship.' && <svg viewBox="0 0 100 10" preserveAspectRatio="none"><path pathLength="1" d="M3 7 C 25 2, 55 3, 97 5" /></svg>}
                  {' '}
                </span>
              ))}
            </h1>
            <p className="lp-lead rv" style={{ '--d': 4 }}>Every morning: startups that just raised or are hiring, matched to you, with a short email to the founder already written. You approve every one.</p>
            <div className="lp-cta-row rv" style={{ '--d': 5 }}>
              <a className="btn dark" href={APP_HREF} data-mag>Get my free matches <ArrowRight size={17} className="nudge" aria-hidden="true" /></a>
              <a className="btn light" href={telegramUrl(bot) || '#telegram'} target={bot ? '_blank' : undefined} rel="noopener noreferrer" data-mag><TgIcon /> Open in Telegram</a>
            </div>
            <p className="lp-trust rv" style={{ '--d': 6 }}><Lock size={14} aria-hidden="true" /> Free and invite-only · Nothing is ever sent without your tap.</p>
          </div>
          <Dashboard />
        </section>

        {/* MARQUEE */}
        <div className="lp-marq" aria-label="Where we look for startups">
          <p>We watch these to see who’s recruiting and what’s listed</p>
          <div className="lp-marq-track">
            {[...WORDS, ...WORDS].map((t, i) => <span className="lp-word" key={i} aria-hidden={i >= WORDS.length}>{t}</span>)}
          </div>
        </div>

        {/* HOW */}
        <section className="lp-sec lp-center" id="how">
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> How it works</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Who’s hiring, what’s open, and how to get in.</h2>
            <p className="lp-sub rv" style={{ '--d': 2 }}>Recruiting signals and listed internships in one place, matched to you, with a way in for each.</p>
            <HowApp />
          </div>
        </section>

        <TelegramSection bot={bot} />

        {/* SOURCES */}
        <section className="lp-sec lp-center" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> Where startups come from</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Catch them the day they start hiring.</h2>
            <p className="lp-sub rv" style={{ '--d': 2 }}>A funding round, a launch or a new role means a founder is thinking about hiring. We watch for those moments so you show up first.</p>
            <div className="lp-bento">
              {[
                { i: Newspaper, t: 'Funding news', d: 'Who just raised, from Indian startup news roundups. Fresh money usually means open seats.', tags: ['Inc42', 'Entrackr', 'StartupTalky'] },
                { i: Rocket, t: 'Y Combinator, every batch', d: 'Every YC startup that’s hiring, with its founders, its open roles and its latest launch. Recent batches first.', tags: ['YC directory', 'Founders', 'Launches'] },
                { i: Building2, t: 'Listed roles, straight from the source', d: 'Read from startups’ own hiring systems every morning. Scam-like, agency and ghost posts are filtered out.', tags: ['Greenhouse', 'Lever', 'Ashby'] },
              ].map(({ i: Icon, t, d, tags }, k) => (
                <article key={t} className="lp-card rv" style={{ '--d': k }}>
                  <span className="lp-ico"><Icon size={22} aria-hidden="true" /></span>
                  <h3>{t}</h3><p>{d}</p>
                  <div className="lp-tags">{tags.map((x) => <span key={x}>{x}</span>)}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* DARK: not AI slop */}
        <section className="lp-darkcard lp-center" id="diff">
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" style={{ background: '#d93025' }} /> Same student, two emails</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>
              Emails that sound like you. Not{' '}
              <span className="strike">AI slop<svg className="draw" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 12 C 40 4, 82 16, 122 8 S 176 14, 198 6" /></svg></span>.
            </h2>
            <p className="lp-sub rv" style={{ '--d': 2 }}>On the left, every empty phrase is crossed out with what it should have said. On the right, every line is something a founder can check. Both are examples.</p>
            <div className="lp-vs">
              <BadMail />
              <GoodMail />
            </div>
            <div className="lp-assure rv">
              <span><Mail size={16} aria-hidden="true" /> Drafts land in your own Gmail.</span>
              <span><Lock size={16} aria-hidden="true" /> Nothing goes out until you tap SEND.</span>
              <span><Trash2 size={16} aria-hidden="true" /> Delete your data any time.</span>
            </div>
          </div>
        </section>

        {/* INDIA */}
        <section className="lp-sec lp-center" id="india">
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> Built for India</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Stipend, duration, WFH, batch year.</h2>
            <p className="lp-sub rv" style={{ '--d': 2 }}>The things you actually ask. Try the filters on a few made-up startups.</p>
            <FilterDemo />
            <div className="lp-bento" style={{ marginTop: 14 }}>
              {[
                { i: IndianRupee, t: 'Priced in ₹, paid by UPI', d: 'No dollar cards or foreign fees. A 30-day job-hunt pass fits better than a subscription you forget to cancel.' },
                { i: Clock, t: 'Gentle by design', d: 'A daily cap of 10–20 sends and one person at a time keeps your Gmail healthy and founders unspammed.' },
                { i: ShieldCheck, t: 'You own your data', d: 'We keep only what we need, log where each contact came from, and delete everything when you ask.' },
              ].map(({ i: Icon, t, d }, k) => (
                <article key={t} className="lp-card rv" style={{ '--d': k }}>
                  <span className="lp-ico"><Icon size={22} aria-hidden="true" /></span><h3>{t}</h3><p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="lp-sec lp-center" id="pricing" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> Pricing</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}><span className="box">Free</span> now. Pro when you’re ready.</h2>
            <p className="lp-sub rv" style={{ '--d': 2, fontSize: 19, lineHeight: 1.7, maxWidth: 620 }}>
              Finding startups <span className="ichip"><Search aria-hidden="true" /></span>, matching <span className="ichip"><Sparkles aria-hidden="true" /></span> and drafts in your
              Gmail <span className="ichip"><Mail aria-hidden="true" /></span> are <span className="squig">free<Squiggle /></span> while we’re invite-only.
              Pro adds verified founder emails and more drafts every day.
            </p>
            <div className="lp-price">
              <article className="lp-plan rv">
                <h3>Free</h3>
                <div className="amt">₹0<small>invite-only</small></div>
                <ul>
                  <li><Check size={16} aria-hidden="true" /> Every listed internship, with last dates</li>
                  <li><Check size={16} aria-hidden="true" /> A few recruiting startups every day</li>
                  <li><Check size={16} aria-hidden="true" /> Drafts in your own voice, sent from your Gmail</li>
                  <li><Check size={16} aria-hidden="true" /> The Telegram bot, with morning picks</li>
                  <li><Check size={16} aria-hidden="true" /> Filters for stipend, duration, WFH and batch</li>
                  <li><Check size={16} aria-hidden="true" /> You approve every email</li>
                </ul>
                <a className="btn dark" href={APP_HREF} data-mag style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>Get my free matches</a>
              </article>
              <article className="lp-plan pro rv" style={{ '--d': 2 }}>
                <span className="lp-soon">Coming soon</span>
                <h3>Pro</h3>
                <div className="amt">In ₹<small>paid by UPI</small></div>
                <ul>
                  <li><Check size={16} aria-hidden="true" /> More drafts every day</li>
                  <li><Check size={16} aria-hidden="true" /> Verified founder emails</li>
                  <li><Check size={16} aria-hidden="true" /> More follow-ups and WhatsApp</li>
                  <li><Check size={16} aria-hidden="true" /> “My writing style” learned from your edits</li>
                </ul>
                <p className="muted">The first 20 people on the waitlist get an early-bird price.</p>
                <Waitlist />
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-sec lp-center" id="faq" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> Questions</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Straight answers.</h2>
            <Faq />
          </div>
        </section>

        {/* FINAL */}
        <section className="lp-final">
          <PhotoBg birds={false} pos="50% 70%" />
          <div className="lp-wrap">
            <h2 className="rv">Your next internship is already out there.</h2>
            <p className="rv" style={{ '--d': 1 }}>We’ll show you who’s hiring and write the first email. Free while we’re invite-only.</p>
            <a className="btn dark rv" style={{ '--d': 2 }} href={APP_HREF} data-mag>Get my free matches <ArrowRight size={18} className="nudge" aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span>© {new Date().getFullYear()} Doorstep · Made for Indian students</span>
          <nav aria-label="Footer"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/app/settings">Delete my data</a><a href={APP_HREF}>Open the app</a><a href="https://unsplash.com/photos/cloudy-sky-at-daytime-v9bnfMCyKbg" target="_blank" rel="noopener noreferrer">Photo: billy_huy / Unsplash</a></nav>
        </div>
      </footer>
    </div>
  );
}
