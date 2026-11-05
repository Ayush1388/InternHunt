import { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, ChevronDown, GraduationCap, Landmark, LayoutGrid, Link2, ListChecks, MailOpen, Radar, Search, ShieldCheck } from 'lucide-react';
import { api, store } from '@/api';
import { LogoMark, Menu, cx, toast } from '@/app/ui';
import { NavAccount, useAuth } from '@/app/auth';
import { JobPanel } from '@/app/jobs';
import { AddLink, Filters, SearchPalette, Sources } from '@/app/overlays';
import Today from '@/app/pages/Today';
import Listings from '@/app/pages/Listings';
import Government from '@/app/pages/Government';
import Tracker from '@/app/pages/Tracker';
import Soon from '@/app/pages/Soon';

export const PAGES = ['today', 'internships', 'jobs', 'government', 'tracker', 'recruiting', 'drafts'];
const TITLES = { today: 'Today', internships: 'Internships', jobs: 'Jobs', government: 'Government programs', tracker: 'Tracker', recruiting: 'Who’s recruiting', drafts: 'Founder drafts' };
const DEFAULT_FILTERS = { q: '', type: '', deadline: '', category: [], exp: [], lang: [], loc: [], city: '', companyOnly: false, sort: 'newest', hideApplied: true };
const PAGE_SIZE = 30;

export const go = (page) => {
  window.location.hash = page === 'today' ? '#/app' : `#/app/${page}`;
};

function loadFilters(kind) {
  const f = { ...DEFAULT_FILTERS, ...store.get(`ih.filters.${kind}`, {}), q: '' };
  for (const k of ['category', 'exp', 'lang', 'loc']) if (!Array.isArray(f[k])) f[k] = [];
  return f;
}

function toParams(kind, f, page) {
  const p = { kind, page, limit: PAGE_SIZE };
  if (f.q.trim()) p.q = f.q.trim();
  if (f.type) p.type = f.type;
  if (f.deadline) p.deadline = f.deadline;
  if (f.category.length) p.category = f.category.join(',');
  if (f.exp.length) p.exp = f.exp.join(',');
  if (f.lang.length) p.lang = f.lang.join(',');
  if (f.loc.length) p.loc = f.loc.join(',');
  if (f.city) p.city = f.city;
  if (f.sort !== 'newest') p.sort = f.sort;
  if (f.hideApplied) p.hideApplied = '1';
  if (f.companyOnly) p.companyOnly = '1';
  return p;
}

const NAV = [['today', 'Today', LayoutGrid], ['internships', 'Internships', GraduationCap], ['jobs', 'Jobs', Briefcase], ['government', 'Government', Landmark], ['tracker', 'Tracker', ListChecks]];
const TAB_LABEL = { today: 'Today', internships: 'Interns', jobs: 'Jobs', government: 'Govt', tracker: 'Tracker' };

