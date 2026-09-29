import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Briefcase, Command as CommandIcon, Landmark, ListChecks, Plus, RefreshCw, Search, ServerCog } from 'lucide-react';
import { api, store, timeAgo } from '@/api';
import { cn } from '@/lib/utils';
import { compact } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/theme';
import Browse from '@/components/Browse';
import Applications from '@/components/Applications';
import Programs from '@/components/Programs';
import JobSheet from '@/components/JobSheet';
import AddLinkDialog from '@/components/AddLinkDialog';
import SourcesSheet from '@/components/SourcesSheet';
import CommandMenu from '@/components/CommandMenu';

const DEFAULT_FILTERS = { q: '', category: [], level: ['intern', 'entry'], loc: [], city: '', source: '', companyOnly: false, sort: 'newest', hideApplied: true };
const PAGE_SIZE = 30;
const TABS = [
  { id: 'browse', label: 'Browse', icon: Briefcase },
  { id: 'applications', label: 'Applications', icon: ListChecks },
  { id: 'programs', label: 'Programs', icon: Landmark },
];

function toParams(f, page) {
  const p = { page, limit: PAGE_SIZE };
  if (f.q.trim()) p.q = f.q.trim();
  if (f.category.length) p.category = f.category.join(',');
  if (f.level.length) p.level = f.level.join(',');
  if (f.loc.length) p.loc = f.loc.join(',');
  if (f.city) p.city = f.city;
  if (f.source) p.source = f.source;
  if (f.sort !== 'newest') p.sort = f.sort;
  if (f.hideApplied) p.hideApplied = '1';
  if (f.companyOnly) p.companyOnly = '1';
  return p;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded-lg bg-foreground text-background shadow-sm">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
          <path d="M9 23V9h3v14zm6 0V9h3l4.2 8.1V9H25v14h-2.8L18 14.9V23z" fill="currentColor" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-tight">InternHunt</span>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => store.get('ih.tab', 'browse'));
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS, ...store.get('ih.filters', {}), q: '' }));
  const [query, setQuery] = useState('');
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
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

  const loadMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);

  const loadJobs = useCallback(
    async (nextPage = 1) => {
      const id = ++requestId.current;
      setLoading(true);
      setError('');
      try {
        const res = await api.jobs(toParams({ ...filters, q: query }, nextPage));
        if (id !== requestId.current) return;
        setJobs((prev) => (nextPage === 1 ? res.jobs : [...prev, ...res.jobs]));
        setTotal(res.total);
        setPage(nextPage);
      } catch (e) {
        if (id === requestId.current) setError(`Couldn't reach the server — is it running? (${e.message})`);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filters, query]
  );

  useEffect(() => {
    const t = setTimeout(() => setQuery(filters.q), 250);
    return () => clearTimeout(t);
  }, [filters.q]);
  useEffect(() => store.set('ih.filters', { ...filters, q: '' }), [filters]);
  useEffect(() => store.set('ih.tab', tab), [tab]);
  useEffect(() => {
    loadJobs(1);
  }, [loadJobs]);
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // Poll while a server refresh is running.
  useEffect(() => {
    if (!meta?.refreshing) return;
    const t = setInterval(async () => {
      const m = await api.meta().catch(() => null);
      if (m && !m.refreshing) {
        setMeta(m);
        loadJobs(1);
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
        setTab('browse');
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === 'g') {
        gPressed = Date.now();
      } else if (Date.now() - gPressed < 800) {
        const map = { b: 'browse', a: 'applications', p: 'programs' };
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
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    setSelected((s) => (s?.id === id ? { ...s, ...patch } : s));
  };

  async function onTrack(job, status, notes) {
    const prev = { status: job.status, notes: job.notes };
    patchJob(job.id, { status, notes: notes ?? job.notes, trackedAt: new Date().toISOString() });
    try {
      if (status) await api.track(job.id, status, notes ?? job.notes ?? '');
      else await api.untrack(job.id);
      if (status === 'saved' && !prev.status) toast('Saved', { description: job.title });
      if (status === 'applied' && prev.status !== 'applied') toast('Marked as applied', { description: `${job.company} · keep the streak going` });
      loadMeta();
      setVersion((v) => v + 1);
    } catch (e) {
      patchJob(job.id, prev);
      toast(`Couldn't update: ${e.message}`);
    }
  }

  async function onReport(job, reason) {
    try {
      const res = await api.report(job.id, reason);
      if (reason === 'no_reply') {
        patchJob(job.id, { status: 'no_reply' });
        toast('Noted', { description: `${job.company}'s other roles will show they didn't reply.` });
      } else {
        const gone = (j) => (res.blockedCompany ? j.company === job.company : j.id === job.id);
        setJobs((list) => list.filter((j) => !gone(j)));
        setSheetOpen(false);
        toast(res.blockedCompany ? `Blocked ${job.company}` : 'Hidden', {
          description: res.blockedCompany ? 'All its roles are hidden. Undo in Sources.' : 'Thanks for reporting.',
        });
      }
      loadMeta();
      setVersion((v) => v + 1);
    } catch (e) {
      toast(`Couldn't report: ${e.message}`);
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'relative flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors',
                  tab === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-4" />
                {label}
                {id === 'applications' && trackedTotal > 0 && (
                  <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold tabular text-background">{trackedTotal}</span>
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 md:pb-16">
        <section className="flex flex-wrap items-end justify-between gap-6 pt-10 pb-8 sm:pt-14">
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            {tab === 'browse' && (
              <>
                <h1 className="text-gradient text-4xl font-semibold tracking-tighter sm:text-5xl">
                  <span className="tabular">{compact(meta?.total || 0)}</span> open roles
                </h1>
                <p className="mt-3 text-muted-foreground">
                  Internships and fresher roles from companies' own careers pages — filtered for scams.
                </p>
              </>
            )}
            {tab === 'applications' && (
              <>
                <h1 className="text-gradient text-4xl font-semibold tracking-tighter sm:text-5xl">Your pipeline</h1>
                <p className="mt-3 text-muted-foreground">Every application in one place. Small steps, every day.</p>
              </>
            )}
            {tab === 'programs' && (
              <>
                <h1 className="text-gradient text-4xl font-semibold tracking-tighter sm:text-5xl">Programs & drives</h1>
                <p className="mt-3 text-muted-foreground">Open source, government, research and hiring drives — from official pages only.</p>
              </>
            )}
          </div>
          {tab === 'browse' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {meta?.newToday > 0 && (
                <span className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/50" />
                    <span className="relative inline-flex size-2 rounded-full bg-foreground" />
                  </span>
                  <span className="tabular text-foreground">{meta.newToday}</span> new today
                </span>
              )}
              <Button variant="outline" size="sm" onClick={refresh} disabled={meta?.refreshing}>
                <RefreshCw className={cn(meta?.refreshing && 'animate-spin')} />
                {meta?.refreshing ? 'Refreshing' : meta?.lastRefresh ? `Updated ${timeAgo(meta.lastRefresh)}` : 'Refresh'}
              </Button>
            </div>
          )}
        </section>

        {tab === 'browse' && (
          <Browse
            ref={searchRef}
            filters={filters}
            setFilters={setFilters}
            meta={meta}
            jobs={jobs}
            total={total}
            loading={loading}
            error={error}
            hasMore={jobs.length < total}
            onMore={() => loadJobs(page + 1)}
            onOpen={openJob}
            onTrack={onTrack}
            onReport={onReport}
            onApply={onApply}
            onReset={() => setFilters({ ...DEFAULT_FILTERS })}
          />
        )}
        {tab === 'applications' && (
          <Applications meta={meta} version={version} onOpen={openJob} onTrack={onTrack} onReport={onReport} />
        )}
        {tab === 'programs' && <Programs version={version} />}

        <footer className="mt-20 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          Roles come straight from companies' own hiring systems
          {meta?.attributions?.length ? `, plus ${meta.attributions.join(', ')}` : ''}. Scam-like, agency and evergreen postings are
          filtered out. A real employer never asks you to pay.
        </footer>
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
        <div className="grid grid-cols-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors', tab === id ? 'text-foreground' : 'text-muted-foreground')}
            >
              <Icon className="size-5" />
              {label}
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
          if (r.kind === 'company') setTimeout(() => { loadJobs(1); loadMeta(); }, 8000);
        }}
      />
      <SourcesSheet open={sourcesOpen} onOpenChange={setSourcesOpen} meta={meta} onChanged={() => { loadMeta(); loadJobs(1); }} />
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        go={setTab}
        applyPreset={(patch) => {
          setTab('browse');
          setFilters({ ...DEFAULT_FILTERS, level: ['intern', 'entry'], ...patch });
        }}
        onOpenJob={openJob}
        onAdd={() => setAddOpen(true)}
        onRefresh={refresh}
        onSources={() => setSourcesOpen(true)}
      />
    </div>
  );
}
