import { ArrowUpRight, Bookmark, BookmarkCheck, Flag, Globe, MapPin, MoreHorizontal, ShieldCheck, Sparkles, TriangleAlert, Wallet } from 'lucide-react';
import { LABELS, timeAgo } from '@/api';
import { ROLE } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CompanyAvatar from '@/components/CompanyAvatar';
import Deadline from '@/components/Deadline';

export function placeOf(job) {
  return job.locTag === 'india_onsite' ? job.city || 'India' : LABELS.loc[job.locTag];
}

export function warningsOf(job) {
  return [
    ...(job.companyNoReply > 0 && job.status !== 'no_reply'
      ? [`${job.company} didn't reply to ${job.companyNoReply === 1 ? 'an application' : `${job.companyNoReply} applications`} before`]
      : []),
    ...(job.flags || []).filter((f) => f !== 'deadline_estimated').map((f) => LABELS.flags[f]).filter(Boolean),
  ];
}

export function RoleChip({ category, className }) {
  const r = ROLE[category] || ROLE.software;
  const Icon = r.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', r.tint, className)}>
      <Icon className="size-3.5" /> {r.short}
    </span>
  );
}

export function ExpChip({ job }) {
  if (job.level === 'intern') return <Badge variant="secondary">Internship</Badge>;
  return (
    <Badge variant="outline" className={cn('font-normal', job.exp === 0 && 'border-success/40 text-success')}>
      {LABELS.exp[job.exp] || 'No experience'}
    </Badge>
  );
}

export function ProgramChip({ job }) {
  if (!job.isProgram) return null;
  return (
    <Badge variant="outline" className="gap-1 border-primary/30 font-normal text-primary">
      <Sparkles /> {job.employmentType || 'Program'}
    </Badge>
  );
}

export function TrustMark({ job, withLabel = false }) {
  const t = LABELS.trust[job.trust] || LABELS.trust.board;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1 text-xs', job.trust === 'company' ? 'text-foreground/80' : 'text-muted-foreground')}>
          {job.trust === 'company' ? <ShieldCheck className="size-3.5 text-success" /> : <Globe className="size-3.5" />}
          {withLabel ? t.label : LABELS.source[job.source] || job.source}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t.label} · {t.hint}</TooltipContent>
    </Tooltip>
  );
}

/** First sentence-ish of the description, skipping boilerplate headings. */
function preview(text = '') {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 24 && !/^(about (us|the company)|who we are|our company)/i.test(l));
  return line || text.trim();
}

export default function JobCard({ job, onOpen, onTrack, onReport, onApply, className, style }) {
  const isNew = !job.isProgram && job.firstSeen && Date.now() - Date.parse(job.firstSeen) < 86400000;
  const warnings = warningsOf(job);
  const saved = Boolean(job.status);
  const snippet = preview(job.snippet);

  return (
    <li
      className={cn(
        'group surface lift relative flex cursor-pointer gap-4 overflow-hidden rounded-xl border bg-card p-4 hover:border-foreground/20 sm:p-5',
        className
      )}
      style={style}
      onClick={() => onOpen(job)}
    >
      <CompanyAvatar name={job.company} className="mt-0.5 size-10 sm:size-11" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary sm:text-base">
              {job.title}
              {isNew && (
                <span className="ml-2 inline-flex -translate-y-px items-center rounded-full bg-primary/10 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-primary">
                  New
                </span>
              )}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span className="truncate font-medium text-foreground/80">{job.company}</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                {job.locTag === 'india_onsite' ? <MapPin className="size-3.5 shrink-0" /> : <Globe className="size-3.5 shrink-0" />}
                <span className="truncate">{placeOf(job)}</span>
              </span>
              {!job.isProgram && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular">{timeAgo(job.postedAt || job.firstSeen)}</span>
                </>
              )}
            </p>
          </div>
          <Deadline job={job} className="hidden shrink-0 sm:block" />
        </div>

        {snippet && <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{snippet}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <RoleChip category={job.category} />
          <ExpChip job={job} />
          <ProgramChip job={job} />
          {job.languages?.slice(0, 3).map((l) => (
            <span key={l} className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">{l}</span>
          ))}
          {job.languages?.length > 3 && <span className="text-[11px] text-muted-foreground">+{job.languages.length - 3}</span>}
          {job.salary && (
            <Badge variant="outline" className="max-w-56 font-normal">
              <Wallet /> <span className="truncate">{job.salary}</span>
            </Badge>
          )}
          {warnings.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 px-1.5 py-0.5 text-xs text-warning">
                  <TriangleAlert className="size-3" /> {warnings.length}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
          <Deadline job={job} compact className="ml-auto sm:hidden" />
          <span className="ml-auto hidden sm:inline-flex">
            <TrustMark job={job} />
          </span>
        </div>
      </div>

      <div className="-mr-1.5 -mt-1 flex shrink-0 flex-col items-end gap-0.5 sm:mt-0 sm:mr-0 sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={saved}
              aria-label={saved ? LABELS.status[job.status] : 'Save'}
              onClick={() => onTrack(job, saved ? null : 'saved')}
              className={cn(saved && 'text-primary')}
            >
              {saved ? <BookmarkCheck className="fill-current" /> : <Bookmark />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saved ? `${LABELS.status[job.status]} — click to remove` : 'Save'}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => onApply(job)}>
              <ArrowUpRight /> {job.isProgram ? 'Open official page' : 'Apply on company site'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpen(job)}>View details</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Report</DropdownMenuLabel>
            {Object.entries(LABELS.reportReasons).map(([reason, label]) => (
              <DropdownMenuItem key={reason} variant={reason === 'scam' || reason === 'fake' ? 'destructive' : 'default'} onSelect={() => onReport(job, reason)}>
                <Flag /> {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
