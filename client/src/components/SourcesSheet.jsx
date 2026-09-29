import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Globe, ShieldCheck, Users } from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const TRUST_ICON = { company: ShieldCheck, board: Globe, community: Users };

export default function SourcesSheet({ open, onOpenChange, meta, onChanged }) {
  const [blocked, setBlocked] = useState([]);
  useEffect(() => {
    if (open) api.blocked().then(setBlocked).catch(() => {});
  }, [open, meta?.blockedCompanies]);

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
        </div>
      </SheetContent>
    </Sheet>
  );
}
