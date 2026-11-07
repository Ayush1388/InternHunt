import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote, Briefcase, CalendarClock, CheckCircle2, Globe, GraduationCap, KanbanSquare, LayoutGrid, Link2,
  Loader2, Mail, MapPin, Newspaper, Palette, Radar, RefreshCw, RotateCcw, Search, Settings, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { EXPERIENCE, LANGUAGES } from '@/lib/roles';
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
      [LayoutGrid, 'Explore', () => go('explore'), 'G E'],
      [Sparkles, 'Curated for you', () => go('foryou'), 'G F'],
      [Mail, 'Drafts to review', () => go('drafts'), 'G D'],
      [KanbanSquare, 'My pipeline', () => go('pipeline'), 'G P'],
      [Settings, 'Settings (Telegram, Gmail, limits)', () => go('settings'), 'G S'],
      [Radar, 'Who’s recruiting', () => go('recruiting'), 'SOON'],
    ];
    const presets = [
      [Banknote, 'Recently funded startups', () => applyPreset({ signal: 'funded' })],
      [GraduationCap, 'All internships', () => applyPreset({ kind: 'intern' })],
      [Briefcase, 'Fresher jobs (no experience)', () => applyPreset({ kind: 'job', exp: ['0'] })],
      [Sparkles, 'Y Combinator startups', () => applyPreset({ backed: 'yc' })],
      [Sparkles, 'Techstars startups', () => applyPreset({ backed: 'techstars' })],
      [Globe, 'Remote roles', () => applyPreset({ loc: ['remote_india', 'remote_worldwide', 'remote_region'] })],
      [Sparkles, 'Data, AI and ML', () => applyPreset({ category: ['data', 'ml'] })],
      [Palette, 'UI/UX and web design', () => applyPreset({ category: ['design'] })],
      [MapPin, 'In Bengaluru', () => applyPreset({ city: 'Bengaluru', loc: ['india_onsite'] })],
      [CalendarClock, 'Closing this week', () => applyPreset({ deadline: 'week' })],
    ];
    const actions = [
      [Link2, 'Add a company from a link', onAdd],
      [RefreshCw, 'Read the job boards again', onRefresh],
      [ShieldCheck, 'Where it all comes from', onSources],
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
      setResult({ ok: true, text: `Added ${r.company}: ${r.kept} relevant role${r.kept === 1 ? '' : 's'} of ${r.fetched} open. We’ll read it every morning.` });
      setUrl('');
      setName('');
      onAdded?.(r);
    } catch (err) {
      setResult({ ok: false, text: err.body?.error || err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layer open={open} onClose={onClose} label="Add from link">
      <span className="m-ico"><Link2 /></span>
      <h2>Add a startup from a link</h2>
      <p className="sub">Paste its careers page or job board (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters). We’ll read all its roles every morning.</p>
      <form onSubmit={submit}>
        <label className="flabel" htmlFor="add-url">Link</label>
        <input id="add-url" className="field" type="url" required autoFocus placeholder="https://startup.com/careers" value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} />
        <label className="flabel" htmlFor="add-name">Name <small>(optional)</small></label>
        <input id="add-name" className="field" placeholder="We’ll read it from the link" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
        {result && (
          <div className={cx('res', result.ok ? 'good' : 'bad')}>
            {result.ok ? <CheckCircle2 /> : <XCircle />}<p>{result.text}</p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 22 }}>
          <p className="note" style={{ marginTop: 0 }}>Only the company’s own hiring page. No job-portal reposts.</p>
          <button className="btn lg dark" type="submit" disabled={busy}>{busy && <Loader2 className="spin" />}{busy ? 'Reading it' : 'Add'}</button>
        </div>
      </form>
    </Layer>
  );
}

/* ------------------------------------------------------------------ sources */
const ATS_NAME = { ...LABELS.source, yc: 'Y Combinator company pages' };

