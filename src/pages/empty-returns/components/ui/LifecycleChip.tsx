import { Tooltip } from '@/design-system';
import { EMPTY_RETURN_STATUS_META } from '@/data/emptyReturnData';
import type { EmptyReturnStatus } from '@/types/emptyReturn';
import { cn } from '@/utils';

export interface LifecycleChipProps {
  status: EmptyReturnStatus;
  /** Dot + tooltip only — used at mid breakpoints. */
  compact?: boolean;
  className?: string;
}

/**
 * Modern Lifecycle status badge with colored status dot and subtle container.
 */
export function LifecycleChip({ status, compact = false, className }: LifecycleChipProps) {
  const meta = EMPTY_RETURN_STATUS_META[status];

  if (compact) {
    return (
      <Tooltip content={meta.label}>
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md border border-border/80 bg-muted/40 transition-colors hover:bg-muted',
            className,
          )}
          aria-label={meta.label}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', meta.dotClassName)} aria-hidden />
        </span>
      </Tooltip>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 text-xs font-medium text-foreground tracking-tight',
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dotClassName)} aria-hidden />
      {meta.label}
    </span>
  );
}

