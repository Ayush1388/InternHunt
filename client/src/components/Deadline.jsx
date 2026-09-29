import { CalendarClock, CalendarX2, Infinity as InfinityIcon } from 'lucide-react';
import { deadlineInfo } from '@/lib/format';
import { cn } from '@/lib/utils';

/** "Last date" block. Only the date itself turns red when it's within a week. */
export default function Deadline({ job, compact = false, className }) {
  const d = deadlineInfo(job);
  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs', d.tone === 'ended' ? 'text-muted-foreground' : 'text-foreground/80', className)}>
        {d.tone === 'ended' ? <CalendarX2 className="size-3.5" /> : d.tone === 'rolling' ? <InfinityIcon className="size-3.5" /> : <CalendarClock className="size-3.5" />}
        {d.tone === 'urgent' || d.tone === 'open' ? (
          <>
            {d.estimated ? 'Usually closes' : 'Closes'}
            <span className={cn('font-medium tabular', d.tone === 'urgent' && 'font-semibold text-urgent')}>{d.short}</span>
          </>
        ) : (
          d.label
        )}
      </span>
    );
  }
  return (
    <div className={cn('text-right', className)}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {d.tone === 'ended' ? 'Status' : d.estimated ? 'Usual last date' : 'Last date'}
      </div>
      {d.tone === 'urgent' || d.tone === 'open' ? (
        <>
          <div className={cn('mt-0.5 text-sm font-semibold tabular', d.tone === 'urgent' ? 'text-urgent' : 'text-foreground')}>{d.short}</div>
          {d.left && <div className="text-[11px] text-muted-foreground">{d.left}</div>}
        </>
      ) : (
        <div className={cn('mt-0.5 text-sm', d.tone === 'ended' ? 'text-muted-foreground' : d.tone === 'rolling' ? 'font-medium text-success' : 'text-muted-foreground')}>
          {d.tone === 'rolling' ? 'Rolling' : d.tone === 'none' ? 'Not listed' : d.label}
        </div>
      )}
    </div>
  );
}
