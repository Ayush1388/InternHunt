import { forwardRef } from 'react';
import { CalendarClock, Inbox, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { LABELS, timeAgo } from '@/api';
import { ROLES, ROLE, DEADLINES } from '@/lib/roles';
import { compact } from '@/lib/format';
import { Empty, RowsSkeleton, Select, Words, cx, useReveal } from '@/app/ui';
import { CompanyGroup, JobCard } from '@/app/jobs';

function activeChips(f) {
  const chips = [];
  if (f.type) chips.push(['type', f.type, f.type === 'programs' ? 'Programs only' : 'Company roles only']);
  if (f.deadline) chips.push(['deadline', f.deadline, DEADLINES.find((d) => d.id === f.deadline)?.label]);
  for (const k of f.category) chips.push(['category', k, ROLE[k]?.short]);
  for (const k of f.exp || []) chips.push(['exp', k, LABELS.exp[k]]);
  for (const k of f.lang) chips.push(['lang', k, k]);
  for (const k of f.loc) chips.push(['loc', k, LABELS.loc[k]]);
  if (f.city) chips.push(['city', f.city, f.city]);
  if (f.companyOnly) chips.push(['companyOnly', true, 'Verified pages only']);
  return chips;
}

const COPY = {
  intern: { noun: 'internships', one: 'internship', lead: 'From company careers pages and official programs, with last dates, requirements and scam filtering.' },
  job: { noun: 'jobs', one: 'job', lead: 'Fresher to 5+ years, straight from companies’ own hiring systems. Filter by role, language and experience.' },
};

const Listings = forwardRef(function Listings(
  { kind, filters, setFilters, facets, groups, total, totalGroups, listParams, withPatch, isHidden, loading, error, hasMore, onMore, onReset, onOpenFilters, meta, onRefresh, ...handlers },
  searchRef
) {
  const c = COPY[kind];
  const ref = useReveal(groups.length);
  const chips = activeChips(filters);
  const advanced = chips.filter(([k]) => k !== 'category').length;
  const visible = groups.filter((g) => !(g.count === 1 ? isHidden(withPatch(g.jobs[0])) : isHidden({ company: g.company })));
  const remove = ([field, value]) => setFilters((f) => ({ ...f, [field]: Array.isArray(f[field]) ? f[field].filter((x) => x !== value) : field === 'companyOnly' ? false : '' }));
  const toggleRole = (id) => setFilters((f) => ({ ...f, category: f.category.includes(id) ? f.category.filter((x) => x !== id) : [...f.category, id] }));
  const count = facets?.total;

  return (
    <div ref={ref}>
      <section className="hero">
        <div className="hero-row">
          <div>
            <span className="eyebrow"><i className="dot" /> {facets?.newToday ? `${facets.newToday} new today` : 'Updated every few hours'}</span>
            <h1 key={`${kind}-${count ?? 'x'}`}><Words text={`${count == null ? '' : compact(count) + ' '}open ${c.noun}`} mark={c.noun} /></h1>
            <p className="lead">{c.lead}</p>
          </div>
          <div className="hero-actions">
            <button className="btn light" onClick={onRefresh} disabled={meta?.refreshing}>
              <RefreshCw className={meta?.refreshing ? 'spin' : undefined} />
              {meta?.refreshing ? 'Refreshing' : meta?.lastRefresh ? `Updated ${timeAgo(meta.lastRefresh)}` : 'Refresh'}
            </button>
          </div>
        </div>
        {(facets?.closingThisWeek > 0 || facets?.programs > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 22 }}>
            {facets?.closingThisWeek > 0 && (
              <button className="fchip" aria-pressed={filters.deadline === 'week'} onClick={() => setFilters((f) => ({ ...f, deadline: f.deadline === 'week' ? '' : 'week' }))} style={filters.deadline === 'week' ? undefined : { background: 'var(--t-red)', color: 'var(--red)' }}>
                <CalendarClock /> <b className="tab">{facets.closingThisWeek}</b> closing this week
              </button>
            )}
            {facets?.programs > 0 && (
              <button className="fchip" aria-pressed={filters.type === 'programs'} onClick={() => setFilters((f) => ({ ...f, type: f.type === 'programs' ? '' : 'programs' }))} style={filters.type === 'programs' ? undefined : { background: 'var(--t-blue)', color: 'var(--sky-ink)' }}>
                <Sparkles /> <b className="tab">{facets.programs}</b> programs & drives
              </button>
            )}
          </div>
        )}
      </section>

      <div className="filters" role="group" aria-label="Role">
        <button className="fchip plain" aria-pressed={filters.category.length === 0} onClick={() => setFilters((f) => ({ ...f, category: [] }))}>
          All roles <span className="n tab">{facets?.total ?? ''}</span>
        </button>
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

      <div className="toolbar">
        <label className="search">
          <Search />
          <span className="sr">Search {c.noun}</span>
          <input ref={searchRef} value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder={`Search ${c.noun} by title, company or skill`} />
          <span className="kbd">/</span>
        </label>
        <button className="btn lg light" onClick={onOpenFilters} style={{ flex: 'none' }}>
          <SlidersHorizontal /> <span className="hide-xs">Filters</span>
          {advanced > 0 && <span className="tag ink" style={{ height: 22, padding: '0 8px' }}>{advanced}</span>}
        </button>
      </div>

      <div className="meta-line">
        <span className="tab">
          {loading && !groups.length ? 'Loading…' : `${total.toLocaleString('en-IN')} ${total === 1 ? c.one : c.noun} · ${totalGroups.toLocaleString('en-IN')} ${totalGroups === 1 ? 'company' : 'companies'}`}
        </span>
        {chips.map((ch) => (
          <button key={`${ch[0]}-${ch[1]}`} className="active" onClick={() => remove(ch)} aria-label={`Remove filter ${ch[2]}`}>{ch[2]} <X /></button>
        ))}
        <span className="sort">
          <Select value={filters.sort} onChange={(v) => setFilters((f) => ({ ...f, sort: v }))} label="Sort" options={[['newest', 'Newest first'], ['deadline', 'Closing soonest'], ['company', 'Company A–Z']]} />
        </span>
      </div>

      {error ? (
        <Empty icon={Inbox} title="Can’t reach the server">{error}</Empty>
      ) : loading && !groups.length ? (
        <div className="card"><RowsSkeleton n={5} /></div>
      ) : visible.length === 0 ? (
        facets?.total || facets?.ended ? (
          <Empty icon={Search} title={`No ${c.noun} match`} action={<button className="btn dark" onClick={onReset}>Reset filters</button>}>Try another role, fewer languages, or a wider location.</Empty>
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

export default Listings;
