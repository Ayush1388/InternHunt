import { useState } from 'react';
import { BadgeCheck, Check, Lock, MailOpen, Newspaper, Radar, Rocket, Send, Sparkles, UserRound } from 'lucide-react';
import { Avatar, Words, toast, useReveal } from '@/app/ui';

// Planned features (see project.md). Honest previews, labelled as examples, plus the early-access list.
const CONTENT = {
  recruiting: {
    icon: Radar,
    title: 'Who’s recruiting',
    words: 'Catch startups the day they start hiring',
    mark: 'hiring',
    lead: 'Startups that just raised, launched or said “we’re hiring”, often before the role is on any job board. Matched to your resume, with a one-line reason.',
    points: [
      [Newspaper, 'Funding and launch signals', 'Indian startup funding roundups, Product Hunt launches, YC and GitHub, checked every day.'],
      [Sparkles, 'Matched to you', 'Hard filters first (batch, stipend, location), then ranked by fit with the reason shown.'],
      [Send, 'A way in', 'Apply if the role is listed, or approve a short email to the founder if it isn’t.'],
    ],
  },
  drafts: {
    icon: MailOpen,
    title: 'Founder drafts',
    words: 'Emails that sound like you, not AI slop',
    mark: 'you,',
    lead: 'Short, specific emails to founders: one verified fact about the company, one real proof from your resume, one clear ask. You approve every one.',
    points: [
      [BadgeCheck, 'Only checked facts', 'Each draft may use one company fact we verified and one real thing from your resume. Nothing invented.'],
      [UserRound, 'Your voice', 'Edit a draft and it learns how you write. 60 to 90 words, no buzzwords.'],
      [Lock, 'You hold the send button', 'Drafts land in your own Gmail. Nothing is ever sent without your tap.'],
    ],
  },
};

const PREVIEW = [
  ['Lumen Labs', 'Raised a seed round · 2 days ago', 'ML intern fit', 'mint'],
  ['Orbit Pay', 'Founder posted “we’re hiring” · today', 'Backend fit', 'blue'],
  ['Paperkite', 'Launched on Product Hunt · this week', 'Design fit', 'butter'],
  ['Kiln', 'Raised a pre-seed · 4 days ago', 'Growth fit', 'peach'],
];

function Recruiting() {
  return (
    <div className="card" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 8px' }}>
        <b style={{ fontWeight: 600, fontSize: 15 }}>Today · example</b>
        <span className="tag">Preview</span>
      </div>
      {PREVIEW.map(([name, signal, fit, tone], i) => (
        <div key={name} className="row pop" style={{ '--d': i + 2 }}>
          <Avatar name={name} />
          <span className="tx"><b>{name}</b><span>{signal}</span></span>
          <span className={`tag ${tone}`}>{fit}</span>
        </div>
      ))}
    </div>
  );
}

function Draft() {
  const F = ({ c, label, d, children }) => (
    <><mark className={`fx ${c}`}>{children}</mark><em className={`lblx ${c}`} style={{ '--d': d }}>{label}</em></>
  );
  return (
    <div className="mail">
      <div className="mail-top"><span className="st"><i className="dot" /> Draft · example</span><span>New message</span></div>
      <div className="mail-to">To <span className="chip"><i>R</i>Riya · Founder, Lumen Labs</span></div>
      <div className="mail-to">Subject: Your seed round + an ML intern?</div>
      <div className="mail-b">
        <p>Hi Riya,</p>
        <p><F c="c1" label="company fact" d={0}>Congrats on Lumen’s seed round</F> — saw you’re hiring an ML intern.</p>
        <p>Last term I built <F c="c2" label="real proof" d={1}>a resume-ranking tool that sorted 2,000 applications</F> for my college placement cell.</p>
        <p><F c="c3" label="one clear ask" d={2}>Could I send you a 2-minute demo this week?</F></p>
        <p>Aarav</p>
      </div>
      <div className="mail-foot"><span className="send">Send</span><span>39 words · 0 empty phrases</span></div>
    </div>
  );
}

function Waitlist({ feature }) {
  const read = () => {
    let raw = null;
    try { raw = localStorage.getItem('ih.waitlist'); return raw ? JSON.parse(raw) : null; } catch { return raw; }
  };
  const [saved, setSaved] = useState(read);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  if (typeof saved === 'string' && saved) {
    return <div className="okbox"><BadgeCheck size={20} /> You’re on the early list as <b>{saved}</b>. We’ll email you when {feature} opens.</div>;
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('That email doesn’t look right.');
        try { localStorage.setItem('ih.waitlist', email.trim()); } catch { /* private mode */ }
        setSaved(email.trim());
        toast('You’re on the list', { description: `We’ll email you when ${feature} opens.` });
      }}
    >
      <div className="wait">
        <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="you@college.edu" aria-label="Email for early access" aria-invalid={Boolean(err)} value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} />
        <button className="btn lg dark" type="submit">Get early access</button>
      </div>
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}

export default function Soon({ kind }) {
  const c = CONTENT[kind];
  const Icon = c.icon;
  const ref = useReveal(kind);
  return (
    <div ref={ref} key={kind}>
      <section className="hero">
        <span className="eyebrow"><i className="dot" style={{ background: '#f2a600' }} /> Coming soon · {c.title}</span>
        <h1><Words text={c.words} mark={c.mark} /></h1>
        <p className="lead">{c.lead}</p>
      </section>
      <div className="soon-grid">
        <div className="stack">
          {c.points.map(([PIcon, t, d], i) => (
            <div key={t} className="card point rv" style={{ '--d': i }}>
              <span className="tile"><PIcon /></span>
              <span className="txt"><b>{t}</b><span>{d}</span></span>
            </div>
          ))}
          <div className="rv" style={{ '--d': 3, borderRadius: 28, background: 'var(--bg2)', padding: 22 }}>
            <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, marginBottom: 12, letterSpacing: '-0.02em' }}><Icon size={18} /> Be first in line</b>
            <Waitlist feature={c.title} />
            <p className="note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={14} /> Free while we’re invite-only. One email when it opens, nothing else.</p>
          </div>
        </div>
        <div className="sticky rv" style={{ '--d': 1 }}>
          {kind === 'drafts' ? <Draft /> : <Recruiting />}
          <p className="note" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}><Rocket size={14} /> Every name above is made up to show the idea.</p>
        </div>
      </div>
    </div>
  );
}
