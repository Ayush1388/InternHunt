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

  // Wellfound-style box: company header, then the role with its facts, actions on the right.
  return (
    <li
      className={cn('group surface lift cursor-pointer rounded-lg border bg-card hover:border-foreground/25', className)}
      style={style}
      onClick={() => onOpen(job)}
    >
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <CompanyAvatar name={job.company} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{job.company}</div>
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <TrustMark job={job} withLabel />
          </div>
        </div>
        <Deadline job={job} className="hidden shrink-0 sm:block" />
      </div>

      <div className="mx-4 mt-3 mb-4 flex gap-4 rounded-md border bg-background/60 p-3 sm:mx-5 sm:p-4">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">
            {job.title}
            {isNew && (
              <span className="ml-2 inline-flex -translate-y-px items-center rounded-sm border px-1 align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                New
              </span>
            )}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              {job.locTag === 'india_onsite' ? <MapPin className="size-3.5 shrink-0" /> : <Globe className="size-3.5 shrink-0" />}
              <span className="truncate">{placeOf(job)}</span>
            </span>
            {job.salary && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex max-w-56 items-center gap-1 truncate"><Wallet className="size-3.5 shrink-0" /> {job.salary}</span>
              </>
            )}
            {!job.isProgram && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular">{timeAgo(job.postedAt || job.firstSeen)}</span>
              </>
            )}
          </p>

          {snippet && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{snippet}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <RoleChip category={job.category} />
            <ExpChip job={job} />
            <ProgramChip job={job} />
            {job.languages?.slice(0, 3).map((l) => (
              <span key={l} className="rounded-sm border px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">{l}</span>
            ))}
            {job.languages?.length > 3 && <span className="text-[11px] text-muted-foreground">+{job.languages.length - 3}</span>}
            {warnings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 px-1.5 py-0.5 text-xs text-warning">
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
          </div>
        </div>

      <div className="flex shrink-0 flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={saved}
            onClick={() => onTrack(job, saved ? null : 'saved')}
            className="hidden sm:inline-flex"
          >
            {saved ? <BookmarkCheck className="fill-current" /> : <Bookmark />}
            {saved ? LABELS.status[job.status] : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={saved}
            aria-label={saved ? LABELS.status[job.status] : 'Save'}
            onClick={() => onTrack(job, saved ? null : 'saved')}
            className="sm:hidden"
          >
            {saved ? <BookmarkCheck className="fill-current" /> : <Bookmark />}
          </Button>
          <Button size="sm" onClick={() => onApply(job)} className="hidden sm:inline-flex">
            Apply <ArrowUpRight />
          </Button>
        </div>
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
      </div>
    </li>
  );
}
