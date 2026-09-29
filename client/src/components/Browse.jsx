import { forwardRef, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Inbox, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, LABELS } from '@/api';
import CompanyAvatar from '@/components/CompanyAvatar';
import { ROLES, ROLE, DEADLINES } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import FiltersPanel from '@/components/FiltersPanel';
import JobCard from '@/components/JobCard';

export function JobListSkeleton({ rows = 5 }) {
  return (
    <ul className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <li key={i} className="flex gap-4 rounded-lg border bg-card p-5">
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full border bg-muted/50">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function activeChips(filters) {
  const chips = [];
  if (filters.type) chips.push(['type', filters.type, filters.type === 'programs' ? 'Programs only' : 'Company roles only']);
  if (filters.deadline) chips.push(['deadline', filters.deadline, DEADLINES.find((d) => d.id === filters.deadline)?.label]);
  for (const k of filters.category) chips.push(['category', k, ROLE[k]?.short]);
  for (const k of filters.exp || []) chips.push(['exp', k, LABELS.exp[k]]);
  for (const k of filters.lang) chips.push(['lang', k, k]);
  for (const k of filters.loc) chips.push(['loc', k, LABELS.loc[k]]);
  if (filters.city) chips.push(['city', filters.city, filters.city]);
  if (filters.companyOnly) chips.push(['companyOnly', true, 'Verified pages only']);
  return chips;
}

function RoleBar({ filters, setFilters, facets }) {
  const toggle = (id) =>
    setFilters((f) => ({ ...f, category: f.category.includes(id) ? f.category.filter((x) => x !== id) : [...f.category, id] }));
  const none = filters.category.length === 0;
  return (
    <div className="fade-x scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button
        onClick={() => setFilters((f) => ({ ...f, category: [] }))}
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all',
          none ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
        )}
      >
        All roles <span className="tabular opacity-70">{facets?.total ?? ''}</span>
      </button>
      {ROLES.map(({ id, short, icon: Icon, tint }) => {
        const on = filters.category.includes(id);
        const n = facets?.byCategory?.[id] || 0;
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-sm font-medium transition-all active:scale-[0.97]',
              on ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/40' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              !n && !on && 'opacity-50'
            )}
          >
            <span className={cn('grid size-6 place-items-center rounded-full', tint)}>
              <Icon className="size-3.5" />
            </span>
            {short}
            <span className="tabular text-xs opacity-60">{n || ''}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A company with several open roles, collapsed into one box. Opening it loads every matching role
 * (same filters); a second click, or the "Hide" button at the bottom, closes it again.
 */
function CompanyGroup({ group, listParams, withPatch, isHidden, onOpen, onTrack, onReport, onApply }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState(null);
  const [loadError, setLoadError] = useState('');
  const headerRef = useRef(null);
  const paramsKey = JSON.stringify(listParams);

  useEffect(() => {
    setRoles(null); // filters changed: reload when next opened
  }, [paramsKey]);
  useEffect(() => {
    if (!open || roles) return;
    setLoadError('');
    api
      .jobs({ ...listParams, company: group.companyKey, page: 1, limit: 100 })
      .then((r) => setRoles(r.jobs))
      .catch((e) => setLoadError(e.message));
  }, [open, roles, paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    // Closing from the bottom of a long list: bring the company back into view.
    const top = headerRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) headerRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const titles = group.jobs.map((j) => j.title);
  const more = group.count - titles.length;
  const shown = (roles || group.jobs).map(withPatch).filter((j) => !isHidden(j));

  return (
    <li className="scroll-mt-20 rounded-lg border bg-card surface" ref={headerRef}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-4 text-left transition-colors hover:bg-accent/40 sm:px-5"
      >
        <CompanyAvatar name={group.company} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">{group.company}</span>
            <span className="text-sm text-muted-foreground tabular">{group.count} open roles</span>
          </div>
          {!open && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {titles.join(' · ')}
              {more > 0 && ` · +${more} more`}
            </p>
          )}
        </div>
        <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">{open ? 'Hide roles' : 'Show all'}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t px-3 pt-3 pb-3 sm:px-4">
          {loadError ? (
            <p className="px-1 py-3 text-sm text-destructive">Couldn't load the roles: {loadError}</p>
          ) : !roles ? (
            <JobListSkeleton rows={Math.min(group.count, 3)} />
          ) : (
            <ul className="space-y-3">
              {shown.map((job) => (
                <JobCard key={job.id} job={job} onOpen={onOpen} onTrack={onTrack} onReport={onReport} onApply={onApply} />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={close}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronUp className="size-4" /> Hide {group.company}'s roles
          </button>
        </div>
      )}
    </li>
  );
}

const Browse = forwardRef(function Browse(
  {
    kind, filters, setFilters, facets, groups, total, totalGroups, listParams, withPatch, isHidden,
    loading, error, hasMore, onMore, onOpen, onTrack, onReport, onApply, onReset,
  },
  searchRef
) {
  const visible = groups.filter((g) => !(g.count === 1 ? isHidden(withPatch(g.jobs[0])) : isHidden({ company: g.company })));
  const chips = activeChips(filters);
  const removeChip = ([field, value]) =>
    setFilters((f) => ({
      ...f,
      [field]: Array.isArray(f[field]) ? f[field].filter((x) => x !== value) : field === 'companyOnly' ? false : '',
    }));
  const noun = kind === 'intern' ? 'internship' : 'job';

  return (
    <div className="space-y-6">
      <RoleBar filters={filters} setFilters={setFilters} facets={facets} />

      <div className="grid gap-8 lg:grid-cols-[272px_1fr]">
        <aside className="hidden lg:block">
          <div className="scrollbar-thin sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border bg-card p-5">
            <FiltersPanel kind={kind} filters={filters} setFilters={setFilters} facets={facets} onReset={onReset} />
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="h-11 rounded-xl bg-card pl-10 shadow-sm sm:pr-10"
                placeholder={`Search ${noun}s by title, company, skill…`}
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
              <Kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-11 rounded-xl lg:hidden">
                  <SlidersHorizontal /> Filters
                  {chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{chips.length}</span>}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>Narrow down the list.</SheetDescription>
                </SheetHeader>
                <div className="px-6 pb-8">
                  <FiltersPanel kind={kind} filters={filters} setFilters={setFilters} facets={facets} onReset={onReset} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground tabular">
              {loading && !groups.length
                ? 'Loading…'
                : `${total.toLocaleString('en-IN')} ${total === 1 ? noun : `${noun}s`} · ${totalGroups.toLocaleString('en-IN')} ${totalGroups === 1 ? 'company' : 'companies'}`}
            </span>
            {chips.map((c) => (
              <Badge
                key={`${c[0]}-${c[1]}`}
                variant="outline"
                className="cursor-pointer gap-1 rounded-full border-primary/30 bg-primary/5 font-normal transition-colors hover:bg-primary/10"
                onClick={() => removeChip(c)}
              >
                {c[2]} <X />
              </Badge>
            ))}
            <div className="ml-auto">
              <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}>
                <SelectTrigger size="sm" className="w-40 border-transparent bg-transparent shadow-none dark:bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="deadline">Closing soonest</SelectItem>
                  <SelectItem value="company">Company A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            {error ? (
              <EmptyState title="Can't reach the server">{error}</EmptyState>
            ) : loading && !groups.length ? (
              <JobListSkeleton />
            ) : visible.length === 0 ? (
              facets?.total || facets?.ended ? (
                <EmptyState title={`No ${noun}s match`} action={<Button variant="outline" onClick={onReset}>Reset filters</Button>}>
                  Try another role, fewer languages, or a wider location.
                </EmptyState>
              ) : (
                <EmptyState title="Nothing fetched yet">
                  Listings are being fetched from every source. This takes a minute or two on first load.
                </EmptyState>
              )
            ) : (
              <ul className="space-y-3">
                {visible.map((g) =>
                  g.count === 1 ? (
                    <JobCard
                      key={g.jobs[0].id}
                      job={withPatch(g.jobs[0])}
                      onOpen={onOpen}
                      onTrack={onTrack}
                      onReport={onReport}
                      onApply={onApply}
                      className="animate-in fade-in-0 fill-mode-both"
                    />
                  ) : (
                    <CompanyGroup
                      key={g.companyKey}
                      group={g}
                      listParams={listParams}
                      withPatch={withPatch}
                      isHidden={isHidden}
                      onOpen={onOpen}
                      onTrack={onTrack}
                      onReport={onReport}
                      onApply={onApply}
                    />
                  )
                )}
              </ul>
            )}
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={onMore} disabled={loading}>
                  {loading ? 'Loading…' : `Show more · ${(totalGroups - groups.length).toLocaleString('en-IN')} more companies`}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
});

export default Browse;
