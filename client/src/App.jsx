import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Briefcase, CalendarClock, Command as CommandIcon, GraduationCap, Landmark, ListChecks, Plus, RefreshCw, Search, ServerCog } from 'lucide-react';
import { api, store, timeAgo } from '@/api';
import { cn } from '@/lib/utils';
import { compact } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/theme';
import { AccountButton, useAuth } from '@/components/auth';
import Browse from '@/components/Browse';
import Applications from '@/components/Applications';
import Government from '@/components/Government';
import JobSheet from '@/components/JobSheet';
import AddLinkDialog from '@/components/AddLinkDialog';
import SourcesSheet from '@/components/SourcesSheet';
import CommandMenu from '@/components/CommandMenu';

const DEFAULT_FILTERS = {
  q: '', type: '', deadline: '', category: [], exp: [], lang: [], loc: [], city: '', companyOnly: false, sort: 'newest', hideApplied: true,
};
const PAGE_SIZE = 30;
const TABS = [
  { id: 'intern', label: 'Internships', short: 'Interns', icon: GraduationCap },
  { id: 'job', label: 'Jobs', short: 'Jobs', icon: Briefcase },
  { id: 'government', label: 'Government', short: 'Govt', icon: Landmark },
  { id: 'applications', label: 'Tracker', short: 'Tracker', icon: ListChecks },
];
const HERO = {
  intern: { title: 'internships', sub: 'From company careers pages and official programs — with last dates, requirements and scam filtering.' },
  job: { title: 'jobs', sub: 'Fresher to 5+ years, from companies’ own hiring systems. Filter by role, language and experience.' },
  government: { title: 'Government programs', sub: 'Official internships from ministries and PSUs, with whether each one is accepting applications right now.' },
  applications: { title: 'Your pipeline', sub: 'Every application in one place. Small steps, every day.' },
};

