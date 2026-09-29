import { cn } from '@/lib/utils';
import { initials, shadeIndex } from '@/lib/format';

// Monochrome monogram: six graphite shades, picked per company name.
const SHADES = [
  'from-zinc-700 to-zinc-900 text-zinc-100 dark:from-zinc-600 dark:to-zinc-800',
  'from-neutral-500 to-neutral-800 text-neutral-50 dark:from-neutral-500 dark:to-neutral-700',
  'from-stone-300 to-stone-500 text-stone-950 dark:from-stone-300 dark:to-stone-500',
  'from-slate-600 to-slate-900 text-slate-100 dark:from-slate-500 dark:to-slate-800',
  'from-zinc-200 to-zinc-400 text-zinc-900 dark:from-zinc-200 dark:to-zinc-400',
  'from-gray-800 to-black text-gray-200 dark:from-gray-700 dark:to-gray-900',
];

export default function CompanyAvatar({ name, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-[13px] font-semibold tracking-tight ring-1 ring-black/5 dark:ring-white/10',
        SHADES[shadeIndex(name)],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
