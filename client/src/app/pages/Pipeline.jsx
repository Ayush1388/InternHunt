import { useEffect, useState } from 'react';
import { BellOff, Bookmark, Gift, KanbanSquare, Loader2, Mail, MailCheck, PartyPopper, RefreshCw, Trophy, XCircle } from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { Avatar, CountUp, Empty, Select, Skel, Words, cx, toast } from '@/app/ui';
import { useAuth } from '@/app/auth';
import { go } from '@/app/App';

// Found -> Drafted -> Sent -> Replied -> Interview. Cards drag between columns (or use the status menu).
const COLS = [
  { id: 'saved', title: 'Found', icon: Bookmark, tint: 'var(--t-blue)', statuses: ['saved'] },
  { id: 'drafted', title: 'Drafted', icon: Mail, tint: 'var(--t-butter)', statuses: ['drafted'] },
  { id: 'applied', title: 'Sent', icon: MailCheck, tint: 'var(--t-lilac)', statuses: ['applied', 'no_reply'] },
  { id: 'replied', title: 'Replied', icon: PartyPopper, tint: 'var(--t-mint)', statuses: ['replied'] },
  { id: 'interview', title: 'Interview', icon: Trophy, tint: 'var(--t-pink)', statuses: ['interview'] },
  { id: 'offer', title: 'Offer', icon: Gift, tint: 'var(--t-butter)', statuses: ['offer'] },
  { id: 'rejected', title: 'Rejected', icon: XCircle, tint: 'var(--t-red)', statuses: ['rejected'] },
];
const NO_REPLY_DAYS = 21;

function Card({ job, onOpen, onMove, onDraft, onReport }) {
  const waiting = job.status === 'applied' && job.trackedAt ? Math.floor((Date.now() - Date.parse(job.trackedAt)) / 86400000) : 0;
  return (
    <article
      className="pcard"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', job.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
    >
      <button className="pc-main" onClick={() => onOpen(job)}>
        <Avatar name={job.company} size="sm" />
        <span className="tx"><b>{job.company}</b><span>{job.title}</span></span>
      </button>
      {job.mail && (
        <div className="pc-mail" title={job.mail.subject}>
          <Mail /><span><b>{job.mail.subject}</b><small>From {job.mail.from} · {timeAgo(job.mail.at)}</small></span>
        </div>
      )}
      <div className="pc-foot">
        <span className="tab">{timeAgo(job.trackedAt)}</span>
        {job.status === 'no_reply' && <span className="tag">No reply</span>}
        {job.status === 'saved' && onDraft && <button className="btn sm chip" onClick={() => onDraft(job)}><Mail /> Email</button>}
        {job.status === 'drafted' && <button className="btn sm chip" onClick={() => go('drafts')}>Review</button>}
        {waiting >= NO_REPLY_DAYS && <button className="btn sm chip" onClick={() => onReport(job, 'no_reply')} title="Mark as no reply"><BellOff /> {waiting}d</button>}
        <Select value={job.status} label="Move to" options={Object.entries(LABELS.status)} onChange={(v) => onMove(job, v)} />
      </div>
    </article>
  );
}

