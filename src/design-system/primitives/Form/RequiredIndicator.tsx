import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

export interface RequiredIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  /** Optional mode to show "Required" text or visual asterisk `*`. Defaults to asterisk. */
  variant?: 'asterisk' | 'badge';
}

export const RequiredIndicator = forwardRef<HTMLSpanElement, RequiredIndicatorProps>(
  function RequiredIndicator({ variant = 'asterisk', className, ...props }, ref) {
    if (variant === 'badge') {
      return (
        <span
          ref={ref}
          className={cn(
            'inline-flex items-center rounded-sm bg-danger-subtle/50 px-1.5 py-0.5 type-body-xs font-medium text-danger',
            className,
          )}
          {...props}
        >
          Required
        </span>
      );
    }

    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn('ml-0.5 select-none font-semibold text-danger', className)}
        title="Required field"
        {...props}
      >
        *
      </span>
    );
  },
);
