import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarClock, CircleHelp, IndianRupee, Infinity as InfinityIcon, Landmark, RefreshCw, Users } from 'lucide-react';
import { api, timeAgo } from '@/api';
import { daysUntil, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/Browse';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Accepting now' },
  { id: 'closed', label: 'Closed' },
  { id: 'unknown', label: 'Not confirmed' },
];

function StatusPill({ p }) {
  if (p.status === 'open') {
    const d = p.deadline ? daysUntil(p.deadline) : null;
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Open
        </span>
        {p.deadline && (
          <span className="text-xs text-muted-foreground">
            {p.estimated ? 'usually until' : 'until'}{' '}
            <span className={cn('font-semibold tabular', d <= 7 ? 'text-urgent' : 'text-foreground')}>{shortDate(p.deadline)}</span>
          </span>
        )}
      </div>
    );
  }
  if (p.status === 'rolling') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <InfinityIcon className="size-3.5" /> Open all year
      </span>
    );
  }
  if (p.status === 'closed') {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Closed</span>
        {p.opensOn && <span className="text-xs text-muted-foreground">reopens {shortDate(p.opensOn)}</span>}
      </div>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <CircleHelp className="size-3.5" /> Not confirmed
    </span>
  );
}

function statusLine(p) {
  if (p.status === 'open') return p.deadline ? null : 'The official page says applications are open.';
  if (p.status === 'closed') return p.endedOn ? `Last round ended ${shortDate(p.endedOn)}.` : 'The official page says applications are closed.';
  if (p.status === 'unknown') return "The official page doesn't state whether applications are open right now — check it before applying.";
  return null;
}

function ProgramCard({ p, i }) {
  const line = statusLine(p);
  return (
    <li
      className="surface lift group flex flex-col rounded-2xl border bg-card p-5 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both hover:border-primary/30"
      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
            <Landmark className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug tracking-tight">{p.name}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{p.org}</p>
          </div>
        </div>
        <StatusPill p={p} />
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p className="flex gap-2 text-foreground/80">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {p.window}
        </p>
        {p.stipend && (
          <p className="flex gap-2 text-foreground/80">
            <IndianRupee className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {p.stipend}
          </p>
        )}
        {p.eligibility && (
          <p className="flex gap-2 text-foreground/80">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {p.eligibility}
          </p>
        )}
      </div>

      {p.note && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.note}</p>}
      {line && <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{line}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-xs text-muted-foreground">
          {p.checkedAt ? `Page checked ${timeAgo(p.checkedAt)}` : p.watch ? 'Not checked yet' : 'Check on the site'}
        </span>
        <Button asChild size="sm" variant={p.status === 'open' || p.status === 'rolling' ? 'default' : 'outline'}>
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            Official page <ArrowUpRight />
          </a>
        </Button>
      </div>
    </li>
  );
}

export default function Government() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => {
    setError('');
    api.government().then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <EmptyState title="Couldn't load programs" action={<Button variant="outline" onClick={load}><RefreshCw /> Retry</Button>}>{error}</EmptyState>;
  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    );
  }

  const groups = { open: ['open', 'rolling'], closed: ['closed'], unknown: ['unknown'] };
  const count = (id) => (id === 'all' ? data.programs.length : data.programs.filter((p) => groups[id].includes(p.status)).length);
  const shown = data.programs.filter((p) => filter === 'all' || groups[filter].includes(p.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all',
              filter === f.id ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
            )}
          >
            {f.id === 'open' && <span className="size-1.5 rounded-full bg-success" />}
            {f.label} <span className="tabular opacity-70">{count(f.id)}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Nothing here right now">Try another filter.</EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((p, i) => (
            <ProgramCard key={p.id} p={p} i={i} />
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Only official government pages are listed. Status comes from what each page says (checked about daily); where a page
        gives no date, the program's usual schedule is shown. Always confirm on the official page — no government internship asks for a fee.
      </p>
    </div>
  );
}
