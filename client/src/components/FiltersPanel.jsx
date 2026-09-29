import { RotateCcw } from 'lucide-react';
import { LABELS } from '@/api';
import { EXPERIENCE, LANGUAGES, DEADLINES } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const Count = ({ n }) => (n ? <span className="tabular opacity-60">{n}</span> : null);

function Section({ title, children, hint }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const ANY = '__any';

export default function FiltersPanel({ kind, filters, setFilters, facets, onReset }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const deadlineCount = {
    week: facets?.closingThisWeek,
    month: facets?.closingThisMonth,
    has: facets?.withDeadline,
    ended: facets?.ended,
    '': facets?.total,
  };
  const langs = [...LANGUAGES].sort((a, b) => (facets?.byLanguage?.[b] || 0) - (facets?.byLanguage?.[a] || 0));

  return (
    <div className="space-y-6">
      <Section title="Show">
        <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
          {[
            ['', 'All'],
            ['roles', 'Companies'],
            ['programs', 'Programs'],
          ].map(([id, label]) => (
            <button
              key={id || 'all'}
              onClick={() => set({ type: id })}
              className={cn(
                'rounded-md px-2 py-1.5 text-xs font-medium transition-all',
                filters.type === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Last date to apply">
        <div className="space-y-0.5">
          {DEADLINES.map((d) => (
            <button
              key={d.id || 'open'}
              onClick={() => set({ deadline: d.id })}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                filters.deadline === d.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn('size-1.5 rounded-full', d.urgent ? 'bg-urgent' : d.id === 'ended' ? 'bg-muted-foreground/40' : 'bg-success')} />
                {d.label}
              </span>
              <Count n={deadlineCount[d.id]} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Experience asked">
        <ToggleGroup type="multiple" value={filters.exp} onValueChange={(v) => set({ exp: v })}>
          {EXPERIENCE.map((e) => (
            <ToggleGroupItem
              key={e.id}
              value={e.id}
              title={e.hint}
              className={cn(!facets?.byExp?.[e.id] && !filters.exp.includes(e.id) && 'opacity-50')}
            >
              {e.label} <Count n={facets?.byExp?.[e.id]} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Language">
        <ToggleGroup type="multiple" value={filters.lang} onValueChange={(v) => set({ lang: v })}>
          {langs.map((l) => (
            <ToggleGroupItem key={l} value={l} className={cn('font-mono', !facets?.byLanguage?.[l] && !filters.lang.includes(l) && 'opacity-50')}>
              {l} <Count n={facets?.byLanguage?.[l]} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Where">
        <ToggleGroup type="multiple" value={filters.loc} onValueChange={(v) => set({ loc: v })}>
          {['india_onsite', 'remote_india', 'remote_worldwide'].map((k) => (
            <ToggleGroupItem key={k} value={k}>
              {LABELS.loc[k]} <Count n={facets?.byLocation?.[k]} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {facets?.cities?.length > 0 && (
          <Select value={filters.city || ANY} onValueChange={(v) => set({ city: v === ANY ? '' : v })}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any city</SelectItem>
              {facets.cities.map((c) => (
                <SelectItem key={c.city} value={c.city}>{c.city} · {c.n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Section>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`companyOnly-${kind}`} className="font-normal leading-snug">Verified company pages only</Label>
          <Switch id={`companyOnly-${kind}`} checked={Boolean(filters.companyOnly)} onCheckedChange={(v) => set({ companyOnly: v })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`hideApplied-${kind}`} className="font-normal">Hide ones I've applied to</Label>
          <Switch id={`hideApplied-${kind}`} checked={filters.hideApplied} onCheckedChange={(v) => set({ hideApplied: v })} />
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
        <RotateCcw /> Reset filters
      </Button>
    </div>
  );
}
