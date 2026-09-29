import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function DropdownMenu(props) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}
function DropdownMenuTrigger(props) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}
function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[10rem] overflow-x-hidden overflow-y-auto rounded-lg border p-1 shadow-xl',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
function DropdownMenuGroup(props) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}
function DropdownMenuItem({ className, inset, variant = 'default', ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}
function DropdownMenuRadioGroup(props) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}
function DropdownMenuRadioItem({ className, children, ...props }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn('focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
function DropdownMenuLabel({ className, inset, ...props }) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" data-inset={inset} className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground data-[inset]:pl-8', className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />;
}
function DropdownMenuShortcut({ className, ...props }) {
  return <span data-slot="dropdown-menu-shortcut" className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)} {...props} />;
}

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
};
