import { cn } from '@/lib/utils';
import { initials, shadeIndex } from '@/lib/format';

// Monogram on a soft gradient, picked per company name so each company keeps its colour.
const PALETTES = [
  'from-indigo-500 to-violet-600 text-white',
  'from-sky-500 to-blue-600 text-white',
  'from-emerald-500 to-teal-600 text-white',
  'from-rose-500 to-pink-600 text-white',
  'from-amber-400 to-orange-500 text-white',
  'from-fuchsia-500 to-purple-600 text-white',
  'from-cyan-500 to-sky-600 text-white',
  'from-zinc-700 to-zinc-900 text-zinc-100 dark:from-zinc-500 dark:to-zinc-700',
];

export default function CompanyAvatar({ name, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-[13px] font-semibold tracking-tight shadow-sm ring-1 ring-black/5 dark:ring-white/10',
        PALETTES[shadeIndex(name, PALETTES.length)],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
