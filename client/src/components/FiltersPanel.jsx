import { RotateCcw } from 'lucide-react';
import { LABELS } from '@/api';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

function Group({ title, labels, options, value, counts, onChange }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <ToggleGroup type="multiple" value={value} onValueChange={onChange}>
        {options.map((k) => (
          <ToggleGroupItem key={k} value={k}>
            {labels[k]}
            {counts?.[k] ? <span className="tabular opacity-60">{counts[k]}</span> : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const ANY = '__any';

export default function FiltersPanel({ filters, setFilters, meta, onReset }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <div className="space-y-6">
      <Group title="Role" labels={LABELS.category} options={['sde', 'web', 'data']} value={filters.category} counts={meta?.byCategory} onChange={(v) => set({ category: v })} />
      <Group title="Level" labels={LABELS.level} options={['intern', 'entry', 'unspecified']} value={filters.level} counts={meta?.byLevel} onChange={(v) => set({ level: v })} />
      <Group title="Where" labels={LABELS.loc} options={['india_onsite', 'remote_india', 'remote_worldwide']} value={filters.loc} counts={meta?.byLocation} onChange={(v) => set({ loc: v })} />

      {meta?.cities?.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">City</div>
          <Select value={filters.city || ANY} onValueChange={(v) => set({ city: v === ANY ? '' : v })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any city</SelectItem>
              {meta.cities.map((c) => (
                <SelectItem key={c.city} value={c.city}>{c.city} · {c.n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {meta?.bySource && Object.keys(meta.bySource).length > 1 && (
        <div className="space-y-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Source</div>
          <Select value={filters.source || ANY} onValueChange={(v) => set({ source: v === ANY ? '' : v })}>
            <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All sources</SelectItem>
              {Object.entries(meta.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => (
                  <SelectItem key={id} value={id}>{LABELS.source[id] || id} · {n}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="companyOnly" className="font-normal leading-snug">
            Company careers pages only
            {meta?.byTrust?.company ? <span className="tabular text-muted-foreground">{meta.byTrust.company}</span> : null}
          </Label>
          <Switch id="companyOnly" checked={Boolean(filters.companyOnly)} onCheckedChange={(v) => set({ companyOnly: v })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="hideApplied" className="font-normal">Hide jobs I've applied to</Label>
          <Switch id="hideApplied" checked={filters.hideApplied} onCheckedChange={(v) => set({ hideApplied: v })} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Nothing selected in a group means “any”. “Level not stated” covers titles like plain “Software Engineer” with no
        experience requirement found.
      </p>

      <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
        <RotateCcw /> Reset filters
      </Button>
    </div>
  );
}
