import { TrendingDown, TrendingUp } from '@/design-system/icons';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/design-system/primitives/Layout';
import { cn } from '@/utils';

/* ===========================================================================
 * TrendIndicator
 * =========================================================================== */

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface TrendIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  direction: TrendDirection;
  /** Whether "up" is good (green) or bad (red). Default 'positive'. */
  polarity?: 'positive' | 'negative';
}

export function TrendIndicator({ direction, polarity = 'positive', className, ...props }: TrendIndicatorProps) {
  const isGood = (polarity === 'positive' && direction === 'up') || (polarity === 'negative' && direction === 'down');
  const isBad  = (polarity === 'positive' && direction === 'down') || (polarity === 'negative' && direction === 'up');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5',
        direction === 'neutral' && 'text-muted-foreground',
        isGood && 'text-success',
        isBad  && 'text-destructive',
        className,
      )}
      {...props}
    >
      {direction === 'up'   && <TrendingUp   className="h-3.5 w-3.5" />}
      {direction === 'down' && <TrendingDown  className="h-3.5 w-3.5" />}
    </span>
  );
}

/* ===========================================================================
 * Delta
 * =========================================================================== */

export interface DeltaProps extends HTMLAttributes<HTMLSpanElement> {
  /** Numeric change value. */
  value: number;
  /** Show as percentage. */
  percentage?: boolean;
  /** Show sign always (+ or −). Default true. */
  showSign?: boolean;
}

export function Delta({ value, percentage = false, showSign = true, className, ...props }: DeltaProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const sign = showSign && isPositive ? '+' : '';
  const label = `${sign}${value.toLocaleString()}${percentage ? '%' : ''}`;

  return (
    <span
      className={cn(
        'type-body-xs font-medium tabular-nums',
        isPositive && 'text-success',
        isNegative && 'text-destructive',
        !isPositive && !isNegative && 'text-muted-foreground',
        className,
      )}
      {...props}
    >
      {label}
    </span>
  );
}

/* ===========================================================================
 * Percentage
 * =========================================================================== */

export interface PercentageProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  /** Show a small bar under the value. */
  showBar?: boolean;
  /** Bar status colour. */
  barStatus?: 'default' | 'success' | 'warning' | 'danger';
}

const barStatusClasses: Record<string, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-destructive',
};

export function Percentage({ value, showBar, barStatus = 'default', className, ...props }: PercentageProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)} {...props}>
      <span className="type-body-sm font-semibold tabular-nums">{pct}%</span>
      {showBar && (
        <div className="h-1 w-full rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', barStatusClasses[barStatus])}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
 * Counter
 * =========================================================================== */

export interface CounterProps extends HTMLAttributes<HTMLSpanElement> {
  /** The displayed count value. */
  value: number;
  /** Compact display (1k, 1M). */
  compact?: boolean;
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function Counter({ value, compact = false, className, ...props }: CounterProps) {
  return (
    <span className={cn('type-body-sm font-semibold tabular-nums text-foreground', className)} {...props}>
      {compact ? formatCompact(value) : value.toLocaleString()}
    </span>
  );
}

/* ===========================================================================
 * Metric
 * =========================================================================== */

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  /** The primary value string (e.g. "247", "KES 4,200"). */
  value: string;
  /** Supporting label. */
  label: string;
  /** Optional trend direction. */
  trend?: TrendDirection;
  /** Optional delta value shown next to trend. */
  delta?: number;
  deltaPercent?: boolean;
}

export const Metric = forwardRef<HTMLDivElement, MetricProps>(function Metric(
  { value, label, trend, delta, deltaPercent, className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn('flex flex-col gap-0.5', className)} {...props}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none text-foreground tabular-nums">{value}</span>
        {trend && delta !== undefined && (
          <span className="flex items-center gap-0.5">
            <TrendIndicator direction={trend} />
            <Delta value={delta} percentage={deltaPercent} />
          </span>
        )}
      </div>
      <span className="type-body-xs text-muted-foreground">{label}</span>
    </div>
  );
});

/* ===========================================================================
 * MetricCard
 * =========================================================================== */

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card title. */
  title: string;
  /** Primary metric value. */
  value: string;
  /** Supporting label for the value. */
  label?: string;
  /** Trend direction. */
  trend?: TrendDirection;
  /** Numeric delta. */
  delta?: number;
  deltaPercent?: boolean;
  /** Comparison period (e.g. "vs last month"). */
  period?: string;
  /** Icon in the leading slot. */
  icon?: ReactNode;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(function MetricCard(
  { title, value, label, trend, delta, deltaPercent, period, icon, className, ...props },
  ref,
) {
  return (
    <Card ref={ref} className={className} {...props}>
      <CardHeader compact>
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
          <CardTitle className="type-body-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <Metric value={value} label={label ?? ''} trend={trend} delta={delta} deltaPercent={deltaPercent} />
        {period && <span className="type-body-xs text-muted-foreground mt-1 block">{period}</span>}
      </CardContent>
    </Card>
  );
});
