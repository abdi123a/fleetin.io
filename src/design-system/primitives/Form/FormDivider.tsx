import { forwardRef, type HTMLAttributes } from 'react';

import { Separator } from '@/design-system/primitives/Separator';
import { cn } from '@/utils';

export interface FormDividerProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional text label to display in middle of divider line. */
  label?: string;
}

export const FormDivider = forwardRef<HTMLDivElement, FormDividerProps>(function FormDivider(
  { label, className, ...props },
  ref,
) {
  if (label) {
    return (
      <div ref={ref} className={cn('relative my-6 flex items-center', className)} {...props}>
        <div className="grow border-t border-border" />
        <span className="shrink-0 px-3 type-body-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="grow border-t border-border" />
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('my-6', className)} {...props}>
      <Separator />
    </div>
  );
});
