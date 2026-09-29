import { cn } from '@/lib/utils';

function Kbd({ className, ...props }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn('bg-muted text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-sm border px-1 font-mono text-[10px] font-medium', className)}
      {...props}
    />
  );
}

export { Kbd };
