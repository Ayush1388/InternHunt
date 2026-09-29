import { useEffect, useState } from 'react';
import { ChevronDown, CircleCheck, CircleX, ExternalLink, Globe, Search, ShieldCheck, Users } from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const TRUST_ICON = { company: ShieldCheck, board: Globe, community: Users };

// Companies with their own careers sites and no public feed: link to them so nothing is silently missing.
function CheckDirectly({ list }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});
  const filtered = list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = {};
  for (const c of filtered) (groups[c.group || 'Other'] ||= []).push(c);
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Careers pages to check directly</h3>
        <p className="text-xs text-muted-foreground">{list.length} companies run their own careers sites with no public feed.</p>
      </div>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 pl-9" placeholder="Find a company…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="divide-y overflow-hidden rounded-lg border">
        {Object.entries(groups)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([group, items]) => {
            const isOpen = Boolean(q) || open[group];
            return (
              <div key={group}>
                <button
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent/40"
                  onClick={() => setOpen((o) => ({ ...o, [group]: !o[group] }))}
                >
                  <span>{group} <span className="tabular text-muted-foreground">{items.length}</span></span>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <ul className="grid grid-cols-2 gap-x-4 px-3 pb-3">
                    {items
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <li key={c.name}>
                          <a href={c.careers} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1.5 py-1 text-sm text-muted-foreground hover:text-foreground">
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
    </div>
  );
}

export default function SourcesSheet({ open, onOpenChange, meta, onChanged }) {
  const [blocked, setBlocked] = useState([]);
  const [checkDirectly, setCheckDirectly] = useState([]);
  useEffect(() => {
    if (open) api.blocked().then(setBlocked).catch(() => {});
  }, [open, meta?.blockedCompanies]);
  useEffect(() => {
    if (open) api.programs().then((r) => setCheckDirectly(r.checkDirectly || [])).catch(() => {});
  }, [open]);

  const sources = meta?.sources || [];
  const failed = sources.filter((s) => !s.ok);
  const filtered = Object.entries(meta?.lastSummary?.blocked || {}).sort((a, b) => b[1] - a[1]);

  async function unblock(key) {
    await api.unblock(key);
    setBlocked((l) => l.filter((c) => c.key !== key));
    onChanged?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Sources</SheetTitle>
          <SheetDescription>
            {sources.length ? `${sources.length - failed.length} of ${sources.length} boards fetched` : 'No refresh yet'}
            {meta?.lastRefresh ? ` · ${timeAgo(meta.lastRefresh)}` : ''} · every {meta?.refreshHours || 6}h
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 pb-8">
          <div className="space-y-3">
            {Object.entries(LABELS.trust).map(([k, v]) => {
              const Icon = TRUST_ICON[k];
              return (
                <div key={k} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{v.label}</div>
                    <div className="text-sm text-muted-foreground">{v.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtered.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Filtered out last refresh</h4>
                <ul className="space-y-1.5 text-sm">
                  {filtered.map(([reason, n]) => (
                    <li key={reason} className="flex justify-between gap-4 text-muted-foreground">
                      <span>{reason}</span>
                      <span className="tabular text-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {blocked.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Companies you blocked</h4>
                <ul className="space-y-1">
                  {blocked.map((c) => (
                    <li key={c.key} className="flex items-center justify-between text-sm">
                      <span>
                        {c.company} <span className="text-muted-foreground">· {c.reason}</span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => unblock(c.key)}>Unblock</Button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {sources.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-sm font-semibold">Boards</h4>
                <ul className="divide-y rounded-lg border">
                  {sources.map((s) => (
                    <li key={s.key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                      {s.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <span className="truncate font-medium">{s.label}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{LABELS.source[s.source] || s.source}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.ok ? `${s.kept} relevant of ${s.fetched}${s.blocked ? ` · ${s.blocked} blocked` : ''}` : s.error}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {checkDirectly.length > 0 && (
            <>
              <Separator />
              <CheckDirectly list={checkDirectly} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
