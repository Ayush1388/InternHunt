import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, Briefcase, CalendarDays, Clock, Flag, GraduationCap, MapPin, TriangleAlert } from 'lucide-react';
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
import { LevelBadge, TrustMark, placeOf, warningsOf } from '@/components/JobCard';

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
                <LevelBadge level={job.level} />
                <TrustMark job={job} withLabel />
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <Fact icon={MapPin} label="Where">{job.locations || placeOf(job)}</Fact>
            <Fact icon={Briefcase} label="Role">{LABELS.category[job.category]}</Fact>
            <Fact icon={Clock} label="Posted">{timeAgo(job.postedAt || job.firstSeen) || '—'}</Fact>
            <Fact icon={GraduationCap} label="Experience">
              {job.minYears !== null && job.minYears !== undefined ? `${job.minYears}+ years` : 'Not stated'}
            </Fact>
            {job.salary && <Fact icon={CalendarDays} label="Pay">{job.salary}</Fact>}
          </div>

          {warnings.length > 0 && (
            <div className="mt-5 space-y-1.5 rounded-lg border border-dashed p-3">
              {warnings.map((w) => (
                <p key={w} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="size-4 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}

          <Separator className="my-5" />

          <h4 className="mb-2 text-sm font-semibold">About the role</h4>
          {detail ? (
            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {detail.description || 'No description provided — open the posting for details.'}
            </div>
          ) : (
            <div className="space-y-2">
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
            Apply on company site <ArrowUpRight />
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
