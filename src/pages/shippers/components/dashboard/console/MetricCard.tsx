import type { ComponentType, SVGProps } from 'react';
import { ArrowDownRight, ArrowUpRight } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { cn } from '@/utils';
import { PANEL_SURFACE } from './PanelHeader';

/**
 * One headline count in the KPI row.
 *
 * Each card carries its own colour so the four figures read as four different
 * kinds of news at a glance — teal for volume, green for delivered, blue for
 * still moving, orange for late — rather than four identical white tiles that
 * only differ by an icon.
 *
 * The percentage under the figure is coloured by direction alone: up is green,
 * down is red. The reader asked for that rule, and it is the one that matches
 * how people already read arrows.
 */

export type MetricIntent = 'brand' | 'success' | 'info' | 'accent';

const TILE: Record<MetricIntent, string> = {
  brand: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  info: 'bg-info text-info-foreground',
  accent: 'bg-accent text-accent-foreground',
};

/** Soft wash that keeps the card's meaning visible without filling the row. */
const SURFACE: Record<MetricIntent, string> = {
  brand: 'border-primary/25 bg-primary-subtle',
  success: 'border-success/25 bg-success-subtle',
  info: 'border-info/25 bg-info-subtle',
  accent: 'border-accent/25 bg-accent-subtle',
};

const LABEL: Record<MetricIntent, string> = {
  brand: 'text-primary-subtle-foreground',
  success: 'text-success-subtle-foreground',
  info: 'text-info-subtle-foreground',
  accent: 'text-accent-subtle-foreground',
};

export interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: 'up' | 'down';
  /** The clause after the delta, or the whole caption when there is no delta. */
  caption: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  intent: MetricIntent;
}

export function MetricCard({
  label,
  value,
  delta,
  deltaDirection = 'up',
  caption,
  icon: Icon,
  intent,
}: MetricCardProps) {
  const DeltaIcon = deltaDirection === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('min-h-[152px] justify-between gap-6 border p-6', PANEL_SURFACE, SURFACE[intent])}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cn('type-body-sm truncate font-medium', LABEL[intent])}>{label}</p>
          <p className="type-display mt-2.5 text-foreground">{value}</p>
        </div>

        {/* The card keeps its own intent colour; the shape is the system's. */}
        <IconChip icon={Icon} className={cn('shadow-sm', TILE[intent])} />
      </div>

      <p className="type-body-xs flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold tabular-nums',
              deltaDirection === 'down' ? 'text-destructive' : 'text-success',
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden />
            {delta}
          </span>
        ) : null}
        <span className="text-muted-foreground">{caption}</span>
      </p>
    </Card>
  );
}
