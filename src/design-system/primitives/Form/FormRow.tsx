import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/utils';

export interface FormRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of grid columns on desktop. Default is 2. */
  cols?: 1 | 2 | 3 | 4 | 'auto';
  /** Responsive layout variant: 'stack' stacks on mobile, 'inline' keeps single row. Default is 'stack'. */
  layout?: 'stack' | 'inline';
  /** Spacing gap between columns. Default is 'md'. */
  gap?: 'sm' | 'md' | 'lg';
  /** Vertical alignment of items. Default is 'top'. */
  align?: 'top' | 'center' | 'bottom';
}

const colsClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4',
  auto: 'grid-cols-1 sm:grid-flow-col sm:auto-cols-fr',
};

const gapClasses = {
  sm: 'gap-3',
  md: 'gap-4 sm:gap-6',
  lg: 'gap-6 sm:gap-8',
};

const alignClasses = {
  top: 'items-start',
  center: 'items-center',
  bottom: 'items-end',
};

export const FormRow = forwardRef<HTMLDivElement, FormRowProps>(function FormRow(
  { cols = 2, layout = 'stack', gap = 'md', align = 'top', className, children, ...props },
  ref,
) {
  if (layout === 'inline') {
    return (
      <div
        ref={ref}
        className={cn('flex flex-wrap items-center', gapClasses[gap], className)}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn('grid w-full', colsClasses[cols], gapClasses[gap], alignClasses[align], className)}
      {...props}
    >
      {children}
    </div>
  );
});
