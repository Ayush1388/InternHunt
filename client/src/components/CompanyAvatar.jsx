import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';

// Monochrome monogram: ink on paper, like a printed logo mark.
export default function CompanyAvatar({ name, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-md border bg-background text-[12px] font-semibold tracking-tight text-foreground',
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
