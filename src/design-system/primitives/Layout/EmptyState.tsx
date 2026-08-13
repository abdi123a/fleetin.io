import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * EmptyState
 * ---------------------------------------------------------------------------
 * Displayed when a list, table, or collection has no content. Consistent
 * presentation ensures users always know they are looking at an intentional
 * empty state rather than a loading failure.
 * ------------------------------------------------------------------------- */

export type EmptyStateSize = 'sm' | 'md' | 'lg';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Icon or illustration rendered above the title. */
  icon?: ReactNode;
  /** Primary heading. */
  title: string;
  /** Supporting description text. */
  description?: ReactNode;
  /** Primary CTA button node. */
  primaryAction?: ReactNode;
  /** Secondary CTA button node. */
  secondaryAction?: ReactNode;
  /** Size scale. Default 'md'. */
  size?: EmptyStateSize;
}

const sizeClasses: Record<EmptyStateSize, { wrapper: string; icon: string; title: string; desc: string }> = {
  sm: {
    wrapper: 'py-8 gap-3',
    icon: 'h-10 w-10',
    title: 'type-body-md',
    desc: 'type-body-sm',
  },
  md: {
    wrapper: 'py-12 gap-4',
    icon: 'h-14 w-14',
    title: 'type-body-lg',
    desc: 'type-body-sm',
  },
  lg: {
    wrapper: 'py-16 gap-5',
    icon: 'h-20 w-20',
    title: 'type-display-sm font-bold',
    desc: 'type-body-md',
  },
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    icon,
    title,
    description,
    primaryAction,
    secondaryAction,
    size = 'md',
    className,
    ...props
  },
  ref,
) {
  const sz = sizeClasses[size];

  return (
    <div
      ref={ref}
      className={cn(
        'flex w-full h-full flex-col items-center justify-center text-center my-auto',
        sz.wrapper,
        className,
      )}
      {...props}
    >
      {/* Icon slot */}
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-lg bg-surface-sunken text-muted-foreground',
            sz.icon,
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}

      {/* Text */}
      <div className="max-w-xs space-y-1.5">
        <h3 className={cn(sz.title, 'text-foreground')}>{title}</h3>
        {description && (
          <p className={cn(sz.desc, 'text-muted-foreground')}>{description}</p>
        )}
      </div>

      {/* Actions */}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
});
