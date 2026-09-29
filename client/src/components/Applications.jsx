import { useEffect, useMemo, useState } from 'react';
import { BellOff, Flame, Minus, Plus, Send } from 'lucide-react';
import { api, LABELS, store, timeAgo } from '@/api';
import { istDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CompanyAvatar from '@/components/CompanyAvatar';
import { EmptyState, JobListSkeleton } from '@/components/Browse';

const ACTIVE = ['applied', 'interview', 'offer', 'rejected', 'no_reply'];
const NO_REPLY_DAYS = 21;

function Ring({ value, max, size = 132 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max ? value / max : 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="10" className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        className="stroke-foreground transition-[stroke-dashoffset] duration-700 ease-out"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
      />
    </svg>
  );
}

function computeMomentum(jobs) {
  const days = new Set(jobs.filter((j) => ACTIVE.includes(j.status) && j.trackedAt).map((j) => istDay(j.trackedAt)));
  const today = istDay(new Date().toISOString());
  const weekStart = (() => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`));
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
  })();
  const thisWeek = jobs.filter((j) => ACTIVE.includes(j.status) && j.trackedAt && istDay(j.trackedAt) >= weekStart).length;
  let streak = 0;
  let cursor = Date.parse(`${today}T00:00:00Z`);
  if (!days.has(today)) cursor -= 86400000; // today isn't over yet — count from yesterday
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak++;
    cursor -= 86400000;
  }
  const last14 = [...Array(14)].map((_, i) => {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { d, on: days.has(d) };
  });
  return { thisWeek, streak, last14, activeToday: days.has(today) };
}

function Stat({ label, value, sub }) {
  return (
    <div className="surface rounded-xl border bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Applications({ meta, version, onOpen, onTrack, onReport }) {
  const [all, setAll] = useState(null);
  const [status, setStatus] = useState('any');
  const [goal, setGoal] = useState(() => store.get('ih.weeklyGoal', 10));

  useEffect(() => {
    api
      .jobs({ tracked: 'any', limit: 100 })
      .then((r) => setAll(r.jobs))
      .catch(() => setAll([]));
  }, [version]);

  useEffect(() => store.set('ih.weeklyGoal', goal), [goal]);

  const momentum = useMemo(() => computeMomentum(all || []), [all]);
  const counts = meta?.trackedCounts || {};
  const list = (all || []).filter((j) => status === 'any' || j.status === status);
  const interviewRate = counts.applied || counts.interview ? Math.round(((counts.interview || 0) + (counts.offer || 0)) / Math.max(1, (counts.applied || 0) + (counts.interview || 0) + (counts.offer || 0) + (counts.rejected || 0) + (counts.no_reply || 0)) * 100) : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="surface flex items-center gap-6 rounded-xl border bg-card p-5 sm:p-6">
          <div className="relative shrink-0">
            <Ring value={momentum.thisWeek} max={goal} />
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-3xl font-semibold tabular tracking-tight">{momentum.thisWeek}</div>
                <div className="text-[11px] text-muted-foreground">of {goal} this week</div>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Weekly goal</div>
              <p className="text-sm text-muted-foreground">
                {momentum.thisWeek >= goal
                  ? 'Goal hit. Anything more is a bonus.'
                  : `${goal - momentum.thisWeek} more application${goal - momentum.thisWeek === 1 ? '' : 's'} to hit your goal.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label="Lower goal" onClick={() => setGoal((g) => Math.max(1, g - 1))}><Minus /></Button>
              <span className="w-20 whitespace-nowrap text-center text-sm tabular">{goal} / week</span>
              <Button variant="outline" size="icon-sm" aria-label="Raise goal" onClick={() => setGoal((g) => Math.min(100, g + 1))}><Plus /></Button>
            </div>
          </div>
        </div>

        <div className="surface rounded-xl border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className={cn('size-5', momentum.streak ? 'text-foreground' : 'text-muted-foreground')} />
              <span className="text-2xl font-semibold tabular tracking-tight">{momentum.streak}</span>
              <span className="text-sm text-muted-foreground">day streak</span>
            </div>
            <span className="text-xs text-muted-foreground">{momentum.activeToday ? 'Done for today' : 'Apply today to keep it'}</span>
          </div>
          <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
            {momentum.last14.map(({ d, on }) => (
              <div
                key={d}
                title={d}
                className={cn('aspect-square rounded-[5px] border transition-colors', on ? 'border-transparent bg-foreground' : 'bg-muted/60')}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>2 weeks ago</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Saved" value={counts.saved || 0} />
        <Stat label="Applied" value={(counts.applied || 0) + (counts.no_reply || 0)} sub={counts.no_reply ? `${counts.no_reply} no reply` : null} />
        <Stat label="Interviewing" value={counts.interview || 0} sub={interviewRate !== null ? `${interviewRate}% response rate` : null} />
        <Stat label="Offers" value={counts.offer || 0} />
      </div>

      <div>
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="any">All</TabsTrigger>
            {Object.entries(LABELS.status).map(([k, v]) => (
              <TabsTrigger key={k} value={k}>
                {v}
                {counts[k] ? <span className="tabular text-muted-foreground">{counts[k]}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4">
          {all === null ? (
            <JobListSkeleton rows={3} />
          ) : list.length === 0 ? (
            <EmptyState icon={Send} title={status === 'any' ? 'Nothing tracked yet' : `No ${LABELS.status[status].toLowerCase()} applications`}>
              Save roles from Browse, or hit Apply — you'll be asked if you applied, and it'll show up here.
            </EmptyState>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {list.map((job) => {
                const waiting = job.status === 'applied' && job.trackedAt ? Math.floor((Date.now() - Date.parse(job.trackedAt)) / 86400000) : 0;
                return (
                  <li key={job.id} className="flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-accent/40 sm:flex-nowrap">
                    <CompanyAvatar name={job.company} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(job)}>
                      <div className="truncate text-sm font-semibold tracking-tight">{job.title}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {job.company} · updated {timeAgo(job.trackedAt)}
                      </div>
                    </button>
                    {waiting >= NO_REPLY_DAYS && (
                      <Button variant="outline" size="sm" onClick={() => onReport(job, 'no_reply')}>
                        <BellOff /> No reply in {waiting}d
                      </Button>
                    )}
                    <Select value={job.status} onValueChange={(v) => onTrack(job, v).then?.(() => setAll((l) => l.map((x) => (x.id === job.id ? { ...x, status: v } : x))))}>
                      <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(LABELS.status).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
