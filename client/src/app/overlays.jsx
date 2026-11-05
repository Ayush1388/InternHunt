import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase, CalendarClock, CheckCircle2, ChevronDown, CircleCheck, CircleX, ExternalLink, Globe, GraduationCap, Landmark, LayoutGrid, Link2,
  ListChecks, Loader2, MailOpen, MapPin, Palette, Radar, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { DEADLINES, EXPERIENCE, LANGUAGES } from '@/lib/roles';
import { Avatar, Layer, Switch, cx } from '@/app/ui';

/* ------------------------------------------------------------------ ⌘K search palette */
export function SearchPalette({ open, onClose, go, applyPreset, onOpenJob, onAdd, onRefresh, onSources }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => input.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => api.jobs({ q: q.trim(), limit: 6 }).then((r) => setHits(r.jobs)).catch(() => setHits([])), 160);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    const pages = [
      [LayoutGrid, 'Today', () => go('today'), 'G T'],
      [GraduationCap, 'Internships', () => go('internships'), 'G I'],
      [Briefcase, 'Jobs', () => go('jobs'), 'G J'],
      [Landmark, 'Government programs', () => go('government'), 'G P'],
      [ListChecks, 'My tracker', () => go('tracker'), 'G A'],
      [Radar, 'Who’s recruiting', () => go('recruiting'), 'SOON'],
      [MailOpen, 'Founder drafts', () => go('drafts'), 'SOON'],
    ];
    const presets = [
      [CalendarClock, 'Internships closing this week', () => applyPreset({ kind: 'intern', deadline: 'week' })],
      [Briefcase, 'Fresher jobs (no experience)', () => applyPreset({ kind: 'job', exp: ['0'] })],
      [Sparkles, 'Programs (GSoC, STEP, drives…)', () => applyPreset({ kind: 'intern', type: 'programs' })],
      [Globe, 'Remote roles', () => applyPreset({ loc: ['remote_india', 'remote_worldwide'] })],
      [Sparkles, 'Data, AI and ML', () => applyPreset({ category: ['data', 'ml'] })],
      [Palette, 'UI/UX and web design', () => applyPreset({ category: ['design'] })],
      [MapPin, 'In Bengaluru', () => applyPreset({ city: 'Bengaluru', loc: ['india_onsite'] })],
    ];
    const actions = [
      [Link2, 'Add from link', onAdd],
      [RefreshCw, 'Refresh all sources', onRefresh],
      [ShieldCheck, 'View sources', onSources],
    ];
    const f = (arr) => arr.filter(([, label]) => label.toLowerCase().includes(q.trim().toLowerCase()));
    return [
      ['Roles', hits.map((j) => [null, j.title, () => onOpenJob(j), null, j])],
      ['Go to', f(pages)],
      ['Quick filters', f(presets)],
      ['Actions', f(actions)],
    ].filter(([, items]) => items.length);
  }, [q, hits, go, applyPreset, onOpenJob, onAdd, onRefresh, onSources]);

  const flat = groups.flatMap(([, items]) => items);
  useEffect(() => setSel(0), [q, hits.length]);
  const run = (fn) => { onClose(); setTimeout(fn, 10); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = flat.length;
      if (!n) return;
      const next = (sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      setSel(next);
      list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && flat[sel]) {
      e.preventDefault();
      run(flat[sel][2]);
    }
  };

  let k = -1;
  return (
    <Layer open={open} onClose={onClose} kind="palette" label="Search">
      <div className="pal-in">
        <Search />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search roles, jump to a page, or run a command…" aria-label="Search" />
        <span className="kbd">esc</span>
      </div>
      <div className="pal-list" ref={list} role="listbox">
        {flat.length === 0 && <p className="pal-empty">No matches for “{q}”.</p>}
        {groups.map(([title, items]) => (
          <div key={title}>
            <h5>{title}</h5>
            {items.map(([Icon, label, fn, hint, job]) => {
              k += 1;
              const idx = k;
              return (
                <button key={label + idx} data-i={idx} role="option" aria-selected={sel === idx} className={cx('pal-item', sel === idx && 'sel')} onMouseEnter={() => setSel(idx)} onClick={() => run(fn)}>
                  {job ? <Avatar name={job.company} size="sm" /> : <Icon />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  {job && <span className="s">· {job.company}</span>}
                  {hint && <span className="k">{hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Layer>
  );
}

/* ------------------------------------------------------------------ add from link */
export function AddLink({ open, onClose, onAdded }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { if (!open) setResult(null); }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await api.add(url.trim(), name.trim());
      setResult({ ok: true, text: r.message });
      setUrl('');
      setName('');
      onAdded?.(r);
    } catch (err) {
      setResult({ ok: false, text: err.body?.message || err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layer open={open} onClose={onClose} label="Add from link">
      <span className="m-ico"><Link2 /></span>
      <h2>Add from a link</h2>
      <p className="sub">Paste an official link: a company careers page, a job post, or a program page. Companies get all their roles tracked; program pages are watched for deadlines.</p>
      <form onSubmit={submit}>
        <label className="flabel" htmlFor="add-url">Link</label>
        <input id="add-url" className="field" type="url" required autoFocus placeholder="https://company.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} />
        <label className="flabel" htmlFor="add-name">Name <small>(optional)</small></label>
        <input id="add-name" className="field" placeholder="We’ll read it from the page" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
        {result && (
          <div className={cx('res', result.ok ? 'good' : 'bad')}>
            {result.ok ? <CheckCircle2 /> : <XCircle />}<p>{result.text}</p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 22 }}>
          <p className="note" style={{ marginTop: 0 }}>Telegram, WhatsApp, YouTube and job-portal reposts are refused.</p>
          <button className="btn lg dark" type="submit" disabled={busy}>{busy && <Loader2 className="spin" />}{busy ? 'Checking' : 'Add'}</button>
        </div>
      </form>
    </Layer>
  );
}

/* ------------------------------------------------------------------ sources */
const TRUST_ICON = { company: ShieldCheck, board: Globe, community: Users };

function CheckDirectly({ list }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const groups = {};
  for (const c of list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))) (groups[c.group || 'Other'] ||= []).push(c);
  return (
    <div style={{ marginTop: 26 }}>
      <h4 style={{ fontSize: 16 }}>Careers pages to check directly</h4>
      <p className="note" style={{ marginTop: 4 }}>{list.length} companies run their own careers sites with no public feed.</p>
      <div className="search" style={{ margin: '12px 0' }}>
        <Search />
        <input style={{ height: 44 }} placeholder="Find a company…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="src-list">
        {Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([g, items]) => {
          const isOpen = Boolean(q) || open[g];
          return (
            <div key={g} style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>
                <span>{g} <span style={{ color: 'var(--muted)' }}>{items.length}</span></span>
                <ChevronDown size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
              </button>
              {isOpen && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', padding: '0 16px 12px' }}>
                  {items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                    <a key={c.name} href={c.careers} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--muted)', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>{c.name} <ExternalLink size={12} /></a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sources({ open, onClose, meta, onChanged }) {
  const [blocked, setBlocked] = useState([]);
  const [direct, setDirect] = useState([]);
  useEffect(() => { if (open) api.blocked().then(setBlocked).catch(() => {}); }, [open, meta?.blockedCompanies]);
  useEffect(() => { if (open) api.programs().then((r) => setDirect(r.checkDirectly || [])).catch(() => {}); }, [open]);
  const sources = meta?.sources || [];
  const failed = sources.filter((s) => !s.ok);
  const filtered = Object.entries(meta?.lastSummary?.blocked || {}).sort((a, b) => b[1] - a[1]);

  async function unblock(key) {
    await api.unblock(key);
    setBlocked((l) => l.filter((c) => c.key !== key));
    onChanged?.();
  }

  return (
    <Layer open={open} onClose={onClose} kind="panel" label="Sources">
      <div className="p-head" style={{ display: 'block' }}>
        <h2>Where roles come from</h2>
        <p>{sources.length ? `${sources.length - failed.length} of ${sources.length} boards fetched` : 'No refresh yet'}{meta?.lastRefresh ? ` · ${timeAgo(meta.lastRefresh)}` : ''} · every {meta?.refreshHours || 6}h</p>
      </div>
      <div className="p-body">
        <div className="trust">
          {Object.entries(LABELS.trust).map(([k, v]) => {
            const Icon = TRUST_ICON[k];
            return <div key={k}><span className="ic"><Icon /></span><span><b>{v.label}</b><span>{v.hint}</span></span></div>;
          })}
        </div>
        {filtered.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Filtered out last refresh</h4>
            <ul className="src-list">
              {filtered.map(([reason, n]) => <li key={reason} style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{reason}</span><b className="tab">{n}</b></li>)}
            </ul>
          </div>
        )}
        {blocked.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Companies you blocked</h4>
            <ul className="src-list">
              {blocked.map((c) => (
                <li key={c.key} style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{c.company} <span style={{ color: 'var(--muted)' }}>· {c.reason}</span></span>
                  <button className="btn sm chip" onClick={() => unblock(c.key)}>Unblock</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {sources.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Boards</h4>
            <ul className="src-list">
              {sources.map((s) => (
                <li key={s.key}>
                  {s.ok ? <CircleCheck style={{ color: 'var(--green)' }} /> : <CircleX style={{ color: 'var(--red)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <b style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</b>
                      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 'none' }}>{LABELS.source[s.source] || s.source}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.ok ? `${s.kept} relevant of ${s.fetched}${s.blocked ? ` · ${s.blocked} blocked` : ''}` : s.error}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {direct.length > 0 && <CheckDirectly list={direct} />}
      </div>
    </Layer>
  );
}

/* ------------------------------------------------------------------ advanced filters */
export function Filters({ open, onClose, filters, setFilters, facets, onReset, total }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key, v) => setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const dl = { week: facets?.closingThisWeek, month: facets?.closingThisMonth, has: facets?.withDeadline, ended: facets?.ended, '': facets?.total };
  const langs = [...LANGUAGES].sort((a, b) => (facets?.byLanguage?.[b] || 0) - (facets?.byLanguage?.[a] || 0));
  return (
    <Layer open={open} onClose={onClose} kind="panel" label="Filters">
      <div className="p-head" style={{ display: 'block' }}>
        <h2>Filters</h2>
        <p>Narrow the list down. Changes apply straight away.</p>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        <div className="fsec">
          <h4>Show</h4>
          <div className="seg">
            {[['', 'Everything'], ['roles', 'Company roles'], ['programs', 'Programs']].map(([id, l]) => (
              <button key={id || 'all'} className={cx(filters.type === id && 'on')} onClick={() => set({ type: id })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="fsec">
          <h4>Last date to apply</h4>
          <div className="flist">
            {DEADLINES.map((d) => (
              <button key={d.id || 'open'} className={cx(filters.deadline === d.id && 'on')} onClick={() => set({ deadline: d.id })}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <i className={cx('dot', d.urgent && 'red')} style={{ animation: 'none', background: d.id === 'ended' ? '#b7b7bc' : undefined }} />{d.label}
                </span>
                <span className="n tab">{dl[d.id] || ''}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fsec">
          <h4>Experience asked</h4>
          <div className="fwrap">
            {EXPERIENCE.map((e) => (
              <button key={e.id} className={cx('fchip', !facets?.byExp?.[e.id] && !filters.exp.includes(e.id) && 'dim')} aria-pressed={filters.exp.includes(e.id)} onClick={() => toggle('exp', e.id)} title={e.hint}>
                {e.label} <span className="n">{facets?.byExp?.[e.id] || ''}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fsec">
          <h4>Language</h4>
          <div className="fwrap">
            {langs.map((l) => (
              <button key={l} className={cx('fchip', !facets?.byLanguage?.[l] && !filters.lang.includes(l) && 'dim')} aria-pressed={filters.lang.includes(l)} onClick={() => toggle('lang', l)} style={{ fontFamily: "'Geist Mono Variable', monospace", fontSize: 12.5 }}>
                {l} <span className="n">{facets?.byLanguage?.[l] || ''}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fsec">
          <h4>Where</h4>
          <div className="fwrap">
            {['india_onsite', 'remote_india', 'remote_worldwide'].map((k) => (
              <button key={k} className="fchip" aria-pressed={filters.loc.includes(k)} onClick={() => toggle('loc', k)}>
                {LABELS.loc[k]} <span className="n">{facets?.byLocation?.[k] || ''}</span>
              </button>
            ))}
          </div>
          {facets?.cities?.length > 0 && (
            <div className="fwrap" style={{ marginTop: 10 }}>
              {facets.cities.map((c) => (
                <button key={c.city} className="fchip" aria-pressed={filters.city === c.city} onClick={() => set({ city: filters.city === c.city ? '' : c.city })}>
                  <MapPin />{c.city} <span className="n">{c.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="fsec">
          <div className="switch-row"><span>Verified company pages only</span><Switch checked={Boolean(filters.companyOnly)} onChange={(v) => set({ companyOnly: v })} label="Verified company pages only" /></div>
          <div className="switch-row"><span>Hide ones I’ve applied to</span><Switch checked={filters.hideApplied} onChange={(v) => set({ hideApplied: v })} label="Hide applied" /></div>
        </div>
      </div>
      <div className="p-foot">
        <button className="btn lg chip" onClick={onReset}><RotateCcw /> Reset</button>
        <button className="btn lg dark grow" onClick={onClose}>Show {total != null ? `${total.toLocaleString('en-IN')} ` : ''}results</button>
      </div>
    </Layer>
  );
}
