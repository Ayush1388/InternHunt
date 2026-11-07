import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Compass, KanbanSquare, Link2, Mail, Radar, Search, Settings as SettingsIcon, ShieldCheck, Sparkles } from 'lucide-react';
import { api, store } from '@/api';
import { BRAND } from '@/brand';
import { LogoMark, Menu, cx, toast } from '@/app/ui';
import { NavAccount, useAuth } from '@/app/auth';
import { JobPanel } from '@/app/jobs';
import { AddLink, Filters, SearchPalette, Sources } from '@/app/overlays';
import Explore from '@/app/pages/Explore';
import ForYou from '@/app/pages/ForYou';
import Drafts from '@/app/pages/Drafts';
import Pipeline from '@/app/pages/Pipeline';
import Settings from '@/app/pages/Settings';
import Soon from '@/app/pages/Soon';

export const PAGES = ['explore', 'foryou', 'drafts', 'pipeline', 'settings', 'recruiting'];
const TITLES = { explore: 'Explore', foryou: 'Curated for you', drafts: 'Drafts', pipeline: 'Pipeline', settings: 'Settings', recruiting: 'Who’s recruiting' };
const DEFAULT_FILTERS = {
  q: '', kind: '', backed: '', signal: '', deadline: '', category: [], exp: [], lang: [], loc: [], city: '', sort: 'newest', hideApplied: true,
};
const PAGE_SIZE = 30;

export const go = (page) => {
  window.location.hash = `#/app/${page}`;
};

function loadFilters() {
  const f = { ...DEFAULT_FILTERS, ...store.get('ih.filters.explore', {}), q: '' };
  for (const k of ['category', 'exp', 'lang', 'loc']) if (!Array.isArray(f[k])) f[k] = [];
  delete f.type;
  delete f.companyOnly;
  return f;
}

function toParams(f, page) {
  const p = { page, limit: PAGE_SIZE };
  if (f.kind) p.kind = f.kind;
  if (f.q.trim()) p.q = f.q.trim();
  if (f.backed) p.backed = f.backed;
  if (f.signal) p.signal = f.signal;
  if (f.deadline) p.deadline = f.deadline;
  if (f.category.length) p.category = f.category.join(',');
  if (f.exp.length) p.exp = f.exp.join(',');
  if (f.lang.length) p.lang = f.lang.join(',');
  if (f.loc.length) p.loc = f.loc.join(',');
  if (f.city) p.city = f.city;
  if (f.sort !== 'newest') p.sort = f.sort;
  if (f.hideApplied) p.hideApplied = '1';
  return p;
}

const NAV = [
  ['explore', 'Explore', Compass],
  ['foryou', 'For you', Sparkles],
  ['drafts', 'Drafts', Mail],
  ['pipeline', 'Pipeline', KanbanSquare],
  ['recruiting', 'Recruiting', Radar, true],
];
const TABS = [['explore', 'Explore', Compass], ['foryou', 'For you', Sparkles], ['drafts', 'Drafts', Mail], ['pipeline', 'Pipeline', KanbanSquare], ['settings', 'Settings', SettingsIcon]];