export default function App({ page = 'today' }) {
  const kind = page === 'jobs' ? 'job' : 'intern';
  const isList = page === 'internships' || page === 'jobs';
  const [allFilters, setAllFilters] = useState(() => ({ intern: loadFilters('intern'), job: loadFilters('job') }));
  const filters = allFilters[kind];
  const setFilters = useCallback((u) => setAllFilters((all) => ({ ...all, [kind]: typeof u === 'function' ? u(all[kind]) : u })), [kind]);
  const [facets, setFacets] = useState({});
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
  const [navHidden, setNavHidden] = useState(false);
  const searchRef = useRef(null);
  const rootRef = useRef(null);
  const requestId = useRef(0);
  const auth = useAuth();

  useEffect(() => {
    document.title = `${TITLES[page]} · InternHunt`;
    store.set('ih.page', page);
    window.scrollTo(0, 0);
  }, [page]);

  const loadMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);
  const loadFacets = useCallback(() => ['intern', 'job'].forEach((k) => api.facets(k).then((f) => setFacets((all) => ({ ...all, [k]: f }))).catch(() => {})), []);

  const loadJobs = useCallback(async (next = 1) => {
    if (!isList) return;
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.jobs({ ...toParams(kind, { ...filters, q: query }, next), group: 'company' });
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
  }, [filters, query, kind, isList]);

  useEffect(() => { const t = setTimeout(() => setQuery(filters.q), 250); return () => clearTimeout(t); }, [filters.q]);
  useEffect(() => {
    store.set('ih.filters.intern', { ...allFilters.intern, q: '' });
    store.set('ih.filters.job', { ...allFilters.job, q: '' });
  }, [allFilters]);
  useEffect(() => { setQuery(filters.q); setGroups([]); setTotal(0); setTotalGroups(0); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadJobs(1); }, [loadJobs]);
  useEffect(() => { loadMeta(); loadFacets(); }, [loadMeta, loadFacets]);

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
        const s = m.lastSummary;
        toast(s ? `Refreshed: ${s.stored} relevant roles` : 'Refreshed', s ? { description: `from ${s.fetched.toLocaleString('en-IN')} postings` } : {});
      }
    }, 4000);
    return () => clearInterval(t);
  }, [meta?.refreshing, loadJobs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keyboard: ⌘K search, "/" focuses the list search, "g" then t/i/j/p/a switches page.
  useEffect(() => {
    let g = 0;
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPanel((p) => (p === 'search' ? null : 'search')); return; }
      if (typing || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); if (!isList) go('internships'); setTimeout(() => searchRef.current?.focus(), 80); }
      else if (e.key === 'g') g = Date.now();
      else if (Date.now() - g < 800) {
        const map = { t: 'today', i: 'internships', j: 'jobs', p: 'government', a: 'tracker' };
        if (map[e.key]) go(map[e.key]);
        g = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isList]);

  async function refresh() {
    try {
      const res = await api.refresh();
      toast(res.started ? 'Fetching from every source…' : res.message);
      setMeta((m) => ({ ...(m || {}), refreshing: true }));
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
    if (needsSignIn('Sign in to save roles and keep your own application tracker.')) return;
    const prev = { status: job.status, notes: job.notes };
    patchJob(job.id, { status, notes: notes ?? job.notes, trackedAt: new Date().toISOString() });
    try {
      if (status) await api.track(job.id, status, notes ?? job.notes ?? '');
      else await api.untrack(job.id);
      if (status === 'saved' && !prev.status) toast('Saved to your tracker', { description: job.title });
      if (status === 'applied' && prev.status !== 'applied') toast('Marked as applied', { description: `${job.company} · keep the streak going` });
      loadMeta(); loadFacets(); setVersion((v) => v + 1);
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
      loadMeta(); loadFacets(); setVersion((v) => v + 1);
    } catch (e) {
      if (e.status === 401) auth?.requestSignIn('Your session ended. Sign in again.');
      else toast(`Couldn’t report: ${e.message}`);
    }
  }

  function onApply(job) {
    window.open(job.url, '_blank', 'noopener,noreferrer');
    if (!job.status || job.status === 'saved') {
      toast('Did you apply?', { description: job.title, duration: 12000, action: { label: 'Yes, mark applied', onClick: () => onTrack(job, 'applied') } });
    }
  }

  const openJob = (job) => { setSelected(job); setPanel('job'); };
  const handlers = { onOpen: openJob, onTrack, onReport, onApply };
  const counts = { internships: facets.intern?.total, jobs: facets.job?.total, tracker: meta ? Object.values(meta.trackedCounts || {}).reduce((a, b) => a + b, 0) : 0 };
  const failing = meta?.sources?.filter((s) => !s.ok).length || 0;
  const closePanel = () => setPanel(null);

  return (
    <div className="ih" ref={rootRef}>
      <div className="progress" aria-hidden="true" />

      <header className={cx('nav', navHidden && !panel && 'hide')}>
        <nav className="nav-in" aria-label="Main">
          <a href="#/" className="logo" aria-label="InternHunt home"><span className="logo-mark"><LogoMark /></span><span className="t">InternHunt</span></a>
          <div className="nav-links">
            {NAV.map(([id, label, Icon]) => (
              <button key={id} className={cx(page === id && 'on')} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
                <Icon size={16} /> {label}{counts[id] ? <span className="n tab">{counts[id]}</span> : null}
              </button>
            ))}
          </div>
          <div className="nav-side">
            <Menu trigger={(p) => <button {...p} className="nav-icon" aria-label="More"><ChevronDown /></button>}>
              <h6>Coming soon</h6>
              <button role="menuitem" onClick={() => go('recruiting')}><Radar /> Who’s recruiting <span className="tag butter" style={{ marginLeft: 'auto', height: 20 }}>Soon</span></button>
              <button role="menuitem" onClick={() => go('drafts')}><MailOpen /> Founder drafts <span className="tag butter" style={{ marginLeft: 'auto', height: 20 }}>Soon</span></button>
              <hr />
              <button role="menuitem" onClick={() => setPanel('add')}><Link2 /> Add from link</button>
              <button role="menuitem" onClick={() => setPanel('sources')}><ShieldCheck /> Sources {failing > 0 && <span className="tag red" style={{ marginLeft: 'auto', height: 20 }}>{failing} failing</span>}</button>
            </Menu>
            <button className="nav-search" onClick={() => setPanel('search')}><Search size={16} /> Search <span className="kbd">⌘K</span></button>
            <button className="nav-icon search" onClick={() => setPanel('search')} aria-label="Search"><Search /></button>
            <NavAccount />
          </div>
        </nav>
      </header>

      <main className="wrap" key={page}>
        {page === 'today' && <Today facets={facets} meta={meta} version={version} onOpen={openJob} onSearch={() => setPanel('search')} go={go} />}
        {isList && (
          <Listings
            ref={searchRef}
            kind={kind}
            filters={filters}
            setFilters={setFilters}
            facets={facets[kind]}
            groups={groups}
            total={total}
            totalGroups={totalGroups}
            listParams={toParams(kind, { ...filters, q: query }, 1)}
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
        {page === 'government' && <Government />}
        {page === 'tracker' && <Tracker meta={meta} version={version} {...handlers} />}
        {(page === 'recruiting' || page === 'drafts') && <Soon kind={page} />}

        <footer className="foot">
          <div className="foot-in">
            <p>
              Roles come straight from companies’ own hiring systems and official program pages
              {meta?.attributions?.length ? `, plus ${meta.attributions.join(', ')}` : ''}. Scam-like, agency and evergreen posts are filtered out. A real employer never asks you to pay.
            </p>
            <nav aria-label="Footer"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/">About</a><a href="https://unsplash.com/photos/cloudy-sky-at-daytime-v9bnfMCyKbg" target="_blank" rel="noopener noreferrer">Photo: billy_huy / Unsplash</a></nav>
          </div>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(([id, , Icon]) => (
          <button key={id} className={cx(page === id && 'on')} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}><Icon />{TAB_LABEL[id]}</button>
        ))}
      </nav>

      <JobPanel job={selected} open={panel === 'job'} onClose={closePanel} onTrack={onTrack} onReport={onReport} onApply={onApply} />
      <Filters open={panel === 'filters'} onClose={closePanel} filters={filters} setFilters={setFilters} facets={facets[kind]} total={total} onReset={() => setFilters({ ...DEFAULT_FILTERS })} />
      <Sources open={panel === 'sources'} onClose={closePanel} meta={meta} onChanged={() => { loadMeta(); loadJobs(1); loadFacets(); }} />
      <AddLink open={panel === 'add'} onClose={closePanel} onAdded={(r) => { setVersion((v) => v + 1); if (r.kind === 'company' || r.kind === 'program') setTimeout(() => { loadJobs(1); loadMeta(); loadFacets(); }, 8000); }} />
      <SearchPalette
        open={panel === 'search'}
        onClose={closePanel}
        go={go}
        applyPreset={(patch) => {
          const target = patch.kind || kind;
          const { kind: _k, ...rest } = patch;
          go(target === 'job' ? 'jobs' : 'internships');
          setAllFilters((all) => ({ ...all, [target]: { ...DEFAULT_FILTERS, ...rest } }));
        }}
        onOpenJob={openJob}
        onAdd={() => setPanel('add')}
        onRefresh={refresh}
        onSources={() => setPanel('sources')}
      />
    </div>
  );
}
