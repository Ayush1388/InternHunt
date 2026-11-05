import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Briefcase, CalendarClock, GraduationCap, Landmark, ListChecks, Radar, Search, Sparkles } from 'lucide-react';
import { api, timeAgo } from '@/api';
import { daysUntil, shortDate } from '@/lib/format';
import { Avatar, CountUp, RowsSkeleton, Skel, Words, cx, useReveal } from '@/app/ui';
import { DeadlineTag, placeOf } from '@/app/jobs';
import { useAuth } from '@/app/auth';

function greeting() {
  const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Stat({ icon: Icon, tint, ink, label, value, foot, onClick, d }) {
  return (
    <button className="card hov glow stat rv" style={{ '--d': d }} onClick={onClick}>
      <span className="top">
        <span className="tile" style={{ background: tint, color: ink }}><Icon /></span>
        <ArrowUpRight className="arrow" />
      </span>
      <span className="label">{label}</span>
      <span className="num">{value == null ? <Skel w={70} h={36} /> : <CountUp value={value} />}</span>
      {foot && <span className="sfoot">{foot}</span>}
    </button>
  );
}

function JobRows({ jobs, onOpen, right, empty }) {
  if (!jobs) return <div className="card"><RowsSkeleton n={4} /></div>;
  if (!jobs.length) return <div className="card" style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>{empty}</div>;
  return (
    <div className="card rows">
      {jobs.map((job, i) => (
        <div key={job.id}>
          {i > 0 && <div className="sep" />}
          <button className="row" onClick={() => onOpen(job)}>
            <Avatar name={job.company} />
            <span className="tx"><b>{job.title}</b><span>{job.company} · {placeOf(job)}</span></span>
            {right(job)}
          </button>
        </div>
      ))}
    </div>
  );
}

function Pipeline({ meta, go }) {
  const auth = useAuth();
  const c = meta?.trackedCounts || {};
  if (!auth?.user) {
    return (
      <div className="card rv" style={{ padding: 26 }}>
        <span className="tile" style={{ background: 'var(--t-lilac)' }}><ListChecks /></span>
        <h3 style={{ fontSize: 20, marginTop: 18 }}>Keep your own tracker</h3>
        <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 15 }}>Save roles, mark what you’ve applied to, and keep a weekly streak on any device.</p>
        <button className="btn dark" style={{ marginTop: 20 }} onClick={() => auth?.requestSignIn()}>Sign in with Google</button>
      </div>
    );
  }
  const tiles = [['Saved', c.saved || 0, 'var(--t-blue)'], ['Applied', (c.applied || 0) + (c.no_reply || 0), 'var(--t-butter)'], ['Interviews', c.interview || 0, 'var(--t-mint)'], ['Offers', c.offer || 0, 'var(--t-pink)']];
  return (
    <div className="card rv" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 20 }}>Your pipeline</h3>
        <button className="btn sm ghost" onClick={() => go('tracker')}>Open <ArrowRight /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        {tiles.map(([l, n, t]) => (
          <div key={l} className="ptile" style={{ background: t, padding: '14px 16px' }}><small>{l}</small><b style={{ fontSize: 28 }}><CountUp value={n} /></b></div>
        ))}
      </div>
    </div>
  );
}

