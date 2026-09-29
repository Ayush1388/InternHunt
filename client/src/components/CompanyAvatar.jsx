import { cn } from '@/lib/utils';
import { initials, shadeIndex } from '@/lib/format';

// Flat monogram in a muted tone, picked per company name so each company keeps its colour.
const PALETTES = [
  'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-200',
  'bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-200',
  'bg-stone-200 text-stone-800 dark:bg-stone-400/15 dark:text-stone-200',
];

export default function CompanyAvatar({ name, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-lg text-[13px] font-semibold tracking-tight',
        PALETTES[shadeIndex(name, PALETTES.length)],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
