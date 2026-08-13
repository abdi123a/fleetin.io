import type { ReactNode } from 'react';
import { Card, IconChip } from '@/design-system';
import { cn } from '@/utils';
import type { KpiMetric } from '../contracts';
import { deltaIntent, formatDelta, formatMetric } from '../format';

/**
 * A compact metric tile: label, value, and a glanceable shape.
 *
 * Visual twin of the shipper suite's `MetricTile`, re-homed here because the
 * transporter's `KpiMetric` carries a `DetailRequest` instead of a filter
 * narrowing. Label above, figure below, so all six figures line up across the
 * strip regardless of label length — with the trailing unit ("DJF", "km",
 * "t CO₂") peeled off and set smaller, so the number is what the eye lands on.
 */

export interface MetricTileProps {
  metric: KpiMetric;
  /** Overrides the metric's own label when the tile needs a shorter one. */
  label?: string;
  /** Icon displayed in top right of the tile with brand-tinted chip. */
  icon?: ReactNode;
  /** Micro-analysis caption (e.g. "Target 92.0%"). Falls back to the metric's. */
  subAnalysis?: string;
  /** A pill beside the value — a share, a qualifier. */
  badge?: { text: string; intent: 'good' | 'warning' | 'critical' | 'neutral' };
  shape?: 'sparkline' | 'bars' | 'none';
  onClick?: () => void;
  className?: string;
}

function splitUnit(formatted: string): [string, string | undefined] {
  const match = /^(.*?)\s([A-Za-z₂]{2,})$/.exec(formatted);
  if (!match) return [formatted, undefined];
  const [, figure = formatted, unit] = match;
  return [figure, unit];
}

export function MetricTile({
  metric,
  label,
  icon,
  subAnalysis,
  badge,
  shape = 'sparkline',
  onClick,
  className,
}: MetricTileProps) {
  const trend = metric.trend.map((point) => point.v);
  const intent = deltaIntent(metric.deltaPct, metric.polarity);
  const delta = formatDelta(metric.deltaPct);
  const [figure, unit] = splitUnit(formatMetric(metric.value, metric.unit));

  const qualifier = badge ? (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none',
        badge.intent === 'good' && 'bg-success-subtle text-success-subtle-foreground',
        badge.intent === 'warning' && 'bg-warning-subtle text-warning-subtle-foreground',
        badge.intent === 'critical' && 'bg-destructive-subtle text-destructive-subtle-foreground',
        badge.intent === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {badge.text}
    </span>
  ) : delta ? (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none',
        intent === 'good' && 'bg-success-subtle text-success-subtle-foreground',
        intent === 'bad' && 'bg-destructive-subtle text-destructive-subtle-foreground',
        intent === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {delta} vs prev
    </span>
  ) : null;

  const body: ReactNode = (
    <div className="flex flex-col h-full justify-between gap-2.5">
      <div className="flex items-start justify-between gap-2">
        {/*
          Two lines rather than an ellipsis. On a phone the strip is two tiles
          wide, and "Outstanding Payments" clipped to "Outstanding P…" costs the
          reader the one word that says which payments.
        */}
        <span className="min-w-0 text-xs font-semibold leading-snug text-muted-foreground line-clamp-2">
          {label ?? metric.label}
        </span>
        {icon ? <IconChip size={36}>{icon}</IconChip> : null}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl lg:text-[1.65rem] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
          {figure}
          {unit ? (
            <span className="ml-1 align-baseline text-xs font-bold text-muted-foreground">
              {unit}
            </span>
          ) : null}
        </span>

        {shape === 'sparkline' && trend.length > 1 ? (
          <InlineSparkline values={trend} intent={intent} />
        ) : shape === 'bars' && trend.length > 1 ? (
          <InlineBars values={trend} intent={intent} />
        ) : null}
      </div>

      {/*
        Caption and qualifier share a line where there is room and stack where
        there is not. Squeezing them side by side on a narrow tile turned every
        caption into three letters and an ellipsis, which reads as damage rather
        than as design.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5">
        {(subAnalysis ?? metric.caption) ? (
          <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
            {subAnalysis ?? metric.caption}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground/60">Current window</span>
        )}
        {qualifier}
      </div>
    </div>
  );

  const shell = cn(
    'min-h-[128px] p-4 text-left transition hover:border-border-strong',
    className,
  );

  if (!onClick) {
    return (
      <Card variant="default" padding="none" className={shell}>
        {body}
      </Card>
    );
  }

  return (
    <Card
      variant="default"
      padding="none"
      clickable
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label={`${label ?? metric.label}: ${formatMetric(metric.value, metric.unit)}. Open details.`}
      className={shell}
    >
      {body}
    </Card>
  );
}

function toneColor(intent: 'good' | 'bad' | 'neutral'): string {
  if (intent === 'good') return 'var(--success)';
  if (intent === 'bad') return 'var(--destructive)';
  return 'var(--primary)';
}

function InlineSparkline({
  values,
  intent,
}: {
  values: number[];
  intent: 'good' | 'bad' | 'neutral';
}) {
  const width = 64;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={toneColor(intent)}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InlineBars({
  values,
  intent,
}: {
  values: number[];
  intent: 'good' | 'bad' | 'neutral';
}) {
  // Position is the only identity a sparkline bar has, so it is baked into an id up front.
  const shown = values.slice(-10).map((value, index) => ({ id: `bar-${index}`, value, index }));
  const max = Math.max(...shown.map((bar) => bar.value), 1);

  return (
    <div className="flex h-7 shrink-0 items-end gap-[3px]" aria-hidden>
      {shown.map((bar) => (
        <span
          key={bar.id}
          className="w-[4px] rounded-t-[2px]"
          style={{
            height: `${Math.max(4, (bar.value / max) * 24)}px`,
            backgroundColor: toneColor(intent),
            opacity: 0.4 + (bar.index / shown.length) * 0.6,
          }}
        />
      ))}
    </div>
  );
}
