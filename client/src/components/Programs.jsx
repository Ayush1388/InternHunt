import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleDot, Clock, ExternalLink, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api, timeAgo } from '@/api';
import { daysUntil, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'open_source', label: 'Open source' },
  { id: 'government', label: 'Government' },
  { id: 'company_program', label: 'Company programs' },
  { id: 'fresher_drive', label: 'Fresher drives' },
  { id: 'research', label: 'Research' },
  { id: 'added', label: 'Added by you' },
];

function rank(p) {
  if (p.deadline) return 0;
  if (p.status === 'open') return 1;
  if (p.changedAt) return 2;
  if (p.status === 'closed') return 4;
  return 3;
}

function Status({ p }) {
  const out = [];
  if (p.deadline) {
    const d = daysUntil(p.deadline);
    out.push(
      <Badge key="d" variant={d <= 7 ? 'default' : 'secondary'} className="gap-1">
        <Clock /> Apply by {shortDate(p.deadline)}{d <= 7 ? ` · ${d <= 0 ? 'today' : `${d}d left`}` : ''}
      </Badge>
    );
  }
  if (p.status === 'open' && !p.deadline) out.push(<Badge key="o" variant="secondary" className="gap-1"><CircleDot /> Looks open</Badge>);
  if (p.status === 'closed') out.push(<Badge key="c" variant="outline" className="text-muted-foreground">Page says closed</Badge>);
  if (p.changedAt && Date.now() - Date.parse(p.changedAt) < 14 * 86400000)
    out.push(<Badge key="u" variant="outline" className="font-normal">Updated {timeAgo(p.changedAt)}</Badge>);
  if (!p.watch) out.push(<Badge key="w" variant="outline" className="font-normal text-muted-foreground">Check on site</Badge>);
  else if (p.error) out.push(<Badge key="e" variant="outline" className="font-normal text-muted-foreground">Couldn't read page</Badge>);
  return out.length ? <div className="flex flex-wrap gap-1.5">{out}</div> : null;
}

function LiveItems({ items }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="text-sm text-muted-foreground">No projects accepting applications right now.</p>;
  const shown = all ? items : items.slice(0, 5);
  return (
    <div className="rounded-lg border bg-background/40">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-medium">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/60" />
            <span className="relative inline-flex size-2 rounded-full bg-foreground" />
          </span>
          {items.length} accepting applications now
        </span>
      </div>
      <ul className="divide-y">
        {shown.map((it) => (
          <li key={it.id}>
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium group-hover:underline">{it.title}</div>
                <div className="truncate text-xs text-muted-foreground">{[it.org, it.skills?.join(', ')].filter(Boolean).join(' · ')}</div>
              </div>
              {it.deadline && <span className="shrink-0 text-xs tabular text-muted-foreground">by {shortDate(it.deadline)}</span>}
            </a>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <button className="w-full border-t px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function ProgramCard({ p, onRemove }) {
  return (
    <article className="surface lift flex flex-col gap-4 rounded-xl border bg-card p-5 hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug tracking-tight">{p.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{p.org}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            Official page <ArrowUpRight />
          </a>
        </Button>
      </div>
      <Status p={p} />
      <dl className="grid gap-3 text-sm sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
        {[
          ['When', p.window],
          ['Stipend', p.stipend],
          ['Who', p.eligibility],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-foreground/85">{v}</dd>
          </div>
        ))}
      </dl>
      {p.note && <p className="text-sm text-muted-foreground">{p.note}</p>}
      {p.items && <LiveItems items={p.items} />}
      {p.userAdded && (
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => onRemove(p.id)}>
          <Trash2 /> Remove
        </Button>
      )}
    </article>
  );
}

function CheckDirectly({ list }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const filtered = list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = {};
  for (const c of filtered) (groups[c.group || 'Other'] ||= []).push(c);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Careers pages to check directly</h2>
          <p className="text-sm text-muted-foreground">{list.length} companies run their own careers sites with no public feed.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Find a company…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {Object.entries(groups)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([group, items]) => {
            const isOpen = Boolean(q) || open[group];
            return (
              <div key={group}>
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/40"
                  onClick={() => setOpen((o) => ({ ...o, [group]: !o[group] }))}
                >
                  <span>
                    {group} <span className="tabular text-muted-foreground">{items.length}</span>
                  </span>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <ul className="grid gap-x-6 gap-y-1 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <li key={c.name}>
                          <a
                            href={c.careers}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex items-center gap-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {c.name} <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                          </a>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}

export default function Programs({ version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('all');
  const [checking, setChecking] = useState(false);

  const load = () => api.programs().then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [version]);

  const counts = useMemo(() => {
    const c = { all: data?.programs.length || 0 };
    for (const p of data?.programs || []) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [data]);

  async function checkNow() {
    setChecking(true);
    await api.checkPrograms().catch(() => {});
    setTimeout(() => load().finally(() => setChecking(false)), 15000);
  }

  if (error) return <p className="text-sm text-muted-foreground">Couldn't load programs: {error}</p>;
  if (!data)
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    );

  const items = data.programs.filter((p) => cat === 'all' || p.category === cat).sort((a, b) => rank(a) - rank(b));
  const lastChecked = data.programs.map((p) => p.checkedAt).filter(Boolean).sort().pop();

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={cat} onValueChange={setCat}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              {CATEGORIES.filter((c) => counts[c.id]).map((c) => (
                <TabsTrigger key={c.id} value={c.id}>
                  {c.label} <span className="tabular text-muted-foreground">{counts[c.id]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="sm" onClick={checkNow} disabled={checking} className="text-muted-foreground">
            <RefreshCw className={cn(checking && 'animate-spin')} />
            {lastChecked ? `Checked ${timeAgo(lastChecked)}` : 'Check pages'}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <ProgramCard key={p.id} p={p} onRemove={(id) => api.removeProgram(id).then(load)} />
          ))}
        </div>
      </div>

      {data.checkDirectly.length > 0 && <CheckDirectly list={data.checkDirectly} />}
    </div>
  );
}