export default function Pipeline({ version, onOpen, onTrack, onReport, onDraft }) {
  const auth = useAuth();
  const [data, setData] = useState(null);
  const [over, setOver] = useState(null);
  const [gmail, setGmail] = useState(null);
  const [scanning, setScanning] = useState(false);
  const load = () => api.pipeline().then(setData).catch(() => setData({ jobs: [], counts: {}, stats: {} }));

  useEffect(() => {
    if (!auth?.user) return;
    load();
    api.me.get().then((m) => setGmail(m.gmail)).catch(() => {});
  }, [version, auth?.user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function scan() {
    setScanning(true);
    try {
      const r = await api.gmail.scan();
      toast(r.updates.length ? `${r.updates.length} role${r.updates.length === 1 ? '' : 's'} moved on your board` : 'Nothing new in your inbox', { description: `Checked ${r.scanned} recent emails` });
      await load();
    } catch (e) {
      toast(e.code === 'NO_GMAIL' ? 'Connect Gmail in Settings first' : e.message);
    } finally {
      setScanning(false);
    }
  }

  if (!auth?.user) {
    return (
      <div>
        <section className="hero"><span className="eyebrow"><i className="dot" /> Private to you</span><h1><Words text="Your pipeline, one board" mark="pipeline," /></h1></section>
        <Empty icon={KanbanSquare} title="Sign in to keep a pipeline" action={<button className="btn dark" onClick={() => auth?.requestSignIn()}>Sign in with Google</button>}>
          Every role you save, every email you send and every reply, from found to interview.
        </Empty>
      </div>
    );
  }

  const jobs = data?.jobs || [];
  const stats = data?.stats || {};
  const rate = stats.sent ? Math.round((100 * (stats.replied || 0)) / stats.sent) : null;
  const move = (job, status) => {
    if (job.status === status) return;
    setData((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, status, trackedAt: new Date().toISOString() } : j)) }));
    onTrack(job, status);
    if (status === 'interview') toast('Interview! 🎉', { description: `${job.company} · good luck` });
  };
  const closed = jobs.filter((j) => j.status === 'rejected');

  return (
    <div>
      <section className="hero compact">
        <span className="eyebrow"><i className="dot" /> {stats.waiting ? `${stats.waiting} email${stats.waiting === 1 ? '' : 's'} waiting for your OK` : 'Drag cards to move them'}</span>
        <h1><Words text="Your pipeline, one board" mark="pipeline," /></h1>
        <div className="track-bar">
          {gmail?.connected ? (
            <>
              <button className="btn light" onClick={scan} disabled={scanning}>{scanning ? <Loader2 className="spin" /> : <RefreshCw />} Scan Gmail now</button>
              <span>Every day we check the sender and subject of recent mail and move Applied, Interview, Offer and Rejected for you. We never read the message itself.</span>
            </>
          ) : (
            <>
              <button className="btn light" onClick={() => go('settings')}><Mail /> Turn on Gmail tracking</button>
              <span>Connect Gmail and your board updates itself when companies reply.</span>
            </>
          )}
        </div>
      </section>

      <div className="pstats">
        <div className="ptile" style={{ background: 'var(--t-blue)' }}><small>Found</small><b><CountUp value={(data?.counts?.saved) || 0} /></b></div>
        <div className="ptile" style={{ background: 'var(--t-lilac)' }}><small>Emails sent</small><b><CountUp value={stats.sent || 0} /></b></div>
        <div className="ptile" style={{ background: 'var(--t-mint)' }}><small>Replies</small><b><CountUp value={stats.replied || 0} /></b>{rate != null && <span>{rate}% reply rate</span>}</div>
        <div className="ptile" style={{ background: 'var(--t-pink)' }}><small>Interviews</small><b><CountUp value={(data?.counts?.interview || 0) + (data?.counts?.offer || 0)} /></b></div>
      </div>

      {!data ? (
        <div className="board">{COLS.map((c) => <div key={c.id} className="col"><Skel h={22} w="50%" /><Skel h={90} r={20} style={{ marginTop: 14 }} /></div>)}</div>
      ) : jobs.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <Empty icon={KanbanSquare} title="Nothing here yet" action={<button className="btn dark" onClick={() => go('foryou')}>Find startups for me</button>}>Save a role or email a founder and it lands on the board.</Empty>
        </div>
      ) : (
        <div className="board">
          {COLS.map((c) => {
            const items = jobs.filter((j) => c.statuses.includes(j.status));
            return (
              <section
                key={c.id}
                className={cx('col', over === c.id && 'over')}
                onDragOver={(e) => { e.preventDefault(); setOver(c.id); }}
                onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const job = jobs.find((j) => j.id === e.dataTransfer.getData('text/plain'));
                  if (job && !c.statuses.includes(job.status)) move(job, c.id);
                }}
                aria-label={c.title}
              >
                <header><span className="ci" style={{ background: c.tint }}><c.icon /></span><h3>{c.title}</h3><span className="n tab">{items.length}</span></header>
                <div className="col-items">
                  {items.map((job) => <Card key={job.id} job={job} onOpen={onOpen} onMove={move} onDraft={onDraft} onReport={onReport} />)}
                  {!items.length && <p className="col-empty">Drop a card here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {closed.length > 0 && <p className="note" style={{ marginTop: 16 }}>{closed.length} closed (rejected). They stay in your history.</p>}
    </div>
  );
}
