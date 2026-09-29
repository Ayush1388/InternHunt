import { forwardRef } from 'react';
import { Inbox, Search, SlidersHorizontal, X } from 'lucide-react';
import { LABELS } from '@/api';
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
        <li key={i} className="flex gap-4 rounded-xl border bg-card p-5">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
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
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
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
  for (const k of filters.category) chips.push(['category', k, LABELS.category[k]]);
  for (const k of filters.loc) chips.push(['loc', k, LABELS.loc[k]]);
  if (filters.city) chips.push(['city', filters.city, filters.city]);
  if (filters.source) chips.push(['source', filters.source, LABELS.source[filters.source] || filters.source]);
  if (filters.companyOnly) chips.push(['companyOnly', true, 'Company pages only']);
  return chips;
}

const Browse = forwardRef(function Browse(
  { filters, setFilters, meta, jobs, total, loading, error, hasMore, onMore, onOpen, onTrack, onReport, onApply, onReset },
  searchRef
) {
  const chips = activeChips(filters);
  const removeChip = ([field, value]) =>
    setFilters((f) => ({
      ...f,
      [field]: Array.isArray(f[field]) ? f[field].filter((x) => x !== value) : field === 'companyOnly' ? false : '',
    }));

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <FiltersPanel filters={filters} setFilters={setFilters} meta={meta} onReset={onReset} />
        </div>
      </aside>

      <section className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="h-10 bg-card pl-9 sm:pr-10"
              placeholder="Search title, company, skill…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
            <Kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-10 lg:hidden">
                <SlidersHorizontal /> Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow down the list.</SheetDescription>
              </SheetHeader>
              <div className="px-6 pb-8">
                <FiltersPanel filters={filters} setFilters={setFilters} meta={meta} onReset={onReset} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground tabular">
            {loading && !jobs.length ? 'Loading…' : `${total.toLocaleString('en-IN')} ${total === 1 ? 'role' : 'roles'}`}
          </span>
          {chips.map((c) => (
            <Badge key={`${c[0]}-${c[1]}`} variant="outline" className="cursor-pointer gap-1 rounded-full font-normal" onClick={() => removeChip(c)}>
              {c[2]} <X />
            </Badge>
          ))}
          <div className="ml-auto">
            <Select value={filters.sort} onValueChange={(v) => setFilters((f) => ({ ...f, sort: v }))}>
              <SelectTrigger size="sm" className="w-36 border-transparent bg-transparent shadow-none dark:bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="company">Company A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4">
          {error ? (
            <EmptyState title="Can't reach the server">{error}</EmptyState>
          ) : loading && !jobs.length ? (
            <JobListSkeleton />
          ) : jobs.length === 0 ? (
            meta?.total ? (
              <EmptyState title="No roles match" action={<Button variant="outline" onClick={onReset}>Reset filters</Button>}>
                Try adding “Level not stated”, widening locations, or clearing the search.
              </EmptyState>
            ) : (
              <EmptyState title="Nothing fetched yet">
                Hit refresh to pull listings from every source. To try the app offline, run <code className="font-mono">npm run seed:sample</code> in server/.
              </EmptyState>
            )
          ) : (
            <ul className="space-y-3">
              {jobs.map((job, i) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onOpen={onOpen}
                  onTrack={onTrack}
                  onReport={onReport}
                  onApply={onApply}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                  style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
                />
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={onMore} disabled={loading}>
                {loading ? 'Loading…' : `Show more · ${(total - jobs.length).toLocaleString('en-IN')} left`}
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
});

export default Browse;
