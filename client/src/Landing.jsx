import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronRight, Clock, FileText, GraduationCap, House, IndianRupee, LayoutGrid, Lock,
  Mail, Newspaper, Plus, Rocket, Send, Settings, ShieldCheck, Sparkles, Wallet, Zap, KanbanSquare, Inbox, Trash2, Search,
} from 'lucide-react';
import './landing.css';

// Palette copied from backdoorai.app (see backdoorai.app.md): white page, #111 ink, #6E6E72 muted, #F5F4F1 chips,
// pastel tiles, one dark band, Gmail-style red/green highlights. Hero is a real photo (Unsplash, billy_huy)
// faded out at the left and bottom. Motion: short fades, drawn strokes, tilted labels sliding in.
// All startups, numbers and emails shown are made-up examples and are labelled as such.
const APP_HREF = '#/app';
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ data */
const WORDS = ['Inc42', 'Entrackr', 'Product Hunt', 'YC', 'Greenhouse', 'Lever', 'Ashby', 'StartupTalky', 'GitHub', 'Hackathons', 'Careers pages'];

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
  ['Do you send emails without my approval?', 'Never. Every email is a draft that you read, edit and approve. It is created in your own Gmail, and nothing is sent until you say so.'],
  ['Will my emails sound like AI?', 'Each draft may use only facts we checked: one thing about the company and one real thing from your resume. A second pass checks those facts, code checks length and banned phrases, and we learn your style from your edits.'],
  ['Is it really free?', 'Yes. We are free and invite-only while we learn from our first users. A Pro plan is coming, priced in ₹ and paid by UPI, and early joiners get a better price.'],
  ['What do you store from my resume?', 'Only what is needed to match and draft. We log where every contact came from, and you can ask us to delete your data at any time.'],
  ['Where do founder emails come from?', 'Public pages first. When we have to guess an address, we label it as a guess and verify it before you use it. We also draft a short LinkedIn or X message that you send yourself.'],
  ['Is there a Telegram or WhatsApp bot?', 'Telegram comes first, then WhatsApp once there are enough users to cover its fixed cost. For now the web app is live.'],
];

