import type { ReactNode } from 'react';
import { formatStars, type PerformanceSummary } from '@/lib/rating';
import { cn } from '@/utils';
import { RatingAxes } from './RatingAxes';
import { StarRating } from './StarRating';

export interface PerformancePanelProps {
  summary: PerformanceSummary;
  /** Rendered under the axes. The transporter profile has nothing here — its trend sits beside the panel, not inside it. */
  children?: ReactNode;
  className?: string;
}

/**
 * A profile's performance block: the overall star, what it was earned on, and
 * the three marks behind it.
 *
 * Two figures beside the star and nothing else. Missions is the weight of the
 * record — a 5.0 on three jobs is not a 5.0 on a hundred and thirty — and On
 * Time is the one that moves most, so it earns its place next to the headline
 * instead of being buried in the breakdown.
 *
 * ## Sizing
 *
 * The tile row is `auto-fit`, not a breakpoint grid. This panel renders in two
 * places of very different widths — a 512px drawer and a dashboard column that
 * the sidebar narrows — so "how many tiles fit" is a question about the box it
 * was put in, which viewport breakpoints cannot answer. Three tiles at wide,
 * two then one as the box closes, and every tile keeps a floor it never reads
 * cramped below.
 */
export function PerformancePanel({ summary, children, className }: PerformancePanelProps) {
  if (!summary.rated) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-card-nested border border-dashed border-border bg-muted/20 px-4 py-8 text-center',
          className,
        )}
      >
        <StarRating value={null} size="md" glyphsOnly />
        <p className="pt-2.5 text-sm font-bold text-foreground">Not yet rated</p>
        <p className="pt-0.5 text-xs text-muted-foreground">
          The first delivery debrief sets the rating.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('@container flex min-w-0 flex-col gap-5', className)}>
      {/* Container queries, not `auto-fit`: with three tiles, auto-fit's
          two-column state leaves a hole in the second row. Here the rating
          takes the whole row instead, so the set never breaks ragged. */}
      <div className="grid grid-cols-1 gap-3 @[280px]:grid-cols-2 @[410px]:grid-cols-3">
        <Tile
          className="@[280px]:col-span-2 @[410px]:col-span-1"
          tone="primary"
          value={formatStars(summary.overall)}
          unit="/ 5"
          footer={<StarRating value={summary.overall} size="sm" glyphsOnly />}
        />
        <Tile value={summary.missions.toLocaleString()} footer="Missions" />
        <Tile
          value={summary.onTime.toLocaleString()}
          unit={summary.onTimePct === null ? undefined : `${summary.onTimePct}%`}
          footer="On Time"
        />
      </div>

      <RatingAxes summary={summary} />

      {children}
    </div>
  );
}

/**
 * One figure.
 *
 * All three tiles share this shape — a number line and a footer line — so the
 * rating reads as the first of a set rather than a different object that
 * happens to sit beside two others. Only its tint separates it.
 */
function Tile({
  value,
  unit,
  footer,
  tone = 'plain',
  className,
}: {
  value: string;
  unit?: string;
  footer: ReactNode;
  tone?: 'primary' | 'plain';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-2.5 rounded-card-nested border px-4 py-3.5',
        tone === 'primary' ? 'border-primary/25 bg-primary/5' : 'border-border/80 bg-muted/20',
        className,
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-black leading-none tabular-nums text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-bold leading-none tabular-nums text-muted-foreground">
            {unit}
          </span>
        )}
      </span>
      <span className="flex h-4 items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {footer}
      </span>
    </div>
  );
}
