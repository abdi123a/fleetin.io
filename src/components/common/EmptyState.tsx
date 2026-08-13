import type { LucideIcon } from '@/design-system/icons';

import type { ReactNode } from 'react';

import { cn } from '@/utils';
import { IconChip } from '@/design-system';

/**
 * EmptyState — shared treatment for "nothing here yet", zero-result and
 * not-configured states, so every module communicates emptiness identically.
 */

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Call-to-action, typically a Button. */
  action?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_STYLES = {
  sm: { wrapper: 'py-8', icon: 'size-9', title: 'text-base' },
  md: { wrapper: 'py-14', icon: 'size-11', title: 'text-lg' },
  lg: { wrapper: 'py-20', icon: 'size-14', title: 'text-xl' },
} as const;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div
      className={cn(
        'flex w-full h-full flex-col items-center justify-center gap-3 px-6 text-center my-auto',
        styles.wrapper,
        className,
      )}
    >
      {Icon && (
        <IconChip icon={Icon} />
      )}

      <div className="space-y-1">
        <h2 className={cn('font-semibold text-foreground', styles.title)}>{title}</h2>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