function GovOpen({ programs, go }) {
  const open = (programs || []).filter((p) => p.status === 'open' || p.status === 'rolling').slice(0, 4);
  return (
    <div className="card rv" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 10 }}><Landmark size={19} /> Government, open now</h3>
        <button className="btn sm ghost" onClick={() => go('government')}>All <ArrowRight /></button>
      </div>
      {!programs ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}><Skel h={36} /><Skel h={36} /><Skel h={36} /></div>
      ) : open.length === 0 ? (
        <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: 14.5 }}>No government program is taking applications right now.</p>
      ) : (
        <div style={{ marginTop: 6 }}>
          {open.map((p) => {
            const d = p.deadline ? daysUntil(p.deadline) : null;
            return (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                  <b style={{ display: 'block', fontWeight: 500, fontSize: 14.5 }}>{p.name}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{p.org}</span>
                </span>
                <span className={cx('tag', p.status === 'rolling' ? 'mint' : d != null && d <= 7 ? 'red' : 'mint')}>{p.status === 'rolling' ? 'All year' : p.deadline ? `till ${shortDate(p.deadline)}` : 'Open'}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Today({ facets, meta, version, onOpen, onSearch, go }) {
  const auth = useAuth();
  const ref = useReveal();
  const [closing, setClosing] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [freshers, setFreshers] = useState(null);
  const [programs, setPrograms] = useState(null);

  useEffect(() => {
    api.jobs({ deadline: 'week', sort: 'deadline', limit: 6 }).then((r) => setClosing(r.jobs)).catch(() => setClosing([]));
    api.jobs({ kind: 'intern', type: 'roles', limit: 6, hideApplied: '1' }).then((r) => setFresh(r.jobs)).catch(() => setFresh([]));
    api.jobs({ kind: 'job', exp: '0', limit: 4, hideApplied: '1' }).then((r) => setFreshers(r.jobs)).catch(() => setFreshers([]));
    api.government().then((r) => setPrograms(r.programs)).catch(() => setPrograms([]));
  }, [version]);

  const i = facets.intern;
  const j = facets.job;
  const first = auth?.user?.name?.split(' ')[0];
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  const title = `${greeting()}${first ? `, ${first}` : ''}.`;

  return (
    <div ref={ref}>
      <section className="hero photo">
        <div className="hero-photo" aria-hidden="true"><img src="/hero-sky.jpg" alt="" /></div>
        <div className="hero-row">
          <div>
            <span className="eyebrow"><i className="dot" /> {today}</span>
            <h1><Words text={title} mark={first ? `${first}.` : undefined} /></h1>
            <p className="lead">Here’s what opened overnight, what closes this week, and where your applications stand.</p>
          </div>
          <div className="hero-actions">
            <button className="btn lg light" onClick={onSearch}><Search /> Search roles</button>
            <button className="btn lg dark" onClick={() => go('internships')}>Browse internships <ArrowRight className="nudge" /></button>
          </div>
        </div>
      </section>

      <div className="stats">
        <Stat d={0} icon={GraduationCap} tint="var(--t-blue)" ink="var(--sky-ink)" label="Open internships" value={i?.total} foot={i ? `${i.programs || 0} programs & drives` : null} onClick={() => go('internships')} />
        <Stat d={1} icon={Briefcase} tint="var(--t-mint)" ink="var(--green-ink)" label="Fresher & early jobs" value={j?.total} foot={j?.byExp ? `${j.byExp['0'] || 0} need no experience` : null} onClick={() => go('jobs')} />
        <Stat d={2} icon={Sparkles} tint="var(--t-butter)" ink="#8a5300" label="New today" value={i && j ? (i.newToday || 0) + (j.newToday || 0) : null} foot={meta?.lastRefresh ? `Updated ${timeAgo(meta.lastRefresh)}` : null} onClick={() => go('internships')} />
        <Stat d={3} icon={CalendarClock} tint="var(--t-red)" ink="var(--red)" label="Closing this week" value={i && j ? (i.closingThisWeek || 0) + (j.closingThisWeek || 0) : null} foot="Apply before they close" onClick={() => go('internships')} />
      </div>

      <div className="grid2 sec">
        <div className="stack" style={{ gap: 40 }}>
          <section className="rv">
            <div className="sec-h"><div><h2>Closing this week</h2><p>Last dates within 7 days, soonest first.</p></div></div>
            <JobRows jobs={closing} onOpen={onOpen} right={(job) => <DeadlineTag job={job} />} empty="Nothing closes this week. A good week to explore." />
          </section>
          <section className="rv">
            <div className="sec-h"><div><h2>Fresh internships</h2><p>Newest roles from company careers pages.</p></div><button className="btn sm ghost" onClick={() => go('internships')}>See all <ArrowRight /></button></div>
            <JobRows jobs={fresh} onOpen={onOpen} right={(job) => <span className="tab" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{timeAgo(job.postedAt || job.firstSeen)}</span>} empty="No new internships yet. Check back after the next refresh." />
          </section>
          <section className="rv">
            <div className="sec-h"><div><h2>Fresher jobs</h2><p>Full-time roles that ask for no experience.</p></div><button className="btn sm ghost" onClick={() => go('jobs')}>See all <ArrowRight /></button></div>
            <JobRows jobs={freshers} onOpen={onOpen} right={() => <span className="tag mint">No exp.</span>} empty="No fresher jobs right now." />
          </section>
        </div>
        <div className="stack">
          <Pipeline meta={meta} go={go} />
          <GovOpen programs={programs} go={go} />
          <button className="band rv" style={{ textAlign: 'left' }} onClick={() => go('recruiting')}>
            <span className="tag"><Sparkles /> Coming soon</span>
            <h3 style={{ fontSize: 22, marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}><Radar size={21} color="#62bffb" /> Who’s recruiting</h3>
            <p style={{ marginTop: 8, fontSize: 14.5 }}>Startups that just raised, launched or posted “we’re hiring”, before the role is listed anywhere. With a short email to the founder that you approve.</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18, fontSize: 14.5, fontWeight: 500 }}>Get early access <ArrowRight size={16} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
