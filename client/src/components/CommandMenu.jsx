import { useEffect, useState } from 'react';
import { Briefcase, Globe, Landmark, Link2, ListChecks, MapPin, Moon, RefreshCw, Rows3, Sparkles, Sun } from 'lucide-react';
import { api } from '@/api';
import { useTheme } from '@/components/theme';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import CompanyAvatar from '@/components/CompanyAvatar';

// ⌘K: jump anywhere, apply a filter preset, or search jobs live.
export default function CommandMenu({ open, onOpenChange, go, applyPreset, onOpenJob, onAdd, onRefresh, onSources }) {
  const { resolved, setTheme } = useTheme();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      api
        .jobs({ q: q.trim(), limit: 6, level: 'intern,entry,unspecified' })
        .then((r) => setHits(r.jobs))
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const run = (fn) => () => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search roles, jump to a page, or run a command…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Roles">
            {hits.map((j) => (
              <CommandItem key={j.id} value={`${j.title} ${j.company} ${j.id}`} onSelect={run(() => onOpenJob(j))}>
                <CompanyAvatar name={j.company} className="size-6 rounded-md text-[9px]" />
                <span className="truncate">{j.title}</span>
                <span className="truncate text-muted-foreground">· {j.company}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          <CommandItem onSelect={run(() => go('browse'))}><Briefcase /> Browse roles<CommandShortcut>G B</CommandShortcut></CommandItem>
          <CommandItem onSelect={run(() => go('applications'))}><ListChecks /> My applications<CommandShortcut>G A</CommandShortcut></CommandItem>
          <CommandItem onSelect={run(() => go('programs'))}><Landmark /> Programs & drives<CommandShortcut>G P</CommandShortcut></CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick filters">
          <CommandItem onSelect={run(() => applyPreset({ level: ['intern'] }))}><Sparkles /> Internships only</CommandItem>
          <CommandItem onSelect={run(() => applyPreset({ level: ['entry'] }))}><Rows3 /> Entry-level only</CommandItem>
          <CommandItem onSelect={run(() => applyPreset({ loc: ['remote_india', 'remote_worldwide'] }))}><Globe /> Remote roles</CommandItem>
          <CommandItem onSelect={run(() => applyPreset({ category: ['data'] }))}><Sparkles /> Data / ML</CommandItem>
          <CommandItem onSelect={run(() => applyPreset({ city: 'Bengaluru', loc: ['india_onsite'] }))}><MapPin /> In Bengaluru</CommandItem>
          <CommandItem onSelect={run(() => applyPreset({ companyOnly: true }))}><Briefcase /> Company careers pages only</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onAdd)}><Link2 /> Add from link</CommandItem>
          <CommandItem onSelect={run(onRefresh)}><RefreshCw /> Refresh all sources</CommandItem>
          <CommandItem onSelect={run(onSources)}><Globe /> View sources</CommandItem>
          <CommandItem onSelect={run(() => setTheme(resolved === 'dark' ? 'light' : 'dark'))}>
            {resolved === 'dark' ? <Sun /> : <Moon />} Switch to {resolved === 'dark' ? 'light' : 'dark'} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