/* ------------------------------------------------------------------ pieces */
function LogoMark({ size = 16, color = '#fff' }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M9 23V9h3v14zm6 0V9h3l4.2 8.1V9H25v14h-2.8L18 14.9V23z" fill={color} />
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
            <div className="brand"><i /> InternHunt</div>
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
        <div key={q} className={`lp-q rv ${open === i ? 'open' : ''}`} style={{ '--d': i }}>
          <button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
            {q}<span className="plus"><Plus size={16} aria-hidden="true" /></span>
          </button>
          <div className="lp-a" id={`faq-${i}`} role="region"><div><p>{a}</p></div></div>
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
    try { localStorage.setItem('ih.waitlist', email); } catch { /* private mode */ }
    setDone(true);
    confetti(e.currentTarget.querySelector('button'));
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

const Squiggle = () => (
  <svg className="draw" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 6 C 14 1, 22 9, 34 5 S 56 1, 68 6 S 88 9, 98 4" /></svg>
);

/* ------------------------------------------------------------------ page */
export default function Landing() {
  const root = useRef(null);
  const hero = useRef(null);
  const [hide, setHide] = useState(false);
  const [spy, setSpy] = useState('');

  useEffect(() => {
    document.title = 'InternHunt — find who’s hiring, land the internship';
    window.scrollTo(0, 0);
    const el = root.current;
    const motion = !reduced();

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }),
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    el.querySelectorAll('.rv').forEach((n) => io.observe(n));

    const ids = ['how', 'diff', 'india', 'pricing', 'faq'];
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
  const links = [['how', 'How it works'], ['diff', 'Why it works'], ['india', 'Built for India'], ['pricing', 'Pricing'], ['faq', 'FAQ']];

  return (
    <div className="lp" ref={root}>
      <div className="lp-progress" aria-hidden="true" />

      <header className={`lp-nav ${hide ? 'hide' : ''}`}>
        <div className="lp-nav-in">
          <a href="#top" className="lp-logo" aria-label="InternHunt home"><span className="lp-logo-mark"><LogoMark size={15} /></span><span className="t">InternHunt</span></a>
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
            <div className="lp-badge rv"><b>New</b><span>Who’s recruiting + every listed internship</span><a href="#how">Try now <ChevronRight size={14} aria-hidden="true" /></a></div>
            <h1 className="lp-h1" aria-label="Find who’s hiring. Land the internship.">
              {words.map((w, i) => (
                <span key={i} aria-hidden="true" className={w === 'internship.' ? 'hand' : undefined}>
                  <span className="w"><span style={{ '--i': i }}>{w}</span></span>
                  {w === 'internship.' && <svg viewBox="0 0 100 10" preserveAspectRatio="none"><path pathLength="1" d="M3 7 C 25 2, 55 3, 97 5" /></svg>}
                  {' '}
                </span>
              ))}
            </h1>
            <p className="lp-lead rv" style={{ '--d': 4 }}>We track which startups are recruiting right now, list every open internship with its last date, and help you reach the founder with a short email you approve.</p>
            <div className="lp-cta-row rv" style={{ '--d': 5 }}>
              <a className="btn dark" href={APP_HREF} data-mag>Get my free matches <ArrowRight size={17} className="nudge" aria-hidden="true" /></a>
              <a className="btn light" href="#how" data-mag>See how it works</a>
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

        {/* SOURCES */}
        <section className="lp-sec lp-center" style={{ paddingTop: 0 }}>
          <div className="lp-wrap">
            <span className="lp-eyebrow rv"><i className="dot" /> Where startups come from</span>
            <h2 className="lp-h2 rv" style={{ '--d': 1 }}>Catch them the day they start hiring.</h2>
            <p className="lp-sub rv" style={{ '--d': 2 }}>A funding round, a launch or a new role means a founder is thinking about hiring. We watch for those moments so you show up first.</p>
            <div className="lp-bento">
              {[
                { i: Newspaper, t: 'Funding news', d: 'Who just raised, from Indian startup news roundups. Fresh money usually means open seats.', tags: ['Inc42', 'Entrackr', 'StartupTalky'] },
                { i: Rocket, t: 'Launches and communities', d: 'Products going live, repos taking off and hackathon winners are small teams worth knowing.', tags: ['Product Hunt', 'GitHub', 'YC directory'] },
                { i: Building2, t: 'Listed internships', d: 'Open roles read straight from company careers pages and official programs, with last dates. No stale listings.', tags: ['Greenhouse', 'Lever', 'Ashby'] },
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
              Pro adds verified founder emails and follow-ups.
            </p>
            <div className="lp-price">
              <article className="lp-plan rv">
                <h3>Free</h3>
                <div className="amt">₹0<small>invite-only</small></div>
                <ul>
                  <li><Check size={16} aria-hidden="true" /> Every listed internship, with last dates</li>
                  <li><Check size={16} aria-hidden="true" /> A few recruiting startups every day</li>
                  <li><Check size={16} aria-hidden="true" /> Limited drafts, all in your own voice</li>
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
                  <li><Check size={16} aria-hidden="true" /> Founder email lookup with verification</li>
                  <li><Check size={16} aria-hidden="true" /> Follow-ups in the same thread</li>
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
            <p className="rv" style={{ '--d': 1 }}>We’ll show you who’s hiring and what’s open. Free while we’re invite-only.</p>
            <a className="btn dark rv" style={{ '--d': 2 }} href={APP_HREF} data-mag>Get my free matches <ArrowRight size={18} className="nudge" aria-hidden="true" /></a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <span>© {new Date().getFullYear()} InternHunt · Made for Indian students</span>
          <nav aria-label="Footer"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/privacy">Delete my data</a><a href={APP_HREF}>Open the app</a><a href="https://unsplash.com/photos/cloudy-sky-at-daytime-v9bnfMCyKbg" target="_blank" rel="noopener noreferrer">Photo: billy_huy / Unsplash</a></nav>
        </div>
      </footer>
    </div>
  );
}
