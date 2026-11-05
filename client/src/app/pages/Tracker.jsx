import { useEffect, useMemo, useState } from 'react';
import { BellOff, Check, Flame, ListChecks, Minus, Plus, Send } from 'lucide-react';
import { api, LABELS, store, timeAgo } from '@/api';
import { istDay } from '@/lib/format';
import { Avatar, CountUp, Empty, RowsSkeleton, Select, Words, cx, useReveal } from '@/app/ui';
import { useAuth } from '@/app/auth';

const ACTIVE = ['applied', 'interview', 'offer', 'rejected', 'no_reply'];
const NO_REPLY_DAYS = 21;

function Ring({ value, max, size = 132 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max ? value / max : 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs><linearGradient id={`rg${size}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#62bffb" /><stop offset="1" stopColor="#3aa5f6" /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="11" stroke="#f5f4f1" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="11" strokeLinecap="round" stroke={`url(#rg${size})`} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }} />
    </svg>
  );
}

function momentumOf(jobs) {
  const days = new Set(jobs.filter((j) => ACTIVE.includes(j.status) && j.trackedAt).map((j) => istDay(j.trackedAt)));
  const today = istDay(new Date().toISOString());
  const d0 = new Date(Date.parse(`${today}T00:00:00Z`));
  const weekStart = new Date(d0.getTime() - ((d0.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const thisWeek = jobs.filter((j) => ACTIVE.includes(j.status) && j.trackedAt && istDay(j.trackedAt) >= weekStart).length;
  let streak = 0;
  let cursor = Date.parse(`${today}T00:00:00Z`);
  if (!days.has(today)) cursor -= 86400000;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) { streak++; cursor -= 86400000; }
  const last14 = [...Array(14)].map((_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { d, on: days.has(d) };
  });
  return { thisWeek, streak, last14, activeToday: days.has(today) };
}

function SignedOut({ onSignIn }) {
  return (
    <div className="card signin-card rv">
      <div>
        <span className="m-ico"><ListChecks /></span>
        <h3>Your tracker is personal</h3>
        <p>Sign in to save roles, mark what you’ve applied to and follow up. It’s kept for your account only and works on any device.</p>
        <ul className="ticks">
          {['A weekly goal and a daily streak', 'Every application’s status in one list', 'A nudge when a company hasn’t replied in 3 weeks'].map((t) => (
            <li key={t}><i><Check strokeWidth={3} /></i>{t}</li>
          ))}
        </ul>
        <button className="btn lg dark" style={{ marginTop: 26 }} onClick={onSignIn}>Sign in with Google</button>
      </div>
      <div className="example" aria-hidden="true">
        <span className="lbl">Example</span>
        <div className="card goal" style={{ padding: 18, boxShadow: 'none' }}>
          <div className="ring"><Ring value={6} max={10} size={104} /><div className="c"><div><b style={{ fontSize: 26 }}>6</b><small>of 10 this week</small></div></div></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="flame on"><Flame size={18} /></span><b style={{ fontSize: 26, letterSpacing: '-0.05em' }}>4</b><span style={{ color: 'var(--muted)', fontSize: 14 }}>day streak</span></div>
            <div className="days" style={{ gridTemplateColumns: 'repeat(7, 18px)', marginTop: 12 }}>{[1, 1, 0, 1, 1, 1, 1].map((on, k) => <i key={k} className={cx(on && 'on')} />)}</div>
          </div>
        </div>
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 10, gap: 8 }}>
          {[['Saved', 12, 'var(--t-blue)'], ['Applied', 9, 'var(--t-butter)'], ['Interviews', 2, 'var(--t-mint)'], ['Offers', 1, 'var(--t-pink)']].map(([l, n, t]) => (
            <div key={l} className="ptile" style={{ background: t, padding: '12px 14px' }}><small style={{ fontSize: 11.5 }}>{l}</small><b style={{ fontSize: 24 }}>{n}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Tracker({ meta, version, onOpen, onTrack, onReport }) {
  const auth = useAuth();
  const signedIn = Boolean(auth?.user);
  const [all, setAll] = useState(null);
  const [status, setStatus] = useState('any');
  const [goal, setGoal] = useState(() => store.get('ih.weeklyGoal', 10));
  const ref = useReveal(`${signedIn}-${all?.length}`);

  useEffect(() => {
    if (!signedIn) return setAll([]);
    api.jobs({ tracked: 'any', limit: 100 }).then((r) => setAll(r.jobs)).catch(() => setAll([]));
  }, [version, signedIn]);
  useEffect(() => store.set('ih.weeklyGoal', goal), [goal]);
  const m = useMemo(() => momentumOf(all || []), [all]);

  const counts = meta?.trackedCounts || {};
  const list = (all || []).filter((j) => status === 'any' || j.status === status);
  const responded = (counts.interview || 0) + (counts.offer || 0);
  const sent = responded + (counts.applied || 0) + (counts.rejected || 0) + (counts.no_reply || 0);
  const rate = sent ? Math.round((responded / sent) * 100) : null;

  return (
    <div ref={ref}>
      <section className="hero">
        <span className="eyebrow"><i className="dot" /> {signedIn ? `Signed in as ${auth.user.name}` : 'Private to you'}</span>
        <h1><Words text="Your pipeline, one place" mark="pipeline," /></h1>
        <p className="lead">Every application and where it stands. Small steps, every day.</p>
      </section>

      {!signedIn ? (
        <SignedOut onSignIn={() => auth?.requestSignIn()} />
      ) : (
        <>
          <div className="trk-top">
            <div className="card goal rv">
              <div className="ring">
                <Ring value={m.thisWeek} max={goal} />
                <div className="c"><div><b><CountUp value={m.thisWeek} /></b><small>of {goal} this week</small></div></div>
              </div>
              <div>
                <h3>Weekly goal</h3>
                <p>{m.thisWeek >= goal ? 'Goal hit. Anything more is a bonus.' : `${goal - m.thisWeek} more application${goal - m.thisWeek === 1 ? '' : 's'} to hit your goal.`}</p>
                <div className="stepper">
                  <button className="btn sm chip icon" aria-label="Lower goal" onClick={() => setGoal((g) => Math.max(1, g - 1))}><Minus /></button>
                  <span className="tab">{goal} / week</span>
                  <button className="btn sm chip icon" aria-label="Raise goal" onClick={() => setGoal((g) => Math.min(100, g + 1))}><Plus /></button>
                </div>
              </div>
            </div>
            <div className="card streak rv" style={{ '--d': 1 }}>
              <div className="hd">
                <span className="l"><span className={cx('flame', m.streak && 'on')}><Flame size={19} /></span><b className="tab">{m.streak}</b><span style={{ color: 'var(--muted)', fontSize: 14 }}>day streak</span></span>
                <span className={cx('tag', m.activeToday ? 'mint' : '')}>{m.activeToday ? 'Done for today' : 'Apply today to keep it'}</span>
              </div>
              <div className="days">{m.last14.map(({ d, on }) => <i key={d} title={d} className={cx(on && 'on')} />)}</div>
              <div className="days-l"><span>2 weeks ago</span><span>Today</span></div>
            </div>
          </div>

          <div className="tiles">
            <div className="ptile rv" style={{ background: 'var(--t-blue)' }}><small>Saved</small><b><CountUp value={counts.saved || 0} /></b></div>
            <div className="ptile rv" style={{ background: 'var(--t-butter)', '--d': 1 }}><small>Applied</small><b><CountUp value={(counts.applied || 0) + (counts.no_reply || 0)} /></b>{counts.no_reply ? <span>{counts.no_reply} no reply</span> : null}</div>
            <div className="ptile rv" style={{ background: 'var(--t-mint)', '--d': 2 }}><small>Interviewing</small><b><CountUp value={counts.interview || 0} /></b>{rate != null && <span>{rate}% response rate</span>}</div>
            <div className="ptile rv" style={{ background: 'var(--t-pink)', '--d': 3 }}><small>Offers</small><b><CountUp value={counts.offer || 0} /></b></div>
          </div>

          <div className="sec" style={{ marginTop: 36 }}>
            <div className="seg" role="tablist" aria-label="Filter by status">
              <button role="tab" aria-selected={status === 'any'} className={cx(status === 'any' && 'on')} onClick={() => setStatus('any')}>All</button>
              {Object.entries(LABELS.status).map(([k, v]) => (
                <button key={k} role="tab" aria-selected={status === k} className={cx(status === k && 'on')} onClick={() => setStatus(k)}>{v}{counts[k] ? <span className="n tab">{counts[k]}</span> : null}</button>
              ))}
            </div>
            {all === null ? (
              <div className="card trk-list"><RowsSkeleton n={3} /></div>
            ) : list.length === 0 ? (
              <div style={{ marginTop: 14 }}>
                <Empty icon={Send} title={status === 'any' ? 'Nothing tracked yet' : `No ${LABELS.status[status].toLowerCase()} applications`}>Save roles from Internships or Jobs, or hit Apply. We’ll ask if you applied and add it here.</Empty>
              </div>
            ) : (
              <div className="card trk-list">
                {list.map((job) => {
                  const waiting = job.status === 'applied' && job.trackedAt ? Math.floor((Date.now() - Date.parse(job.trackedAt)) / 86400000) : 0;
                  return (
                    <div key={job.id} className="trk-row">
                      <Avatar name={job.company} />
                      <button className="tx" onClick={() => onOpen(job)}><b>{job.title}</b><span>{job.company} · updated {timeAgo(job.trackedAt)}</span></button>
                      {waiting >= NO_REPLY_DAYS && <button className="btn sm light" onClick={() => onReport(job, 'no_reply')}><BellOff /> No reply in {waiting}d</button>}
                      <Select value={job.status} label="Status" options={Object.entries(LABELS.status)} onChange={(v) => { onTrack(job, v); setAll((l) => l.map((x) => (x.id === job.id ? { ...x, status: v } : x))); }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