export default function App({ page = 'explore', kind: routeKind = '', arg = '' }) {
  const isExplore = page === 'explore';
  const [filters, setFilters] = useState(loadFilters);
  const [facetsAll, setFacetsAll] = useState({});
  const [facetsKind, setFacetsKind] = useState(null);
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState(null);
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  const [patches, setPatches] = useState({});
  const [hidden, setHidden] = useState({ jobs: new Set(), companies: new Set() });
  const [listPage, setListPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null); // 'job' | 'filters' | 'sources' | 'add' | 'search'
  const [version, setVersion] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [navHidden, setNavHidden] = useState(false);
  const searchRef = useRef(null);
  const rootRef = useRef(null);
  const requestId = useRef(0);
  const auth = useAuth();

  const facets = filters.kind && facetsKind ? facetsKind : facetsAll;

  useEffect(() => {
    document.title = `${TITLES[page]} · ${BRAND}`;
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (routeKind) setFilters((f) => ({ ...f, kind: routeKind }));
  }, [routeKind]);

  const loadMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);
  const loadFacets = useCallback(() => {
    api.facets('all').then(setFacetsAll).catch(() => {});
    if (filters.kind) api.facets(filters.kind).then(setFacetsKind).catch(() => {});
  }, [filters.kind]);
  const loadWaiting = useCallback(() => {
    if (!auth?.user) return setWaiting(0);
    api.drafts.list('review').then((r) => setWaiting(r.counts?.draft || 0)).catch(() => {});
  }, [auth?.user]);

  const loadJobs = useCallback(async (next = 1) => {
    if (!isExplore) return;
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.jobs({ ...toParams({ ...filters, q: query }, next), group: 'company' });
      if (id !== requestId.current) return;
      if (next === 1) { setPatches({}); setHidden({ jobs: new Set(), companies: new Set() }); }
      setGroups((prev) => (next === 1 ? res.groups : [...prev, ...res.groups]));
      setTotal(res.total);
      setTotalGroups(res.totalGroups);
      setListPage(next);
    } catch (e) {
      if (id === requestId.current) setError(`Couldn’t reach the server. ${e.message}`);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters, query, isExplore]);

  useEffect(() => { const t = setTimeout(() => setQuery(filters.q), 250); return () => clearTimeout(t); }, [filters.q]);
  useEffect(() => { store.set('ih.filters.explore', { ...filters, q: '' }); }, [filters]);
  useEffect(() => { loadJobs(1); }, [loadJobs]);
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadFacets(); }, [loadFacets]);
  useEffect(() => { loadWaiting(); }, [loadWaiting, version, page]);

  const authVersion = auth?.version ?? 0;
  const firstAuth = useRef(true);
  useEffect(() => {
    if (firstAuth.current) { firstAuth.current = false; return; }
    loadJobs(1); loadMeta(); setVersion((v) => v + 1);
  }, [authVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!meta?.refreshing) return;
    const t = setInterval(async () => {
      const m = await api.meta().catch(() => null);
      if (m && !m.refreshing) {
        setMeta(m); loadJobs(1); loadFacets();
        toast('Job boards refreshed', { description: `${(m.total || 0).toLocaleString('en-IN')} open roles` });
      }
    }, 5000);
    return () => clearInterval(t);
  }, [meta?.refreshing, loadJobs, loadFacets]);

  // Scroll: progress line, hide the nav on the way down. Pointer: spotlight on .card.glow.
  useEffect(() => {
    let last = 0, raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        rootRef.current?.style.setProperty('--p', max > 0 ? Math.min(1, y / max) : 0);
        setNavHidden(y > last && y > 260);
        last = y;
      });
    };
    const onMove = (e) => {
      const card = e.target.closest?.('.card.glow');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('scroll', onScroll); document.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // Keyboard: ⌘K search, "/" focuses the search box, "g" then e/f/d/p/s switches page.
  useEffect(() => {
    let g = 0;
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPanel((p) => (p === 'search' ? null : 'search')); return; }
      if (typing || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); if (!isExplore) go('explore'); setTimeout(() => searchRef.current?.focus(), 80); }
      else if (e.key === 'g') g = Date.now();
      else if (Date.now() - g < 800) {
        const map = { e: 'explore', f: 'foryou', d: 'drafts', p: 'pipeline', s: 'settings', r: 'recruiting' };
        if (map[e.key]) go(map[e.key]);
        g = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExplore]);

  async function refresh() {
    try {
      const res = await api.refresh();
      toast(res.started ? 'Reading every job board…' : res.message);
      if (res.started) setMeta((m) => ({ ...(m || {}), refreshing: true }));
    } catch (e) {
      toast(e.body?.message || e.message);
    }
  }

  const patchJob = (id, patch) => {
    setPatches((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setSelected((s) => (s?.id === id ? { ...s, ...patch } : s));
  };
  const withPatch = useCallback((job) => (patches[job.id] ? { ...job, ...patches[job.id] } : job), [patches]);
  const isHidden = useCallback((job) => hidden.jobs.has(job.id) || hidden.companies.has(String(job.company || '').trim().toLowerCase()), [hidden]);
  const needsSignIn = (why) => { if (auth?.user) return false; auth?.requestSignIn(why); return true; };

  async function onTrack(job, status, notes) {
    if (needsSignIn('Sign in to save roles and keep your own pipeline.')) return;
    const prev = { status: job.status, notes: job.notes };
    patchJob(job.id, { status, notes: notes ?? job.notes, trackedAt: new Date().toISOString() });
    try {
      if (status) await api.track(job.id, status, notes ?? job.notes ?? '');
      else await api.untrack(job.id);
      if (status === 'saved' && !prev.status) toast('Saved to your pipeline', { description: job.title });
      if (status === 'applied' && prev.status !== 'applied') toast('Moved to Sent', { description: `${job.company} · we’ll remind you to follow up` });
      setVersion((v) => v + 1);
    } catch (e) {
      patchJob(job.id, prev);
      if (e.status === 401) auth?.requestSignIn('Your session ended. Sign in again.');
      else toast(`Couldn’t update: ${e.message}`);
    }
  }

  async function onReport(job, reason) {
    if (needsSignIn('Sign in to report or hide roles. Reports are kept per person.')) return;
    try {
      const res = await api.report(job.id, reason);
      if (reason === 'no_reply') {
        patchJob(job.id, { status: 'no_reply' });
        toast('Noted', { description: `${job.company}'s other roles will show they didn't reply.` });
      } else {
        setHidden((h) => (res.blockedCompany ? { ...h, companies: new Set(h.companies).add(String(job.company).trim().toLowerCase()) } : { ...h, jobs: new Set(h.jobs).add(job.id) }));
        setPanel(null);
        toast(res.blockedCompany ? `Blocked ${job.company}` : 'Hidden for you', { description: res.blockedCompany ? 'All its roles are hidden. Undo in Sources.' : 'Thanks for reporting.' });
      }
      setVersion((v) => v + 1);
    } catch (e) {
      if (e.status === 401) auth?.requestSignIn('Your session ended. Sign in again.');
      else toast(`Couldn’t report: ${e.message}`);
    }
  }

  function onApply(job) {
    window.open(job.url, '_blank', 'noopener,noreferrer');
    if (!job.status || job.status === 'saved' || job.status === 'drafted') {
      toast('Did you apply?', { description: job.title, duration: 12000, action: { label: 'Yes, mark it sent', onClick: () => onTrack(job, 'applied') } });
    }
  }

  // Write the email to this role's founder, then open it in Drafts for review.
  const [drafting, setDrafting] = useState(null);
  async function onDraft(job) {
    if (needsSignIn('Sign in so the email can use your profile, and so you can review it before anything is sent.')) return;
    setDrafting(job.id);
    try {
      const d = await api.drafts.create({ jobId: job.id });
      patchJob(job.id, { status: job.status && job.status !== 'saved' ? job.status : 'drafted' });
      setPanel(null);
      setVersion((v) => v + 1);
      toast('Your email is ready to review', { description: `${d.company?.name || job.company}${d.to?.name ? ` · to ${d.to.name}` : ''}` });
      go(`drafts/${d.id}`);
    } catch (e) {
      if (e.status === 401) auth?.requestSignIn('Your session ended. Sign in again.');
      else toast(`Couldn’t write it: ${e.message}`);
    } finally {
      setDrafting(null);
    }
  }

  // A startup with news but no listed role: write to the founder anyway.
  async function onDraftCompany(c) {
    if (needsSignIn('Sign in so the email can use your profile. You review it before anything is sent.')) return;
    try {
      const d = await api.drafts.create({ companyKey: c.key });
      setVersion((v) => v + 1);
      toast('Your email is ready to review', { description: c.name });
      go(`drafts/${d.id}`);
    } catch (e) {
      toast(`Couldn’t write it: ${e.message}`);
    }
  }

  const openJob = (job) => { setSelected(job); setPanel('job'); };
  const handlers = { onOpen: openJob, onTrack, onReport, onApply, onDraft, onDraftCompany, drafting };
  const failing = (meta?.boards || []).reduce((n, b) => n + (b.n - b.ok), 0);
  const counts = { explore: facetsAll.total, drafts: waiting };
  const closePanel = () => setPanel(null);

  return (
    <div className="ih" ref={rootRef}>
      <div className="progress" aria-hidden="true" />

      <header className={cx('nav', navHidden && !panel && 'hide')}>
        <nav className="nav-in" aria-label="Main">
          <a href="#/" className="logo" aria-label={`${BRAND} home`}><span className="logo-mark"><LogoMark /></span><span className="t">{BRAND}</span></a>
          <div className="nav-links">
            {NAV.map(([id, label, Icon, soon]) => (
              <button key={id} className={cx(page === id && 'on')} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
                <Icon size={16} /> {label}
                {counts[id] ? <span className={cx('n tab', id === 'drafts' && 'hot')}>{counts[id].toLocaleString('en-IN')}</span> : null}
                {soon && <i className="soon" title="Coming soon" />}
              </button>
            ))}
          </div>
          <div className="nav-side">
            <Menu trigger={(p) => <button {...p} className="nav-icon" aria-label="More"><ChevronDown /></button>}>
              <button role="menuitem" onClick={() => go('settings')}><SettingsIcon /> Settings</button>
              <button role="menuitem" onClick={() => setPanel('add')}><Link2 /> Add a company from a link</button>
              <button role="menuitem" onClick={() => setPanel('sources')}><ShieldCheck /> Sources {failing > 0 && <span className="tag butter" style={{ marginLeft: 'auto', height: 20 }}>{failing} unreachable</span>}</button>
              <button role="menuitem" onClick={() => go('recruiting')}><Radar /> Who’s recruiting · soon</button>
            </Menu>
            <button className="nav-search" onClick={() => setPanel('search')}><Search size={16} /> Search <span className="kbd">⌘K</span></button>
            <button className="nav-icon search" onClick={() => setPanel('search')} aria-label="Search"><Search /></button>
            <NavAccount />
          </div>
        </nav>
      </header>

      <main className="wrap" key={page}>
        {isExplore && (
          <Explore
            ref={searchRef}
            filters={filters}
            setFilters={setFilters}
            facets={facets}
            kindCounts={facetsAll.byKind}
            groups={groups}
            total={total}
            totalGroups={totalGroups}
            listParams={toParams({ ...filters, q: query }, 1)}
            withPatch={withPatch}
            isHidden={isHidden}
            loading={loading}
            error={error}
            hasMore={groups.length < totalGroups}
            onMore={() => loadJobs(listPage + 1)}
            onReset={() => setFilters({ ...DEFAULT_FILTERS })}
            onOpenFilters={() => setPanel('filters')}
            meta={meta}
            onRefresh={refresh}
            {...handlers}
          />
        )}
        {page === 'foryou' && <ForYou version={version} facets={facetsAll} {...handlers} />}
        {page === 'drafts' && <Drafts id={arg} version={version} onChanged={() => setVersion((v) => v + 1)} />}
        {page === 'pipeline' && <Pipeline version={version} {...handlers} />}
        {page === 'settings' && <Settings version={version} />}
        {page === 'recruiting' && <Soon kind="recruiting" />}

        <footer className="foot">
          <div className="foot-in">
            <p>
              Roles come straight from companies’ own hiring systems and Y Combinator’s public company pages. Funding news from Entrackr, Inc42 and StartupTalky. Scam-like, agency and evergreen posts are filtered out. A real employer never asks you to pay.
            </p>
            <nav aria-label="Footer"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/">About {BRAND}</a><a href="https://unsplash.com/photos/cloudy-sky-at-daytime-v9bnfMCyKbg" target="_blank" rel="noopener noreferrer">Photo: billy_huy / Unsplash</a></nav>
          </div>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} className={cx(page === id && 'on')} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
            <span className="ti"><Icon />{id === 'drafts' && waiting > 0 && <i className="badge tab">{waiting}</i>}</span>{label}
          </button>
        ))}
      </nav>

      <JobPanel job={selected} open={panel === 'job'} onClose={closePanel} onTrack={onTrack} onReport={onReport} onApply={onApply} onDraft={onDraft} drafting={drafting} />
      <Filters open={panel === 'filters'} onClose={closePanel} filters={filters} setFilters={setFilters} facets={facets} total={total} onReset={() => setFilters({ ...DEFAULT_FILTERS })} />
      <Sources open={panel === 'sources'} onClose={closePanel} meta={meta} onChanged={() => { loadMeta(); loadJobs(1); loadFacets(); }} />
      <AddLink open={panel === 'add'} onClose={closePanel} onAdded={() => { setVersion((v) => v + 1); loadJobs(1); loadMeta(); loadFacets(); }} />
      <SearchPalette
        open={panel === 'search'}
        onClose={closePanel}
        go={go}
        applyPreset={(patch) => {
          go('explore');
          setFilters({ ...DEFAULT_FILTERS, ...patch });
        }}
        onOpenJob={openJob}
        onAdd={() => setPanel('add')}
        onRefresh={refresh}
        onSources={() => setPanel('sources')}
      />
    </div>
  );
}
