import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from '@/design-system/icons';

import type { HTMLAttributes } from 'react';

import { cn } from '@/utils';

/**
 * Spinner — indeterminate activity indicator.
 *
 * Carries `role="status"` with a visually hidden label so screen readers
 * announce the wait; pass `label` to describe what is loading.
 */

const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      xs: 'size-3',
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-6',
      xl: 'size-8',
    },
    intent: {
      primary: 'text-primary',
      muted: 'text-muted-foreground',
      current: 'text-current',
    },
  },
  defaultVariants: {
    size: 'md',
    intent: 'primary',
  },
});

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof spinnerVariants> {
  /** Announced to assistive technology. */
  label?: string;
}

export function Spinner({ className, size, intent, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)} {...props}>
      <Loader2 className={cn(spinnerVariants({ size, intent }))} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { spinnerVariants };
