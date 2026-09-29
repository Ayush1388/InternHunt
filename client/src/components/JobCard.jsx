import { ArrowUpRight, Bookmark, BookmarkCheck, Flag, Globe, MapPin, MoreHorizontal, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import { LABELS, timeAgo } from '@/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CompanyAvatar from '@/components/CompanyAvatar';

export function placeOf(job) {
  return job.locTag === 'india_onsite' ? job.city || 'India' : LABELS.loc[job.locTag];
}

export function warningsOf(job) {
  return [
    ...(job.companyNoReply > 0 && job.status !== 'no_reply'
      ? [`${job.company} didn't reply to ${job.companyNoReply === 1 ? 'an application' : `${job.companyNoReply} applications`} before`]
      : []),
    ...(job.flags || []).map((f) => LABELS.flags[f]).filter(Boolean),
  ];
}

export function LevelBadge({ level }) {
  if (level === 'intern') return <Badge>Internship</Badge>;
  if (level === 'entry') return <Badge variant="secondary">Entry-level</Badge>;
  return <Badge variant="outline" className="border-dashed text-muted-foreground">Level not stated</Badge>;
}

export function TrustMark({ job, withLabel = false }) {
  const t = LABELS.trust[job.trust] || LABELS.trust.board;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1 text-xs', job.trust === 'company' ? 'text-foreground' : 'text-muted-foreground')}>
          {job.trust === 'company' ? <ShieldCheck className="size-3.5" /> : <Globe className="size-3.5" />}
          {withLabel ? t.label : LABELS.source[job.source] || job.source}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t.label} · {t.hint}</TooltipContent>
    </Tooltip>
  );
}

export default function JobCard({ job, onOpen, onTrack, onReport, onApply, className, style }) {
  const isNew = job.firstSeen && Date.now() - Date.parse(job.firstSeen) < 86400000;
  const warnings = warningsOf(job);
  const saved = Boolean(job.status);

  return (
    <li
      className={cn(
        'group surface lift relative flex cursor-pointer gap-4 rounded-xl border bg-card p-4 hover:border-foreground/20 sm:p-5',
        !job.isActive && 'opacity-60',
        className
      )}
      style={style}
      onClick={() => onOpen(job)}
    >
      <CompanyAvatar name={job.company} className="mt-0.5 size-9 sm:size-10" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight sm:truncate">
              {isNew && <span className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full bg-foreground align-middle" aria-label="New" />}
              {job.title}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground sm:flex-nowrap">
              <span className="truncate font-medium text-foreground/80">{job.company}</span>
              <span className="hidden text-muted-foreground/50 sm:inline">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                {job.locTag === 'india_onsite' ? <MapPin className="size-3.5 shrink-0" /> : <Globe className="size-3.5 shrink-0" />}
                <span className="truncate">{placeOf(job)}</span>
              </span>
            </p>
          </div>
          <span className="hidden shrink-0 pt-0.5 text-xs tabular text-muted-foreground sm:inline">{timeAgo(job.postedAt || job.firstSeen)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <LevelBadge level={job.level} />
          <Badge variant="muted">{LABELS.category[job.category]}</Badge>
          {job.salary && (
            <Badge variant="outline" className="font-normal">
              <Wallet /> {job.salary}
            </Badge>
          )}
          {!job.isActive && <Badge variant="outline">No longer listed</Badge>}
          {warnings.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
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
          <span className="ml-auto text-xs tabular text-muted-foreground sm:hidden">{timeAgo(job.postedAt || job.firstSeen)}</span>
          <span className="ml-auto hidden sm:inline-flex">
            <TrustMark job={job} />
          </span>
        </div>
      </div>

      <div className="-mr-1.5 -mt-1 flex shrink-0 flex-col items-end gap-0.5 sm:mt-0 sm:mr-0 sm:flex-row sm:items-start sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={saved}
              aria-label={saved ? LABELS.status[job.status] : 'Save'}
              onClick={() => onTrack(job, saved ? null : 'saved')}
            >
              {saved ? <BookmarkCheck className="fill-current" /> : <Bookmark />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saved ? `${LABELS.status[job.status]} — click to remove` : 'Save'}</TooltipContent>
        </Tooltip>
        <Button size="sm" className="hidden sm:inline-flex" disabled={!job.isActive && !job.status} onClick={() => onApply(job)}>
          Apply <ArrowUpRight />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem className="sm:hidden" onSelect={() => onApply(job)}>
              <ArrowUpRight /> Apply on company site
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
