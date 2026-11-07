import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, Banknote, Check, CircleCheck, CircleX, Copy, Inbox, Loader2, Mail, MailCheck, PartyPopper, RefreshCw, Rocket, Send, SkipForward, Sparkles, X,
} from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { Avatar, Empty, RowsSkeleton, Words, cx, toast } from '@/app/ui';
import { useAuth } from '@/app/auth';
import { go } from '@/app/App';

const TABS = [['review', 'To review', ['draft']], ['queued', 'Queued', ['queued', 'gmail_draft']], ['sent', 'Sent', ['sent']], ['skipped', 'Skipped', ['skipped', 'failed']]];
const STATUS = { draft: ['To review', 'butter'], queued: ['Sending soon', 'blue'], gmail_draft: ['In Gmail drafts', 'blue'], sent: ['Sent', 'mint'], skipped: ['Skipped', ''], failed: ['Failed', 'red'] };

function words(body = '') {
  let lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^(hi|hey|hello|dear)\b/i.test(lines[0])) lines = lines.slice(1);
  lines = lines.filter((l) => !/(not (a|the right)? ?(fit|relevant)|no worries|won['’]t follow up|just say so)/i.test(l));
  while (lines.length && (/^(thanks|best|cheers|regards)/i.test(lines.at(-1)) || lines.at(-1).split(/\s+/).length <= 3 || /^(https?:|github\.com|linkedin\.com)/i.test(lines.at(-1)))) lines.pop();
  return lines.join(' ').split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

function Checks({ checks, live }) {
  const items = (checks?.items || []).map((c) => (c.id === 'length' ? { ...c, label: `${live} words`, ok: live >= 60 && live <= 90 } : c));
  if (!items.length) return null;
  return (
    <div className="checks">
      {items.map((c) => (
        <span key={c.id} className={cx('chk', c.ok ? 'ok' : 'bad')} title={c.detail || ''}>
          {c.ok ? <Check /> : <X />}{c.label}
        </span>
      ))}
    </div>
  );
}

function Facts({ facts }) {
  const co = facts?.company;
  const proof = facts?.proof;
  if (!co && !proof) return null;
  return (
    <div className="facts-used">
      <small>The only facts this email uses</small>
      {co && co.kind !== 'none' && (
        <div className="f c1">
          <span className="ic">{co.kind === 'funding' ? <Banknote /> : co.kind === 'launch' ? <Rocket /> : <Sparkles />}</span>
          <span>{co.text}{co.url && <> · <a href={co.url} target="_blank" rel="noopener noreferrer">source <ArrowUpRight size={12} /></a></>}</span>
        </div>
      )}
      {proof && (proof.text || proof.skills?.length > 0) && (
        <div className="f c2">
          <span className="ic"><CircleCheck /></span>
          <span>{proof.text || `Your skills: ${proof.skills.join(', ')}`}{!proof.text && <> · <button className="linkbtn" onClick={() => go('foryou')}>add something you built</button></>}</span>
        </div>
      )}
    </div>
  );
}

function Editor({ draft, settings, onChange, onDone }) {
  const [d, setD] = useState(draft);
  const [people, setPeople] = useState([]);
  const [saving, setSaving] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef(null);
  const editable = ['draft', 'gmail_draft', 'failed'].includes(d.status);
  const live = useMemo(() => words(d.body), [d.body]);

  useEffect(() => setD(draft), [draft]);
  useEffect(() => {
    if (d.company?.key) api.company(d.company.key).then((c) => setPeople(c.contacts?.people || [])).catch(() => {});
  }, [d.company?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((patch) => {
    setSaving('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const next = await api.drafts.edit(draft.id, patch);
        setD((cur) => ({ ...next, subject: cur.subject, body: cur.body }));
        onChange(next);
        setSaving('Saved');
      } catch (e) {
        setSaving(e.message);
      }
    }, 650);
  }, [draft.id, onChange]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setD((x) => ({ ...x, [k]: v }));
    save({ [k]: v });
  };
  async function setRecipient(patch) {
    setBusy('to');
    try {
      const next = await api.drafts.edit(d.id, patch);
      setD(next);
      onChange(next);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy('');
    }
  }
  async function act(kind) {
    clearTimeout(timer.current);
    setBusy(kind);
    try {
      if (kind !== 'skip' && kind !== 'rewrite') await api.drafts.edit(d.id, { subject: d.subject, body: d.body });
      let next;
      if (kind === 'send') {
        next = await api.drafts.approve(d.id, 'send');
        toast(next.capped ? 'Approved. It goes tomorrow morning' : 'Approved. Sending from your Gmail', { description: next.capped ? `You’ve reached today’s limit of ${next.cap}.` : `To ${next.to.name || next.to.email}` });
      } else if (kind === 'gmail') {
        next = await api.drafts.approve(d.id, 'gmail_draft');
        toast('Saved in your Gmail drafts', { description: 'Open Gmail to send it yourself.' });
      } else if (kind === 'self') {
        next = await api.drafts.approve(d.id, 'self');
        toast('Marked as sent', { description: 'We’ll remind you to follow up.' });
      } else if (kind === 'skip') {
        next = await api.drafts.skip(d.id);
        toast('Skipped. It won’t be sent.');
      } else if (kind === 'rewrite') {
        next = await api.drafts.create({ jobId: d.job?.id, companyKey: d.job ? undefined : d.company?.key, regenerate: true });
        toast('Rewritten');
        onDone(next, true);
        return;
      } else if (kind === 'replied') {
        await api.drafts.replied(d.id);
        toast('Nice. Follow-ups stopped', { description: 'Moved to Replied in your pipeline.' });
        next = await api.drafts.get(d.id);
      }
      onDone(next);
    } catch (e) {
      if (e.code === 'NO_GMAIL') toast('Connect Gmail first', { description: 'Or send it from your mail app and mark it sent.', action: { label: 'Settings', onClick: () => go('settings') } });
      else toast(e.message);
    } finally {
      setBusy('');
    }
  }
  const mailto = `mailto:${encodeURIComponent(d.to.email || '')}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
  const gmail = settings?.gmail;
  const guesses = (d.to.guesses || []).filter((g) => g !== d.to.email);
  const tone = LABELS.email[d.to.status] || LABELS.email.none;

  return (
    <div className="card editor pop" key={d.id}>
      <div className="ed-head">
        <Avatar name={d.company?.name || '?'} size="lg" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>{d.company?.name}{d.kind === 'followup' && <span className="tag blue" style={{ marginLeft: 8, verticalAlign: 4 }}>Follow-up</span>}</h2>
          <p>{d.job ? d.job.title : 'No role listed'}{d.company?.oneLiner ? ` · ${d.company.oneLiner}` : ''}</p>
        </div>
        <span className={cx('tag', STATUS[d.status]?.[1])}>{STATUS[d.status]?.[0]}</span>
      </div>
      {d.why && <p className="why-note"><Sparkles /> {d.why}</p>}

      <div className="mailbox">
        <div className="mrow to">
          <span className="k">To</span>
          {people.length > 1 && editable ? (
            <select className="who" value={d.contactId || people.find((p) => p.name === d.to.name)?.id || ''} onChange={(e) => setRecipient({ contactId: Number(e.target.value) })} aria-label="Who to write to">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.title ? ` · ${p.title}` : ''}</option>)}
            </select>
          ) : (
            <b className="who-n">{d.to.name || 'Someone at the company'}{d.to.title ? <span> · {d.to.title}</span> : null}</b>
          )}
          <input
            className="addr"
            value={d.to.email || ''}
            placeholder="name@company.com"
            disabled={!editable || busy === 'to'}
            onChange={(e) => setD((x) => ({ ...x, to: { ...x.to, email: e.target.value } }))}
            onBlur={(e) => e.target.value !== draft.to.email && setRecipient({ toEmail: e.target.value })}
            aria-label="Email address"
          />
          <span className={cx('tag', tone.tone)} title={d.to.source ? `From ${LABELS.contactSource[d.to.source] || d.to.source}` : ''}>{tone.label}</span>
        </div>
        {editable && d.to.status === 'guess' && guesses.length > 0 && (
          <div className="mrow guesses">
            <span className="k">Or</span>
            {guesses.slice(0, 3).map((g) => <button key={g} className="gchip" onClick={() => setRecipient({ toEmail: g })}>{g}</button>)}
            <span className="hint">Guesses follow the company’s usual pattern. The first one is right most often.</span>
          </div>
        )}
        <div className="mrow">
          <span className="k">Subject</span>
          <input className="subj" value={d.subject} onChange={set('subject')} disabled={!editable} aria-label="Subject" />
        </div>
        <textarea className="mbody" value={d.body} onChange={set('body')} disabled={!editable} aria-label="Email" rows={14} />
        <div className="mfoot">
          <Checks checks={d.checks} live={live} />
          <span className="saving">{saving}</span>
        </div>
      </div>

      <Facts facts={d.facts} />

      {d.send?.status === 'sent' || d.status === 'sent' ? (
        <div className="sent-box">
          <div className="tl">
            <div className="st on"><i><MailCheck /></i><b>Sent</b><span>{timeAgo(d.send?.sentAt) || 'yes'}</span></div>
            {d.send?.repliedAt ? (
              <div className="st on mint"><i><PartyPopper /></i><b>They replied</b><span>{timeAgo(d.send.repliedAt)}</span></div>
            ) : d.send?.nextFollowupAt ? (
              <div className="st"><i><RefreshCw /></i><b>Follow-up {(d.send.followups || 0) + 1} of 3</b><span>{new Date(d.send.nextFollowupAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, for your OK</span></div>
            ) : null}
          </div>
          {!d.send?.repliedAt && <button className="btn mint" onClick={() => act('replied')} disabled={busy}><PartyPopper /> I got a reply</button>}
        </div>
      ) : d.status === 'queued' ? (
        <div className="sent-box"><p><Loader2 className="spin" size={16} /> Approved. Sending from your Gmail {d.send?.sendAfter ? timeAgo(d.send.sendAfter) : 'shortly'}.</p></div>
      ) : editable ? (
        <>
          {!gmail?.connected && (
            <div className="gmail-note">
              <Mail />
              <div><b>Send from your own Gmail</b><span>{gmail?.available ? 'Connect once. We only create drafts and send what you approve.' : 'Gmail sending isn’t set up on this server yet. Use your mail app and mark it sent.'}</span></div>
              {gmail?.available && <button className="btn sm dark" onClick={() => go('settings')}>Connect</button>}
            </div>
          )}
          <div className="ed-acts">
            {gmail?.connected ? (
              <>
                <button className="btn lg mint grow" onClick={() => act('send')} disabled={Boolean(busy) || !d.to.email}>{busy === 'send' ? <Loader2 className="spin" /> : <Send />} Approve and send</button>
                <button className="btn lg light" onClick={() => act('gmail')} disabled={Boolean(busy)}>{busy === 'gmail' ? <Loader2 className="spin" /> : <Inbox />} Gmail draft</button>
              </>
            ) : (
              <>
                <a className={cx('btn lg mint grow', !d.to.email && 'off')} href={mailto} onClick={() => setTimeout(() => toast('Sent it?', { duration: 15000, action: { label: 'Yes, mark sent', onClick: () => act('self') } }), 800)}><Send /> Open in my mail app</a>
                <button className="btn lg light" onClick={() => act('self')} disabled={Boolean(busy)}><Check /> I sent it</button>
              </>
            )}
            <button className="btn lg chip icon" title="Copy the email" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(`${d.subject}\n\n${d.body}`); toast('Copied'); }}><Copy /></button>
            <button className="btn lg chip icon" title="Write it again" aria-label="Rewrite" onClick={() => act('rewrite')} disabled={Boolean(busy)}>{busy === 'rewrite' ? <Loader2 className="spin" /> : <RefreshCw />}</button>
            <button className="btn lg ghost" onClick={() => act('skip')} disabled={Boolean(busy)}><SkipForward /> Skip</button>
          </div>
          <p className="note" style={{ marginTop: 10 }}>Nothing is sent until you approve it. Up to 3 short follow-ups in the same thread, each one waits for your OK, and they stop the moment someone replies.</p>
        </>
      ) : (
        d.error && <p className="res bad"><CircleX /> {d.error}</p>
      )}
    </div>
  );
}

export default function Drafts({ id, version, onChanged }) {
  const auth = useAuth();
  const [tab, setTab] = useState('review');
  const [data, setData] = useState(null);
  const [current, setCurrent] = useState(null);
  const [settings, setSettings] = useState(null);

  const load = useCallback(async () => {
    if (!auth?.user) return;
    const r = await api.drafts.list().catch(() => ({ drafts: [], counts: {} }));
    setData(r);
    return r;
  }, [auth?.user]);

  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { if (auth?.user) api.me.get().then(setSettings).catch(() => {}); }, [auth?.user]);
  useEffect(() => {
    if (!data) return;
    const want = id ? data.drafts.find((d) => String(d.id) === String(id)) : null;
    if (want) {
      setCurrent(want);
      setTab(TABS.find(([, , s]) => s.includes(want.status))?.[0] || 'review');
    } else if (!current || !data.drafts.some((d) => d.id === current.id)) {
      setCurrent(data.drafts.find((d) => d.status === 'draft') || null);
    }
  }, [data, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = data?.counts || {};
  const inTab = (t) => (data?.drafts || []).filter((d) => TABS.find(([k]) => k === t)[2].includes(d.status));
  const list = inTab(tab);
  const replace = (next) => setData((x) => (x ? { ...x, drafts: x.drafts.map((d) => (d.id === next.id ? next : d)) } : x));

  if (!auth?.user) {
    return (
      <div>
        <section className="hero"><span className="eyebrow"><i className="dot" /> You approve every email</span><h1><Words text="Emails you approve" mark="approve" /></h1></section>
        <Empty icon={Mail} title="Sign in to write to founders" action={<button className="btn dark" onClick={() => auth?.requestSignIn()}>Sign in with Google</button>}>
          Your drafts use your profile, so they need an account. Nothing is ever sent without your tap.
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <section className="hero compact">
        <span className="eyebrow"><i className="dot" /> {counts.draft ? `${counts.draft} waiting for your OK` : 'Nothing is sent without you'}</span>
        <h1><Words text="Emails you approve" mark="approve" /></h1>
        <p className="lead">Each one uses one real fact about the startup and one real thing you built. Edit anything, then send it from your own Gmail.</p>
      </section>

      <div className="drafts">
        <aside className="card dlist">
          <div className="seg" role="tablist" aria-label="Drafts">
            {TABS.map(([k, label]) => {
              const n = inTab(k).length;
              return <button key={k} role="tab" aria-selected={tab === k} className={cx(tab === k && 'on')} onClick={() => setTab(k)}>{label}{n ? <span className="n tab">{n}</span> : null}</button>;
            })}
          </div>
          {!data ? <RowsSkeleton n={4} /> : list.length === 0 ? (
            <div className="dl-empty">
              <span className="tile"><Inbox /></span>
              <b>{tab === 'review' ? 'Nothing to review' : `Nothing ${TABS.find(([k]) => k === tab)[1].toLowerCase()}`}</b>
              <span>{tab === 'review' ? 'Tap “Email founder” on any role, or pick a few on For you.' : 'They’ll show up here.'}</span>
              {tab === 'review' && <button className="btn sm dark" onClick={() => go('foryou')}>Find startups for me</button>}
            </div>
          ) : (
            <div className="dl-rows">
              {list.map((d) => (
                <button key={d.id} className={cx('dl-row', current?.id === d.id && 'on')} onClick={() => { setCurrent(d); window.history.replaceState(null, '', `#/app/drafts/${d.id}`); }}>
                  <Avatar name={d.company?.name || '?'} size="sm" />
                  <span className="tx">
                    <b>{d.company?.name}</b>
                    <span>{d.to.name ? `To ${d.to.name.split(' ')[0]} · ` : ''}{d.subject}</span>
                  </span>
                  <span className="when tab">{timeAgo(d.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section style={{ minWidth: 0 }}>
          {current ? (
            <Editor
              draft={current}
              settings={settings}
              onChange={(next) => replace(next)}
              onDone={async (next, isNew) => {
                const r = await load();
                setCurrent(isNew ? next : r?.drafts.find((d) => d.id === next.id) || next);
                onChanged?.();
              }}
            />
          ) : (
            <Empty icon={Mail} title="Pick a draft" action={<button className="btn dark" onClick={() => go('explore')}>Explore startups</button>}>Or write a new one from any role with “Email founder”.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}
