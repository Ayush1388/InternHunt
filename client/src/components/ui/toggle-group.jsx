import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

// A wrapping group of pill toggles (multi-select filters).
function ToggleGroup({ className, ...props }) {
  return <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('flex flex-wrap gap-1.5', className)} {...props} />;
}
function ToggleGroupItem({ className, children, ...props }) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-all outline-none',
        'hover:border-primary/40 hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
