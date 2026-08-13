import { cn } from '@/utils';
import { deltaIntent, formatDelta } from '../format';

/**
 * The "▲ 36.3% vs last year" pill that rides a chart's header.
 *
 * A comparison line on a plot shows the *shape* of a change; it does not say
 * how big the change was. The reader ends up eyeballing the gap between two
 * lines and guessing. This states it once, in the header, so the chart carries
 * both the shape and the size.
 *
 * Direction and goodness are separate: a rising cost and a rising on-time rate
 * are both arrows up, and only one is green. `polarity` decides the colour,
 * `deltaPct` decides the arrow.
 */

export interface DeltaBadgeProps {
  /** Signed fraction, e.g. 0.363 for +36.3%. */
  deltaPct: number | undefined;
  /** What the comparison is against — "vs last year", "vs prior period". */
  caption?: string;
  polarity?: 'higher_is_better' | 'lower_is_better' | 'neutral';
  className?: string;
}

export function DeltaBadge({
  deltaPct,
  caption = 'vs last year',
  polarity = 'higher_is_better',
  className,
}: DeltaBadgeProps) {
  const delta = formatDelta(deltaPct);
  if (delta === undefined || deltaPct === undefined) return null;

  const intent = deltaIntent(deltaPct, polarity);
  const rising = deltaPct > 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
        intent === 'good' && 'bg-success-subtle',
        intent === 'bad' && 'bg-destructive-subtle',
        intent === 'neutral' && 'bg-muted',
        className,
      )}
    >
      {/* The arrow is the redundant channel — the badge never rests on colour
          alone to say which way the number went. */}
      <span
        aria-hidden
        className={cn(
          'text-[10px] leading-none',
          intent === 'good' && 'text-success',
          intent === 'bad' && 'text-destructive',
          intent === 'neutral' && 'text-muted-foreground',
        )}
      >
        {rising ? '▲' : '▼'}
      </span>
      <span
        className={cn(
          'text-xs font-semibold leading-none tabular-nums',
          intent === 'good' && 'text-success-subtle-foreground',
          intent === 'bad' && 'text-destructive-subtle-foreground',
          intent === 'neutral' && 'text-muted-foreground',
        )}
      >
        {delta}
      </span>
      <span className="text-[10px] uppercase leading-none tracking-wider text-muted-foreground">
        {caption}
      </span>
    </span>
  );
}
