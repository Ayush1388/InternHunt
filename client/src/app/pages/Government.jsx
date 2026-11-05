import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarClock, CircleHelp, IndianRupee, Infinity as InfinityIcon, Landmark, RefreshCw, Users } from 'lucide-react';
import { api, timeAgo } from '@/api';
import { daysUntil, shortDate } from '@/lib/format';
import { Empty, Skel, Words, cx, useReveal } from '@/app/ui';

const FILTERS = [['all', 'All'], ['open', 'Accepting now'], ['closed', 'Closed'], ['unknown', 'Not confirmed']];
const GROUPS = { open: ['open', 'rolling'], closed: ['closed'], unknown: ['unknown'] };

function Status({ p }) {
  if (p.status === 'open') {
    const d = p.deadline ? daysUntil(p.deadline) : null;
    return (
      <div className="gov-status">
        <span className="tag mint"><i className="dot" style={{ width: 6, height: 6 }} /> Open</span>
        {p.deadline && <small>{p.estimated ? 'usually until ' : 'until '}<b className={cx(d <= 7 && 'tag red')} style={d <= 7 ? { height: 20, padding: '0 6px' } : undefined}>{shortDate(p.deadline)}</b></small>}
      </div>
    );
  }
  if (p.status === 'rolling') return <div className="gov-status"><span className="tag mint"><InfinityIcon /> Open all year</span></div>;
  if (p.status === 'closed') return <div className="gov-status"><span className="tag">Closed</span>{p.opensOn && <small>reopens {shortDate(p.opensOn)}</small>}</div>;
  return <div className="gov-status"><span className="tag line"><CircleHelp /> Not confirmed</span></div>;
}

function line(p) {
  if (p.status === 'open') return p.deadline ? null : 'The official page says applications are open.';
  if (p.status === 'closed') return p.endedOn ? `Last round ended ${shortDate(p.endedOn)}.` : 'The official page says applications are closed.';
  if (p.status === 'unknown') return 'The official page doesn’t say whether applications are open right now. Check it before applying.';
  return null;
}

export default function Government() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const ref = useReveal(`${filter}-${Boolean(data)}`);
  const load = () => { setError(''); api.government().then(setData).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const count = (id) => (!data ? '' : id === 'all' ? data.programs.length : data.programs.filter((p) => GROUPS[id].includes(p.status)).length);
  const shown = (data?.programs || []).filter((p) => filter === 'all' || GROUPS[filter].includes(p.status));

  return (
    <div ref={ref}>
      <section className="hero">
        <span className="eyebrow"><i className="dot" /> Checked about daily</span>
        <h1><Words text="Government internships, open right now" mark="now" /></h1>
        <p className="lead">Official internships from ministries and PSUs, and whether each one is taking applications today. No government internship ever asks for a fee.</p>
      </section>

      <div className="filters" role="group" aria-label="Status">
        {FILTERS.map(([id, label]) => (
          <button key={id} className="fchip plain" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {id === 'open' && <i className="dot" />}{label} <span className="n tab">{count(id)}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {error ? (
          <Empty icon={Landmark} title="Couldn’t load programs" action={<button className="btn dark" onClick={load}><RefreshCw /> Try again</button>}>{error}</Empty>
        ) : !data ? (
          <div className="gov-grid">{[...Array(4)].map((_, i) => <div key={i} className="card" style={{ padding: 24, display: 'grid', gap: 12 }}><Skel w="60%" h={18} /><Skel w="40%" /><Skel h={60} /></div>)}</div>
        ) : shown.length === 0 ? (
          <Empty icon={Landmark} title="Nothing here right now">Try another filter.</Empty>
        ) : (
          <div className="gov-grid">
            {shown.map((p, i) => (
              <article key={p.id} className="card hov glow gov rv" style={{ '--d': i % 6 }}>
                <div className="gov-top">
                  <span className="tile"><Landmark /></span>
                  <div className="tx"><h3>{p.name}</h3><p>{p.org}</p></div>
                  <Status p={p} />
                </div>
                <ul>
                  <li><CalendarClock />{p.window}</li>
                  {p.stipend && <li><IndianRupee />{p.stipend}</li>}
                  {p.eligibility && <li><Users />{p.eligibility}</li>}
                </ul>
                {p.note && <p className="note">{p.note}</p>}
                {line(p) && <p className="line">{line(p)}</p>}
                <div className="gov-foot">
                  <span>{p.checkedAt ? `Page checked ${timeAgo(p.checkedAt)}` : p.watch ? 'Not checked yet' : 'Check on the site'}</span>
                  <a className={cx('btn sm', p.status === 'open' || p.status === 'rolling' ? 'dark' : 'light')} href={p.url} target="_blank" rel="noopener noreferrer">Official page <ArrowUpRight /></a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <p style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)', maxWidth: 760 }}>
        Only official government pages are listed. Status comes from what each page says, checked about daily; where a page gives no date, the program’s usual schedule is shown. Always confirm on the official page.
      </p>
    </div>
  );
}
