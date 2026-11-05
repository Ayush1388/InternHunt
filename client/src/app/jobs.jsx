import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Bookmark, BookmarkCheck, CalendarClock, CalendarX2, ChevronDown, CircleCheck, Clock, Code2, Flag, Globe, GraduationCap,
  Infinity as InfinityIcon, MapPin, MoreHorizontal, ShieldCheck, Sparkles, TriangleAlert, Wallet,
} from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { ROLE } from '@/lib/roles';
import { deadlineInfo, shortDate } from '@/lib/format';
import { parseDescription } from '@/lib/description';
import { Avatar, Layer, Menu, Select, Skel, cx } from '@/app/ui';

/* ------------------------------------------------------------------ helpers */
export const placeOf = (job) => (job.locTag === 'india_onsite' ? job.city || 'India' : LABELS.loc[job.locTag]);

export function warningsOf(job) {
  return [
    ...(job.companyNoReply > 0 && job.status !== 'no_reply'
      ? [`${job.company} didn’t reply to ${job.companyNoReply === 1 ? 'an application' : `${job.companyNoReply} applications`} before`]
      : []),
    ...(job.flags || []).filter((f) => f !== 'deadline_estimated').map((f) => LABELS.flags[f]).filter(Boolean),
  ];
}

function preview(text = '') {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 24 && !/^(about (us|the company)|who we are|our company)/i.test(l));
  return line || text.trim();
}

const STATUS_OPTIONS = Object.entries(LABELS.status);

/** Small deadline pill for compact rows. */
export function DeadlineTag({ job }) {
  const d = deadlineInfo(job);
  if (d.tone === 'urgent') return <span className="tag red"><CalendarClock />{d.short}</span>;
  if (d.tone === 'open') return <span className="tag"><CalendarClock />{d.short}</span>;
  if (d.tone === 'rolling') return <span className="tag mint"><InfinityIcon />Rolling</span>;
  if (d.tone === 'ended') return <span className="tag"><CalendarX2 />Ended</span>;
  return null;
}

function When({ job }) {
  const d = deadlineInfo(job);
  if (d.tone === 'urgent' || d.tone === 'open') {
    return (
      <div className="when">
        <small>{d.estimated ? 'Usual last date' : 'Last date'}</small>
        <b className={d.tone === 'urgent' ? 'tag red' : undefined} style={d.tone === 'urgent' ? { height: 24 } : undefined}>{d.short}</b>
        {d.left && <span className="left">{d.left}</span>}
      </div>
    );
  }
  if (d.tone === 'rolling') return <div className="when"><small>Applications</small><b style={{ color: 'var(--green-ink)' }}>Rolling</b></div>;
  if (d.tone === 'ended') return <div className="when"><small>Status</small><b style={{ color: 'var(--muted)' }}>{d.label}</b></div>;
  return <div className="when"><small>Last date</small><b style={{ color: 'var(--muted)', fontWeight: 500 }}>Not listed</b></div>;
}

function Source({ job }) {
  const company = job.trust === 'company';
  return (
    <span title={LABELS.trust[job.trust]?.hint}>
      {company ? <ShieldCheck className="ok" /> : <Globe />}
      {company ? 'Company careers page' : LABELS.source[job.source] || job.source}
    </span>
  );
}

