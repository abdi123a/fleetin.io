import type { ReactNode } from 'react';
import { Card } from '@/design-system';
import { cn } from '@/utils';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Optional caption under the figure (target, unit context). */
  caption?: ReactNode;
  intent?: 'neutral' | 'warning' | 'critical' | 'good';
  className?: string;
}

/**
 * Plain section-level KPI tile — label over figure, no sparkline.
 * Same language as the shipper suite's `StatTile`.
 */
export function StatCard({
  label,
  value,
  caption,
  intent = 'neutral',
  className,
}: StatCardProps) {
  return (
    <Card variant="default" padding="lg" className={cn('gap-2', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          intent === 'critical'
            ? 'text-destructive'
            : intent === 'warning'
              ? 'text-warning-foreground'
              : intent === 'good'
                ? 'text-success'
                : 'text-foreground',
        )}
      >
        {value}
      </span>
      {caption ? (
        <span className="text-xs text-muted-foreground">{caption}</span>
      ) : null}
    </Card>
  );
}