function loadFilters(kind) {
  const saved = store.get(`ih.filters.${kind}`, {});
  const f = { ...DEFAULT_FILTERS, ...saved, q: '' };
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

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 32 32" className="size-4.5" aria-hidden="true">
          <path d="M9 23V9h3v14zm6 0V9h3l4.2 8.1V9H25v14h-2.8L18 14.9V23z" fill="currentColor" />
        </svg>
      </div>
      <span className="font-serif text-2xl leading-none">InternHunt</span>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => {
    const t = store.get('ih.tab', 'intern');
    return { browse: 'intern', programs: 'government' }[t] || (TABS.some((x) => x.id === t) ? t : 'intern');
  });
  const [allFilters, setAllFilters] = useState(() => ({ intern: loadFilters('intern'), job: loadFilters('job') }));
  const kind = tab === 'job' ? 'job' : 'intern';
  const isListTab = tab === 'intern' || tab === 'job';
  const filters = allFilters[kind];
  const setFilters = useCallback(
    (update) => setAllFilters((all) => ({ ...all, [kind]: typeof update === 'function' ? update(all[kind]) : update })),
    [kind]
  );
  const [facets, setFacets] = useState({});
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState(null);
  const [groups, setGroups] = useState([]); // one entry per company (see /api/jobs?group=company)
  const [total, setTotal] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0);
  // Changes made since the list loaded (tracking, hides), applied to grouped and expanded lists alike.
  const [patches, setPatches] = useState({});
  const [hidden, setHidden] = useState({ jobs: new Set(), companies: new Set() });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [version, setVersion] = useState(0); // bumps when tracked data changes elsewhere
  const searchRef = useRef(null);
  const requestId = useRef(0);
  const auth = useAuth();

  const loadMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);
  const loadFacets = useCallback(
    () => ['intern', 'job'].forEach((k) => api.facets(k).then((f) => setFacets((all) => ({ ...all, [k]: f }))).catch(() => {})),
    []
  );

  const loadJobs = useCallback(
    async (nextPage = 1) => {
      const id = ++requestId.current;
      setLoading(true);
      setError('');
      try {
        if (!isListTab) return;
        const res = await api.jobs({ ...toParams(kind, { ...filters, q: query }, nextPage), group: 'company' });
        if (id !== requestId.current) return;
        if (nextPage === 1) {
          setPatches({});
          setHidden({ jobs: new Set(), companies: new Set() });
        }
        setGroups((prev) => (nextPage === 1 ? res.groups : [...prev, ...res.groups]));
        setTotal(res.total);
        setTotalGroups(res.totalGroups);
        setPage(nextPage);
      } catch (e) {
        if (id === requestId.current) setError(`Couldn't reach the server. ${e.message}`);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters, query, kind, isListTab]
  );

  useEffect(() => {
    const t = setTimeout(() => setQuery(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);
  useEffect(() => {
    store.set('ih.filters.intern', { ...allFilters.intern, q: '' });
    store.set('ih.filters.job', { ...allFilters.job, q: '' });
  }, [allFilters]);
  useEffect(() => {
    setQuery(filters.q);
    setGroups([]);
    setTotal(0);
    setTotalGroups(0);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => store.set('ih.tab', tab), [tab]);
  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);
  useEffect(() => {
    loadMeta();
    loadFacets();
  }, [loadMeta, loadFacets]);
  // Signing in or out changes what's tracked and hidden: reload everything personal.
  const authVersion = auth?.version ?? 0;
  const firstAuth = useRef(true);
  useEffect(() => {
    if (firstAuth.current) {
      firstAuth.current = false;
      return;
    }
    loadJobs(1);
    loadMeta();
    setVersion((v) => v + 1);
  }, [authVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while a server refresh is running.
  useEffect(() => {
    if (!meta?.refreshing) return;
    const t = setInterval(async () => {
      const m = await api.meta().catch(() => null);
      if (m && !m.refreshing) {
        setMeta(m);
        loadJobs(1);
        loadFacets();
        const s = m.lastSummary;
        toast(s ? `Refreshed — ${s.stored} relevant roles from ${s.fetched.toLocaleString('en-IN')} postings` : 'Refreshed');
      }
    }, 4000);
    return () => clearInterval(t);
  }, [meta?.refreshing, loadJobs]);

  // Keyboard: ⌘K palette, "/" search, "g" then b/a/p to switch tabs.
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        setTab((t) => (t === 'job' ? 'job' : 'intern'));
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === 'g') {
        gPressed = Date.now();
      } else if (Date.now() - gPressed < 800) {
        const map = { i: 'intern', j: 'job', p: 'government', a: 'applications', t: 'applications' };
        if (map[e.key]) setTab(map[e.key]);
        gPressed = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const isHidden = useCallback(
    (job) => hidden.jobs.has(job.id) || hidden.companies.has(String(job.company || '').trim().toLowerCase()),
    [hidden]
  );

  /** Saving, tracking and reporting are per person: ask to sign in first. */
  function needsSignIn(why) {
    if (auth?.user) return false;
    auth?.requestSignIn(why);
    return true;
  }

  async function onTrack(job, status, notes) {
    if (needsSignIn('Sign in to save roles and keep your own application tracker.')) return;
    const prev = { status: job.status, notes: job.notes };
    patchJob(job.id, { status, notes: notes ?? job.notes, trackedAt: new Date().toISOString() });
    try {
      if (status) await api.track(job.id, status, notes ?? job.notes ?? '');
      else await api.untrack(job.id);
      if (status === 'saved' && !prev.status) toast('Saved', { description: job.title });
      if (status === 'applied' && prev.status !== 'applied') toast('Marked as applied', { description: `${job.company} · keep the streak going` });
      loadMeta();
      loadFacets();
      setVersion((v) => v + 1);
    } catch (e) {
      patchJob(job.id, prev);
      if (e.status === 401) auth?.requestSignIn('Your session ended — sign in again.');
      else toast(`Couldn't update: ${e.message}`);
    }
  }

  async function onReport(job, reason) {
    if (needsSignIn('Sign in to report or hide roles — reports are kept per person.')) return;
    try {
      const res = await api.report(job.id, reason);
      if (reason === 'no_reply') {
        patchJob(job.id, { status: 'no_reply' });
        toast('Noted', { description: `${job.company}'s other roles will show they didn't reply.` });
      } else {
        setHidden((h) =>
          res.blockedCompany
            ? { ...h, companies: new Set(h.companies).add(String(job.company).trim().toLowerCase()) }
            : { ...h, jobs: new Set(h.jobs).add(job.id) }
        );
        setSheetOpen(false);
        toast(res.blockedCompany ? `Blocked ${job.company}` : 'Hidden', {
          description: res.blockedCompany ? 'All its roles are hidden for you. Undo in Sources.' : 'Hidden for you. Thanks for reporting.',
        });
      }
      loadMeta();
      loadFacets();
      setVersion((v) => v + 1);
    } catch (e) {
      if (e.status === 401) auth?.requestSignIn('Your session ended — sign in again.');
      else toast(`Couldn't report: ${e.message}`);
    }
  }

  function onApply(job) {
    window.open(job.url, '_blank', 'noopener,noreferrer');
    if (!job.status || job.status === 'saved') {
      toast('Did you apply?', {
        description: job.title,
        duration: 12000,
        action: { label: 'Yes, mark applied', onClick: () => onTrack(job, 'applied') },
      });
    }
  }

  function openJob(job) {
    setSelected(job);
    setSheetOpen(true);
  }

  const trackedTotal = meta ? Object.values(meta.trackedCounts || {}).reduce((a, b) => a + b, 0) : 0;
  const failedSources = meta?.sources?.filter((s) => !s.ok).length || 0;

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-0.5 rounded-full border bg-muted/40 p-1 md:flex" aria-label="Main">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'relative flex h-8 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-all duration-200',
                  tab === id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('size-4', tab === id && 'text-primary')} />
                {label}
                {id === 'applications' && trackedTotal > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular text-primary-foreground">{trackedTotal}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              className="hidden h-8 w-56 justify-start gap-2 bg-background/40 px-3 font-normal text-muted-foreground sm:flex lg:w-64"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="size-4" />
              Search or jump to…
              <span className="ml-auto flex gap-1">
                <Kbd><CommandIcon className="size-3" /></Kbd>
                <Kbd>K</Kbd>
              </span>
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setCmdOpen(true)}>
              <Search />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Add from link" onClick={() => setAddOpen(true)}>
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add from link</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Sources" className="relative" onClick={() => setSourcesOpen(true)}>
                  <ServerCog />
                  {failedSources > 0 && <span className="absolute top-2 right-2 size-1.5 rounded-full bg-foreground" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sources{failedSources ? ` · ${failedSources} failing` : ''}</TooltipContent>
            </Tooltip>
            <ThemeToggle />
            <AccountButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 md:pb-16">
        <section key={`hero-${tab}`} className="flex flex-wrap items-end justify-between gap-6 pt-10 pb-8 sm:pt-14">
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            {isListTab ? (
              <h1 className="font-serif text-5xl leading-none tracking-tight sm:text-6xl">
                <span className="tabular">{compact(facets[kind]?.total || 0)}</span> open <em className="italic">{HERO[tab].title}</em>
              </h1>
            ) : (
              <h1 className="font-serif text-5xl leading-none tracking-tight sm:text-6xl">{HERO[tab].title}</h1>
            )}
            <p className="mt-3 max-w-xl text-muted-foreground">{HERO[tab].sub}</p>
            {isListTab && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                {facets[kind]?.closingThisWeek > 0 && (
                  <button
                    onClick={() => setFilters((f) => ({ ...f, deadline: f.deadline === 'week' ? '' : 'week' }))}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors',
                      filters.deadline === 'week' ? 'border-urgent/50 bg-urgent/10' : 'bg-card hover:border-urgent/40'
                    )}
                  >
                    <CalendarClock className="size-3.5 text-urgent" />
                    <span className="font-semibold tabular text-urgent">{facets[kind].closingThisWeek}</span> closing this week
                  </button>
                )}
                {facets[kind]?.programs > 0 && (
                  <button
                    onClick={() => setFilters((f) => ({ ...f, type: f.type === 'programs' ? '' : 'programs' }))}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors',
                      filters.type === 'programs' ? 'border-primary/50 bg-primary/10' : 'bg-card hover:border-primary/40'
                    )}
                  >
                    <span className="font-semibold tabular text-primary">{facets[kind].programs}</span> programs & drives
                  </button>
                )}
                {facets[kind]?.newToday > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-muted-foreground">
                    <span className="relative flex size-2">
                      <span className="relative inline-flex size-2 rounded-full bg-success" />
                    </span>
                    <span className="tabular text-foreground">{facets[kind].newToday}</span> new today
                  </span>
                )}
              </div>
            )}
          </div>
          {isListTab && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={refresh} disabled={meta?.refreshing}>
              <RefreshCw className={cn(meta?.refreshing && 'animate-spin')} />
              {meta?.refreshing ? 'Refreshing' : meta?.lastRefresh ? `Updated ${timeAgo(meta.lastRefresh)}` : 'Refresh'}
            </Button>
          )}
        </section>

        {isListTab && (
          <Browse
            key={`browse-${kind}`}
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
            onMore={() => loadJobs(page + 1)}
            onOpen={openJob}
            onTrack={onTrack}
            onReport={onReport}
            onApply={onApply}
            onReset={() => setFilters({ ...DEFAULT_FILTERS })}
          />
        )}
        {tab === 'government' && <Government />}
        {tab === 'applications' && (
          <Applications meta={meta} version={version} signedIn={Boolean(auth?.user)} onSignIn={() => auth?.requestSignIn()} onOpen={openJob} onTrack={onTrack} onReport={onReport} />
        )}

        <footer className="mt-20 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          Roles come straight from companies' own hiring systems and official program pages
          {meta?.attributions?.length ? `, plus ${meta.attributions.join(', ')}` : ''}. Scam-like, agency and evergreen postings are
          filtered out. A real employer never asks you to pay.
        </footer>
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
        <div className="grid grid-cols-4">
          {TABS.map(({ id, short, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors', tab === id ? 'text-primary' : 'text-muted-foreground')}
            >
              <Icon className="size-5" />
              {short}
            </button>
          ))}
        </div>
      </nav>

      <JobSheet job={selected} open={sheetOpen} onOpenChange={setSheetOpen} onTrack={onTrack} onReport={onReport} onApply={onApply} />
      <AddLinkDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(r) => {
          setVersion((v) => v + 1);
          if (r.kind === 'company' || r.kind === 'program') setTimeout(() => { loadJobs(1); loadMeta(); loadFacets(); }, 8000);
        }}
      />
      <SourcesSheet open={sourcesOpen} onOpenChange={setSourcesOpen} meta={meta} onChanged={() => { loadMeta(); loadJobs(1); loadFacets(); }} />
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        go={setTab}
        applyPreset={(patch) => {
          const target = patch.kind || (tab === 'job' ? 'job' : 'intern');
          const { kind: _k, ...rest } = patch;
          setTab(target);
          setAllFilters((all) => ({ ...all, [target]: { ...DEFAULT_FILTERS, ...rest } }));
        }}
        onOpenJob={openJob}
        onAdd={() => setAddOpen(true)}
        onRefresh={refresh}
        onSources={() => setSourcesOpen(true)}
      />
    </div>
  );
}