function ReportItems({ job, onReport, onApply, onOpen }) {
  return (
    <>
      <button role="menuitem" onClick={() => onApply(job)}><ArrowUpRight /> {job.isProgram ? 'Open official page' : 'Apply on company site'}</button>
      {onOpen && <button role="menuitem" onClick={() => onOpen(job)}><Sparkles /> View details</button>}
      <hr />
      <h6>Report</h6>
      {Object.entries(LABELS.reportReasons).map(([reason, label]) => (
        <button key={reason} role="menuitem" className={reason === 'scam' || reason === 'fake' ? 'danger' : undefined} onClick={() => onReport(job, reason)}>
          <Flag /> {label}
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ job card */
export function JobCard({ job, onOpen, onTrack, onReport, onApply, i = 0, inGroup = false }) {
  const isNew = !job.isProgram && job.firstSeen && Date.now() - Date.parse(job.firstSeen) < 86400000;
  const warnings = warningsOf(job);
  const saved = Boolean(job.status);
  const snippet = preview(job.snippet);
  const role = ROLE[job.category];

  return (
    <article
      className={cx('job', !inGroup && 'card hov rv')}
      style={{ '--d': Math.min(i, 8) }}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(job); }}
      tabIndex={0}
      aria-label={`${job.title} at ${job.company}`}
    >
      {!inGroup && (
        <div className="job-head">
          <Avatar name={job.company} />
          <div className="co">
            <b>{job.company}</b>
            <span><Source job={job} /></span>
          </div>
          <When job={job} />
        </div>
      )}
      <div className="job-body">
        <div className="main">
          <h3>
            {job.title}
            {isNew && <span className="tag peach" style={{ height: 22, marginLeft: 8, verticalAlign: 3, fontSize: 11 }}>New</span>}
          </h3>
          <div className="facts">
            <span>{job.locTag === 'india_onsite' ? <MapPin /> : <Globe />}{placeOf(job)}</span>
            {job.salary && <span><Wallet />{job.salary}</span>}
            {!job.isProgram && <span className="tab">{timeAgo(job.postedAt || job.firstSeen)}</span>}
            {inGroup && <DeadlineTag job={job} />}
          </div>
          {snippet && <p className="snip">{snippet}</p>}
          <div className="tags">
            {role && <span className="tag"><role.icon />{role.short}</span>}
            {job.level === 'intern' ? <span className="tag blue">Internship</span> : <span className={cx('tag', job.exp === 0 && 'mint')}>{LABELS.exp[job.exp] || 'No experience'}</span>}
            {job.isProgram && <span className="tag butter"><Sparkles />{job.employmentType || 'Program'}</span>}
            {job.languages?.slice(0, 3).map((l) => <span key={l} className="tag line mono">{l}</span>)}
            {job.languages?.length > 3 && <span className="tag line">+{job.languages.length - 3}</span>}
            {warnings.length > 0 && <span className="tag butter" title={warnings.join('\n')}><TriangleAlert />{warnings.length}</span>}
          </div>
        </div>
        <div className="job-acts" onClick={(e) => e.stopPropagation()}>
          <div className="pair">
            <button className={cx('btn sm', saved ? 'chip' : 'light')} aria-pressed={saved} onClick={() => onTrack(job, saved ? null : 'saved')}>
              {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? LABELS.status[job.status] : 'Save'}
            </button>
            <button className="btn sm dark hide-sm" onClick={() => onApply(job)}>Apply <ArrowUpRight /></button>
          </div>
          <Menu trigger={(p) => <button {...p} className="btn sm ghost icon" aria-label="More actions"><MoreHorizontal /></button>}>
            <ReportItems job={job} onReport={onReport} onApply={onApply} onOpen={onOpen} />
          </Menu>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ company with several roles */
export function CompanyGroup({ group, listParams, withPatch, isHidden, i, ...handlers }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState(null);
  const [err, setErr] = useState('');
  const key = JSON.stringify(listParams);

  useEffect(() => setRoles(null), [key]);
  useEffect(() => {
    if (!open || roles) return;
    setErr('');
    api.jobs({ ...listParams, company: group.companyKey, page: 1, limit: 100 }).then((r) => setRoles(r.jobs)).catch((e) => setErr(e.message));
  }, [open, roles, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (roles || group.jobs).map(withPatch).filter((j) => !isHidden(j));
  const titles = group.jobs.map((j) => j.title);
  const more = group.count - titles.length;

  return (
    <div className={cx('card hov rv', open && 'open')} style={{ '--d': Math.min(i, 8) }}>
      <button className="group-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar name={group.company} />
        <div className="co">
          <b>{group.company}</b> <span className="tag blue" style={{ height: 22, marginLeft: 6 }}>{group.count} open roles</span>
          {!open && <p>{titles.join(' · ')}{more > 0 && ` · +${more} more`}</p>}
        </div>
        <span className="chev"><ChevronDown /></span>
      </button>
      {open && (
        <div className="group-body">
          {err ? (
            <p className="res bad">Couldn’t load the roles: {err}</p>
          ) : !roles ? (
            <div style={{ padding: 14, display: 'grid', gap: 10 }}><Skel h={18} w="60%" /><Skel h={14} w="40%" /><Skel h={14} w="80%" /></div>
          ) : (
            shown.map((job) => <JobCard key={job.id} job={job} inGroup {...handlers} />)
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ detail panel */
function Banner({ job }) {
  const d = deadlineInfo(job);
  const Icon = d.tone === 'ended' ? CalendarX2 : d.tone === 'rolling' ? InfinityIcon : CalendarClock;
  let main;
  if (d.tone === 'urgent' || d.tone === 'open') {
    main = (
      <>
        {d.estimated ? 'Usual last date' : 'Last date to apply'}: <b>{shortDate(d.date, true)}</b>{d.left && ` · ${d.left}`}
        {d.estimated && <small>From the program’s usual schedule. Confirm on the official page.</small>}
      </>
    );
  } else if (d.tone === 'ended') main = <><b>Applications closed.</b> {d.date ? `${d.label}.` : 'No longer listed by the company.'}</>;
  else if (d.tone === 'rolling') main = <><b>Open all year.</b> Rolling applications.</>;
  else main = <><b>Open now.</b> The company hasn’t published a last date, so apply soon.</>;
  return <div className={cx('banner', d.tone)}><Icon /><div>{main}</div></div>;
}

function Description({ text }) {
  const sections = parseDescription(text || '');
  if (!sections.length) return <p className="empty" style={{ padding: 20, marginTop: 22 }}>The company didn’t include a description. Open the posting to read the full details.</p>;
  const block = (s) => {
    const bullets = s.lines.length > 1 && s.lines.every((l) => l.length < 260);
    return bullets ? <ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : s.lines.map((l, i) => <p key={i}>{l}</p>);
  };
  const reqs = sections.filter((s) => s.isRequirements);
  const rest = sections.filter((s) => !s.isRequirements);
  return (
    <div className="desc">
      {reqs.length > 0 && (
        <div className="req">
          <h4><CircleCheck /> Requirements</h4>
          {reqs.map((s) => <div key={s.title}>{reqs.length > 1 && <b style={{ fontSize: 13 }}>{s.title}</b>}{block(s)}</div>)}
        </div>
      )}
      {rest.map((s, i) => (
        <div key={`${s.title}-${i}`}>
          <h4>{s.title || (i === 0 ? 'About the role' : '')}</h4>
          {block(s)}
        </div>
      ))}
    </div>
  );
}

export function JobPanel({ job, open, onClose, onTrack, onReport, onApply }) {
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!job) return;
    setDetail(null);
    setNotes(job.notes || '');
    api.job(job.id).then(setDetail).catch(() => setDetail({ description: 'Could not load the description.' }));
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;
  const warnings = warningsOf(job);
  const saved = Boolean(job.status);
  const role = ROLE[job.category];
  const langs = detail?.languages || job.languages || [];

  return (
    <Layer open={open} onClose={onClose} kind="panel" label={job.title}>
      <div className="p-head">
        <Avatar name={job.company} size="lg" />
        <div style={{ minWidth: 0 }}>
          <h2>{job.title}</h2>
          <p>{job.company}</p>
          <div className="tags">
            {role && <span className="tag"><role.icon />{role.short}</span>}
            {job.level === 'intern' ? <span className="tag blue">Internship</span> : <span className={cx('tag', job.exp === 0 && 'mint')}>{LABELS.exp[job.exp]}</span>}
            {job.isProgram && <span className="tag butter"><Sparkles />{job.employmentType || 'Program'}</span>}
            <span className={cx('tag', job.trust === 'company' && 'mint')}>{job.trust === 'company' ? <ShieldCheck /> : <Globe />}{LABELS.trust[job.trust]?.label}</span>
          </div>
        </div>
      </div>
      <div className="p-body">
        <Banner job={job} />
        <div className="pfacts">
          <div className="fact"><span className="ic"><MapPin /></span><div><small>Where</small><b>{job.locations || placeOf(job)}</b></div></div>
          <div className="fact"><span className="ic"><GraduationCap /></span><div><small>Experience</small><b>{job.level === 'intern' ? 'Internship' : job.minYears != null ? `${job.minYears}+ years` : LABELS.exp[job.exp]}</b></div></div>
          {!job.isProgram && <div className="fact"><span className="ic"><Clock /></span><div><small>Posted</small><b>{timeAgo(job.postedAt || job.firstSeen) || 'Unknown'}</b></div></div>}
          <div className="fact"><span className="ic"><Code2 /></span><div><small>Role</small><b>{role?.label || job.category}</b></div></div>
          {job.salary && <div className="fact"><span className="ic"><Wallet /></span><div><small>Pay</small><b>{job.salary}</b></div></div>}
        </div>
        {langs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)', marginRight: 4 }}>Languages</span>
            {langs.map((l) => <span key={l} className="tag line mono">{l}</span>)}
          </div>
        )}
        {warnings.length > 0 && <div className="warns">{warnings.map((w) => <p key={w}><TriangleAlert />{w}</p>)}</div>}
        {detail ? <Description text={detail.description} /> : (
          <div style={{ marginTop: 24, display: 'grid', gap: 10 }}>
            {[...Array(7)].map((_, i) => <Skel key={i} h={13} w={`${95 - ((i * 13) % 35)}%`} />)}
          </div>
        )}
        {saved && (
          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 15 }}>Your notes</h4>
            <textarea className="notes" placeholder="Referral, OA date, interview round…" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (job.notes || '') && onTrack(job, job.status, notes)} />
          </div>
        )}
      </div>
      <div className="p-foot">
        <button className="btn lg dark grow" disabled={!job.isActive && !job.status} onClick={() => onApply(job)}>
          {job.isProgram ? 'Open official page' : 'Apply on company site'} <ArrowUpRight className="nudge" />
        </button>
        {saved ? (
          <Select value={job.status} onChange={(v) => onTrack(job, v)} options={STATUS_OPTIONS} label="Status" />
        ) : (
          <button className="btn lg light" onClick={() => onTrack(job, 'saved')}><Bookmark /> Save</button>
        )}
        <Menu trigger={(p) => <button {...p} className="btn lg chip icon" style={{ width: 52 }} aria-label="Report"><Flag /></button>}>
          <h6>Report this role</h6>
          {Object.entries(LABELS.reportReasons).map(([reason, label]) => (
            <button key={reason} role="menuitem" className={reason === 'scam' || reason === 'fake' ? 'danger' : undefined} onClick={() => onReport(job, reason)}><Flag /> {label}</button>
          ))}
        </Menu>
      </div>
    </Layer>
  );
}