export function Sources({ open, onClose, meta, onChanged }) {
  const [blocked, setBlocked] = useState([]);
  useEffect(() => { if (open) api.blocked().then(setBlocked).catch(() => {}); }, [open]);
  const boards = meta?.boards || [];
  const signals = meta?.signals || [];
  const sum = meta?.lastSummary;
  const row = (label, value) => <li key={label} style={{ justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{label}</span><b className="tab">{value}</b></li>;

  async function unblock(key) {
    await api.unblock(key);
    setBlocked((l) => l.filter((c) => c.key !== key));
    onChanged?.();
  }

  return (
    <Layer open={open} onClose={onClose} kind="panel" label="Sources">
      <div className="p-head" style={{ display: 'block' }}>
        <h2>Where it all comes from</h2>
        <p>{meta?.lastRefresh ? `Last read ${timeAgo(meta.lastRefresh)}` : 'Not read yet'} · every morning at 8:30 IST</p>
      </div>
      <div className="p-body">
        <div className="trust">
          <div><span className="ic"><ShieldCheck /></span><span><b>Roles: the company’s own hiring system</b><span>Public job-board APIs (Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters) and Y Combinator’s company pages. Nobody else can post there.</span></span></div>
          <div><span className="ic"><Newspaper /></span><span><b>Signals: startup news</b><span>Funding rounds from Entrackr, Inc42 and StartupTalky, and launches on YC. Only clear “X raised Y” headlines count.</span></span></div>
          <div><span className="ic"><Mail /></span><span><b>Founders: public pages only</b><span>YC company pages and the startup’s own website. Email guesses are labelled as guesses. Never LinkedIn.</span></span></div>
        </div>
        {sum && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Last morning run</h4>
            <ul className="src-list">
              {sum.funding && !sum.funding.error && row('Funding rounds in the news', sum.funding.raises)}
              {sum.yc && !sum.yc.error && row('YC startups hiring (recent batches)', sum.yc.companies)}
              {sum.boards && !sum.boards.error && row('Job boards read · new roles', `${sum.boards.boards} · ${sum.boards.newRoles}`)}
              {sum.discover && !sum.discover.error && row('New job boards found', sum.discover.found)}
            </ul>
          </div>
        )}
        {boards.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Job boards</h4>
            <ul className="src-list">
              {boards.map((b) => (
                <li key={b.ats} style={{ alignItems: 'center' }}>
                  <CheckCircle2 style={{ color: b.ok === b.n ? 'var(--green)' : 'var(--muted)' }} />
                  <span style={{ flex: 1 }}>{ATS_NAME[b.ats] || b.ats}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }} className="tab">{b.ok}/{b.n} reachable · {b.kept} roles</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {signals.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>News in the last 30 days</h4>
            <ul className="src-list">{signals.map((x) => row(LABELS.news[x.source] || x.source, x.n))}</ul>
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
      </div>
    </Layer>
  );
}

/* ------------------------------------------------------------------ advanced filters */
const DEADLINES = [
  { id: '', label: 'Open now' },
  { id: 'week', label: 'Closing this week', urgent: true },
  { id: 'has', label: 'Has a last date' },
];

export function Filters({ open, onClose, filters, setFilters, facets, onReset, total }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = (key, v) => setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));
  const dl = { week: facets?.closingThisWeek, has: facets?.withDeadline, '': facets?.total };
  const langs = [...LANGUAGES].sort((a, b) => (facets?.byLanguage?.[b] || 0) - (facets?.byLanguage?.[a] || 0));
  return (
    <Layer open={open} onClose={onClose} kind="panel" label="Filters">
      <div className="p-head" style={{ display: 'block' }}>
        <h2>Filters</h2>
        <p>Narrow the list down. Changes apply straight away.</p>
      </div>
      <div className="p-body" style={{ paddingTop: 4 }}>
        <div className="fsec">
          <h4>Startup news</h4>
          <div className="fwrap">
            {[['', 'Any'], ['funded', 'Raised in the last 90 days'], ['new', 'Roles new this week']].map(([id, l]) => (
              <button key={id || 'any'} className="fchip" aria-pressed={(filters.signal || '') === id} onClick={() => set({ signal: id })}>
                {id === 'funded' && <Banknote />}{l} <span className="n">{id === 'funded' ? facets?.funded || '' : ''}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="fsec">
          <h4>Backed by</h4>
          <div className="fwrap">
            {[['', 'Anyone'], ['any', 'YC or Techstars'], ['yc', 'Y Combinator'], ['techstars', 'Techstars']].map(([id, l]) => (
              <button key={id || 'none'} className="fchip" aria-pressed={(filters.backed || '') === id} onClick={() => set({ backed: id })}>
                {l} <span className="n">{id === 'yc' ? facets?.yc || '' : id === 'techstars' ? facets?.techstars || '' : ''}</span>
              </button>
            ))}
          </div>
          <p className="note" style={{ marginTop: 10 }}>Techstars covers the companies featured on techstars.com, not its whole portfolio.</p>
        </div>
        <div className="fsec">
          <h4>Last date to apply</h4>
          <div className="flist">
            {DEADLINES.map((d) => (
              <button key={d.id || 'open'} className={cx(filters.deadline === d.id && 'on')} onClick={() => set({ deadline: d.id })}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <i className={cx('dot', d.urgent && 'red')} style={{ animation: 'none' }} />{d.label}
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
            {['india_onsite', 'remote_india', 'remote_worldwide', 'remote_region', 'abroad_onsite'].map((k) => (
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
          <div className="switch-row"><span>Hide ones I’ve emailed or applied to</span><Switch checked={filters.hideApplied} onChange={(v) => set({ hideApplied: v })} label="Hide applied" /></div>
        </div>
      </div>
      <div className="p-foot">
        <button className="btn lg chip" onClick={onReset}><RotateCcw /> Reset</button>
        <button className="btn lg dark grow" onClick={onClose}>Show {total != null ? `${total.toLocaleString('en-IN')} ` : ''}results</button>
      </div>
    </Layer>
  );
}
