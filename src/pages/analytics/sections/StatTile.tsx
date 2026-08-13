import type { ReactNode } from 'react';
import { Card } from '@/design-system';
import { cn } from '@/utils';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Tints the value for a number that needs attention. Default neutral. */
  intent?: 'neutral' | 'warning' | 'critical';
  className?: string;
}

/**
 * The plain-number counterpart to `MetricTile`.
 *
 * `MetricTile` needs a full `KpiMetric` — trend, delta, polarity — which the
 * locally-derived fact aggregates in this page's sections do not have. This is
 * the same label-over-figure card without that requirement, so a count like
 * "delayed shipments" still gets a tinted, consistent tile instead of a plain
 * text pair.
 */
export function StatTile({ label, value, intent = 'neutral', className }: StatTileProps) {
  return (
    <Card variant="default" padding="lg" className={cn('gap-2', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold',
          intent === 'critical'
            ? 'text-destructive'
            : intent === 'warning'
              ? 'text-warning-foreground'
              : 'text-foreground',
        )}
      >
        {value}
      </span>
    </Card>
  );
}
