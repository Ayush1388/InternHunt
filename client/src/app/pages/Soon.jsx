import { useState } from 'react';
import { BadgeCheck, Check, Newspaper, Radar, Rocket, Sparkles } from 'lucide-react';
import { Avatar, Words, toast, useReveal } from '@/app/ui';

// Planned features (see project.md). Honest previews, labelled as examples, plus the early-access list.
const CONTENT = {
  recruiting: {
    icon: Radar,
    title: 'Who’s recruiting',
    words: 'Hiring directly, right here',
    mark: 'directly,',
    lead: 'Founders and teams who post a role on InternHunt and hire without a middleman, plus startups that just raised or launched, before the role is on any job board.',
    points: [
      [Rocket, 'Hiring directly on InternHunt', 'Founders post a role here and reach students straight away. No agencies, no fees for candidates.'],
      [Newspaper, 'Fresh funding and launches', 'Funding roundups, Product Hunt launches, YC and GitHub, checked every day, anywhere in the world.'],
      [Sparkles, 'Matched to you', 'Ranked by your skills, with the reason shown. Apply, or approve a short email to the founder.'],
    ],
  },
};

const PREVIEW = [
  ['Lumen Labs', 'Raised a seed round · 2 days ago', 'ML intern fit', 'mint'],
  ['Orbit Pay', 'Posted a role on InternHunt · today', 'Backend fit', 'blue'],
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
          <Recruiting />
          <p className="note" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}><Rocket size={14} /> Every name above is made up to show the idea.</p>
        </div>
      </div>
    </div>
  );
}
