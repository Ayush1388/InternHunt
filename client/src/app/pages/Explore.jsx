import { forwardRef } from 'react';
import { CalendarClock, Inbox, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { LABELS, timeAgo } from '@/api';
import { ROLES, ROLE, DEADLINES } from '@/lib/roles';
import { compact } from '@/lib/format';
import { Empty, RowsSkeleton, Select, Words, cx, useReveal } from '@/app/ui';
import { CompanyGroup, JobCard } from '@/app/jobs';
import { BackedChips, KindToggle, RegionChips } from '@/app/scope';

const TRY = ['react intern', 'python', 'machine learning', 'design', 'backend'];

function activeChips(f) {
  const chips = [];
  if (f.type) chips.push(['type', f.type, f.type === 'programs' ? 'Programs only' : 'Company roles only']);
  if (f.deadline) chips.push(['deadline', f.deadline, DEADLINES.find((d) => d.id === f.deadline)?.label]);
  for (const k of f.category) chips.push(['category', k, ROLE[k]?.short]);
  for (const k of f.exp || []) chips.push(['exp', k, LABELS.exp[k]]);
  for (const k of f.lang) chips.push(['lang', k, k]);
  if (f.city) chips.push(['city', f.city, f.city]);
  if (f.companyOnly) chips.push(['companyOnly', true, 'Verified pages only']);
  return chips;
}

/** One page for every internship and job, anywhere: search, then narrow by level, backer, place and role. */
const Explore = forwardRef(function Explore(
  { filters, setFilters, facets, kindCounts, groups, total, totalGroups, listParams, withPatch, isHidden, loading, error, hasMore, onMore, onReset, onOpenFilters, meta, onRefresh, ...handlers },
  searchRef
) {
  const ref = useReveal(groups.length);
  const chips = activeChips(filters);
  const advanced = chips.filter(([k]) => k !== 'category').length;
  const visible = groups.filter((g) => !(g.count === 1 ? isHidden(withPatch(g.jobs[0])) : isHidden({ company: g.company })));
  const remove = ([field, value]) =>
    setFilters((f) => ({ ...f, [field]: Array.isArray(f[field]) ? f[field].filter((x) => x !== value) : field === 'companyOnly' ? false : '' }));
  const toggleRole = (id) => setFilters((f) => ({ ...f, category: f.category.includes(id) ? f.category.filter((x) => x !== id) : [...f.category, id] }));
  const count = facets?.total;
  const noun = filters.kind === 'intern' ? 'internships' : filters.kind === 'job' ? 'jobs' : 'roles';
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div ref={ref}>
      <section className="hero photo">
        <div className="hero-photo" aria-hidden="true"><img src="/hero-sky.jpg" alt="" /></div>
        <span className="eyebrow"><i className="dot" /> {facets?.newToday ? `${facets.newToday.toLocaleString('en-IN')} new today` : 'Updated every few hours'} · worldwide</span>
        <h1 key={`${filters.kind}-${count ?? 'x'}`} style={{ maxWidth: 900 }}>
          <Words text={`${count == null ? '' : `${compact(count)} `}open ${noun}. One search.`} mark="search." />
        </h1>
        <p className="lead">Internships and early jobs from company careers pages and official programs, with last dates and scam filtering. Startups backed by Y Combinator and Techstars are one tap away.</p>
        <label className="hero-search">
          <Search aria-hidden="true" />
          <span className="sr">Search {noun}</span>
          <input ref={searchRef} value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder={`Search ${noun} by title, company or skill`} />
          <span className="kbd">/</span>
        </label>
        <div className="try">
          <span>Try</span>
          {TRY.map((t) => <button key={t} onClick={() => set({ q: t })}>{t}</button>)}
        </div>
      </section>

      <div className="card deck">
        <div className="deck-top">
          <KindToggle value={filters.kind} onChange={(kind) => set({ kind })} counts={kindCounts} />
          <div className="right">
            <button className="btn light" onClick={onOpenFilters}>
              <SlidersHorizontal /> Filters
              {advanced > 0 && <span className="tag ink" style={{ height: 22, padding: '0 8px' }}>{advanced}</span>}
            </button>
            <Select value={filters.sort} onChange={(v) => set({ sort: v })} label="Sort" options={[['newest', 'Newest first'], ['deadline', 'Closing soonest'], ['company', 'Company A–Z']]} />
          </div>
        </div>
        <BackedChips value={filters.backed} onChange={(backed) => set({ backed })} facets={facets} />
        <RegionChips loc={filters.loc} onChange={(loc) => set({ loc })} />
        <div className="chiprow" role="group" aria-label="Role">
          <span className="chip-label"><Sparkles /> Role</span>
          <div className="chips">
          <button className="fchip" aria-pressed={filters.category.length === 0} onClick={() => set({ category: [] })}>All roles</button>
          {ROLES.map(({ id, short, icon: Icon }) => {
            const n = facets?.byCategory?.[id] || 0;
            const on = filters.category.includes(id);
            return (
              <button key={id} className={cx('fchip', !n && !on && 'dim')} aria-pressed={on} onClick={() => toggleRole(id)}>
                <Icon /> {short} <span className="n tab">{n || ''}</span>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div className="meta-line">
        <span className="tab">
          {loading && !groups.length ? 'Loading…' : `${total.toLocaleString('en-IN')} ${total === 1 ? 'role' : 'roles'} · ${totalGroups.toLocaleString('en-IN')} ${totalGroups === 1 ? 'company' : 'companies'}`}
        </span>
        {filters.q && <button className="active" onClick={() => set({ q: '' })}>“{filters.q}” <X /></button>}
        {facets?.closingThisWeek > 0 && (
          <button className={cx('fchip', 'plain')} style={{ height: 30, fontSize: 12.5 }} aria-pressed={filters.deadline === 'week'} onClick={() => set({ deadline: filters.deadline === 'week' ? '' : 'week' })}>
            <CalendarClock /> {facets.closingThisWeek} closing this week
          </button>
        )}
        {chips.map((ch) => (
          <button key={`${ch[0]}-${ch[1]}`} className="active" onClick={() => remove(ch)} aria-label={`Remove filter ${ch[2]}`}>{ch[2]} <X /></button>
        ))}
        <button className="linkbtn" style={{ marginLeft: 'auto' }} onClick={onRefresh} disabled={meta?.refreshing}>
          <RefreshCw size={13} className={meta?.refreshing ? 'spin' : undefined} style={{ verticalAlign: -2, marginRight: 6 }} />
          {meta?.refreshing ? 'Refreshing' : meta?.lastRefresh ? `Updated ${timeAgo(meta.lastRefresh)}` : 'Refresh'}
        </button>
      </div>

      {error ? (
        <Empty icon={Inbox} title="Can’t reach the server">{error}</Empty>
      ) : loading && !groups.length ? (
        <div className="card"><RowsSkeleton n={5} /></div>
      ) : visible.length === 0 ? (
        facets?.total || facets?.ended ? (
          <Empty icon={Search} title={`No ${noun} match`} action={<button className="btn dark" onClick={onReset}>Reset filters</button>}>Try another role, fewer languages, or a wider place.</Empty>
        ) : (
          <Empty icon={Inbox} title="Nothing fetched yet">Listings are being fetched from every source. This takes a minute or two on first load.</Empty>
        )
      ) : (
        <div className="list">
          {visible.map((g, i) =>
            g.count === 1 ? (
              <JobCard key={g.jobs[0].id} i={i} job={withPatch(g.jobs[0])} {...handlers} />
            ) : (
              <CompanyGroup key={g.companyKey} i={i} group={g} listParams={listParams} withPatch={withPatch} isHidden={isHidden} {...handlers} />
            )
          )}
        </div>
      )}
      {hasMore && (
        <div className="more">
          <button className="btn lg light" onClick={onMore} disabled={loading}>
            {loading ? 'Loading…' : `Show more · ${(totalGroups - groups.length).toLocaleString('en-IN')} more companies`}
          </button>
        </div>
      )}
    </div>
  );
});

export default Explore;
