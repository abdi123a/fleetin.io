import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

export interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional addon element on the left of input (text, select, icon). */
  addonLeft?: ReactNode;
  /** Optional addon element on the right of input (text, select, icon). */
  addonRight?: ReactNode;
}

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { addonLeft, addonRight, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'group flex w-full items-stretch rounded-md border border-input bg-surface transition-all overflow-hidden',
        'hover:border-border-strong',
        'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
        className,
      )}
      {...props}
    >
      {addonLeft && (
        <div className="flex shrink-0 items-center border-r border-border bg-surface-sunken px-3 type-body-sm font-medium text-muted-foreground select-none">
          {addonLeft}
        </div>
      )}

      <div className="relative flex-1 min-w-0 flex items-center [&_input]:border-none [&_input]:bg-transparent [&_input]:rounded-none [&_input]:shadow-none [&_input]:focus:ring-0 [&_input]:focus:outline-none">
        {children}
      </div>

      {addonRight && (
        <div className="flex shrink-0 items-center border-l border-border bg-surface-sunken px-3 type-body-sm font-medium text-muted-foreground select-none">
          {addonRight}
        </div>
      )}
    </div>
  );
});
