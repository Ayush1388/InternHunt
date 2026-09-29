import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, CalendarClock, CircleCheck, Clock, Code2, Flag, GraduationCap, MapPin, TriangleAlert, Wallet } from 'lucide-react';
import { api, LABELS, timeAgo } from '@/api';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CompanyAvatar from '@/components/CompanyAvatar';
import { ExpChip, ProgramChip, RoleChip, TrustMark, placeOf, warningsOf } from '@/components/JobCard';
import { ROLE } from '@/lib/roles';
import { deadlineInfo, shortDate } from '@/lib/format';
import { parseDescription } from '@/lib/description';
import { cn } from '@/lib/utils';

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

function DeadlineBanner({ job }) {
  const d = deadlineInfo(job);
  const tone = {
    urgent: 'border-urgent/30 bg-urgent/5',
    open: 'border-success/30 bg-success/5',
    rolling: 'border-success/30 bg-success/5',
    ended: 'border-border bg-muted/40',
    none: 'border-border bg-muted/30',
  }[d.tone];
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-3.5', tone)}>
      <CalendarClock className={cn('size-5 shrink-0', d.tone === 'urgent' ? 'text-urgent' : d.tone === 'ended' || d.tone === 'none' ? 'text-muted-foreground' : 'text-success')} />
      <div className="min-w-0 text-sm">
        {d.tone === 'urgent' || d.tone === 'open' ? (
          <>
            <div>
              {d.estimated ? 'Usual last date' : 'Last date to apply'}:{' '}
              <span className={cn('font-semibold', d.tone === 'urgent' && 'text-urgent')}>{shortDate(d.date, true)}</span>
              {d.left && <span className="text-muted-foreground"> · {d.left}</span>}
            </div>
            {d.estimated && <div className="text-xs text-muted-foreground">From the program's usual schedule — confirm on the official page.</div>}
          </>
        ) : d.tone === 'ended' ? (
          <div>
            <span className="font-medium">Applications closed.</span>{' '}
            <span className="text-muted-foreground">{d.date ? `${d.label}.` : 'No longer listed by the company.'}</span>
          </div>
        ) : d.tone === 'rolling' ? (
          <div><span className="font-medium text-success">Open all year</span> <span className="text-muted-foreground">— rolling applications.</span></div>
        ) : (
          <div>
            <span className="font-medium">Open now</span>{' '}
            <span className="text-muted-foreground">· the company hasn't published a last date, so apply soon.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Description({ text }) {
  const sections = parseDescription(text || '');
  if (!sections.length) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        The company didn't include a description in its listing. Open the posting to read the full details.
      </p>
    );
  }
  const reqs = sections.filter((s) => s.isRequirements);
  const rest = sections.filter((s) => !s.isRequirements);
  return (
    <div className="space-y-5">
      {reqs.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <CircleCheck className="size-4" /> Requirements
          </h4>
          {reqs.map((s) => (
            <Block key={s.title} section={s} showTitle={reqs.length > 1} />
          ))}
        </div>
      )}
      {rest.map((s, i) => (
        <div key={`${s.title}-${i}`}>
          {s.title ? <h4 className="mb-2 text-sm font-semibold">{s.title}</h4> : i === 0 && <h4 className="mb-2 text-sm font-semibold">About the role</h4>}
          <Block section={s} />
        </div>
      ))}
    </div>
  );
}

function Block({ section, showTitle = false }) {
  const bullets = section.lines.length > 1 && section.lines.every((l) => l.length < 260);
  return (
    <div className={cn(showTitle && 'mt-2 first:mt-0')}>
      {showTitle && <div className="mb-1 text-xs font-medium text-foreground/80">{section.title}</div>}
      {bullets ? (
        <ul className="space-y-1.5">
          {section.lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/80">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2 text-sm leading-relaxed text-foreground/80">
          {section.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobSheet({ job, open, onOpenChange, onTrack, onReport, onApply }) {
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!job) return;
    setDetail(null);
    setNotes(job.notes || '');
    api.job(job.id).then(setDetail).catch(() => setDetail({ description: 'Could not load the description.' }));
  }, [job?.id]);

  if (!job) return null;
  const warnings = warningsOf(job);
  const saved = Boolean(job.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="border-b p-6">
          <div className="flex items-start gap-4 pr-6">
            <CompanyAvatar name={job.company} className="size-12 text-sm" />
            <div className="min-w-0">
              <SheetTitle className="text-lg leading-snug tracking-tight">{job.title}</SheetTitle>
              <SheetDescription className="mt-1">{job.company}</SheetDescription>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <RoleChip category={job.category} />
                <ExpChip job={job} />
                <ProgramChip job={job} />
                <TrustMark job={job} withLabel />
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
          <DeadlineBanner job={job} />

          <div className="mt-5 grid grid-cols-2 gap-4">
            <Fact icon={MapPin} label="Where">{job.locations || placeOf(job)}</Fact>
            <Fact icon={GraduationCap} label="Experience">
              {job.level === 'intern' ? 'Internship' : job.minYears != null ? `${job.minYears}+ years` : LABELS.exp[job.exp]}
            </Fact>
            {!job.isProgram && <Fact icon={Clock} label="Posted">{timeAgo(job.postedAt || job.firstSeen) || '—'}</Fact>}
            <Fact icon={Code2} label="Role">{ROLE[job.category]?.label || job.category}</Fact>
            {job.salary && <Fact icon={Wallet} label="Pay">{job.salary}</Fact>}
          </div>

          {(detail?.languages || job.languages)?.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Languages</span>
              {(detail?.languages || job.languages).map((l) => (
                <span key={l} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">{l}</span>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mt-5 space-y-1.5 rounded-xl border border-warning/40 bg-warning/5 p-3">
              {warnings.map((w) => (
                <p key={w} className="flex items-center gap-2 text-sm text-foreground/80">
                  <TriangleAlert className="size-4 shrink-0 text-warning" /> {w}
                </p>
              ))}
            </div>
          )}

          <Separator className="my-5" />

          {detail ? (
            <Description text={detail.description} />
          ) : (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-muted-foreground">Loading the full description…</p>
              {[...Array(7)].map((_, i) => (
                <Skeleton key={i} className="h-3.5" style={{ width: `${95 - ((i * 13) % 35)}%` }} />
              ))}
            </div>
          )}

          {saved && (
            <>
              <Separator className="my-5" />
              <h4 className="mb-2 text-sm font-semibold">Your notes</h4>
              <Textarea
                placeholder="Referral, OA date, interview round…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (job.notes || '') && onTrack(job, job.status, notes)}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t bg-background/80 p-4 backdrop-blur">
          <Button className="flex-1" size="lg" disabled={!job.isActive && !job.status} onClick={() => onApply(job)}>
            {job.isProgram ? 'Open official page' : 'Apply on company site'} <ArrowUpRight />
          </Button>
          {saved ? (
            <Select value={job.status} onValueChange={(v) => onTrack(job, v)}>
              <SelectTrigger className="h-10 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABELS.status).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button variant="outline" size="lg" onClick={() => onTrack(job, 'saved')}>
              <Bookmark /> Save
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Report">
                <Flag />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {Object.entries(LABELS.reportReasons).map(([reason, label]) => (
                <DropdownMenuItem key={reason} onSelect={() => onReport(job, reason)}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetContent>
    </Sheet>
  );
}
