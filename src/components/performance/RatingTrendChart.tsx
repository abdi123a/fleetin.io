import { useId } from 'react';
import { RATING_MAX, RATING_MIN, formatStars, type RatingTrendPoint } from '@/lib/rating';
import { cn } from '@/utils';

export interface RatingTrendChartProps {
  points: RatingTrendPoint[];
  height?: number;
  className?: string;
}

/** Where the scale is written down the left edge. */
const GRIDLINES = [RATING_MAX, 3, RATING_MIN];

/** Room for the axis figures, and for the month names under the plot. */
const AXIS_WIDTH = 34;
const LABEL_HEIGHT = 18;

/**
 * The overall rating, month by month.
 *
 * **The axis is fixed at 1–5 and never fits itself to the data.** A rating that
 * moved 4.6 → 4.7 is a rating that did not really move, and an auto-scaled plot
 * would draw that as a climb across the whole card. Held against the full
 * scale, a flat line means what it looks like.
 *
 * A month nothing closed in is a gap, not a zero and not a straight segment
 * across it — the line stops and starts again, because there is no measurement
 * to join. A month standing alone between two gaps is drawn as a lone dot: a
 * one-point path renders as nothing at all, which would silently drop a real
 * reading off the chart.
 *
 * Drawn by hand rather than through the BI chart kit: six points on a fixed
 * axis need a path and some dots, and the kit's card chrome, table fallback and
 * series machinery would be more code around this chart than in it.
 */
export function RatingTrendChart({ points, height = 140, className }: RatingTrendChartProps) {
  const gradientId = useId();
  const span = RATING_MAX - RATING_MIN;
  const xOf = (index: number) => (points.length <= 1 ? 50 : (index / (points.length - 1)) * 100);
  const yOf = (rating: number) => ((RATING_MAX - rating) / span) * 100;

  /* Runs of consecutive measured months. Each is drawn on its own so a quiet
     month breaks the line instead of being bridged across. */
  const runs: { index: number; rating: number }[][] = [];
  let run: { index: number; rating: number }[] = [];
  points.forEach((point, index) => {
    if (point.rating === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push({ index, rating: point.rating });
  });
  if (run.length > 0) runs.push(run);

  const measured = runs.flat();
  if (measured.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-card-nested border border-dashed border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground',
          className,
        )}
        style={{ height: height + LABEL_HEIGHT }}
      >
        No missions closed in the last {points.length} months
      </div>
    );
  }

  const summary = measured
    .map(({ index, rating }) => `${points[index]?.label}: ${formatStars(rating)}`)
    .join(', ');

  return (
    <figure className={cn('m-0 min-w-0', className)}>
      {/* The drawing is decorative — every number in it is published as text in
          the table below, so a reader who cannot see the line still gets the
          series rather than a shrug. `title` on the dots stays for the mouse. */}
      <div className="relative" style={{ height }} aria-hidden>
        {/* The scale, stated once. Without it a rating line is only a shape. */}
        {GRIDLINES.map((mark) => (
          <div
            key={mark}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2"
            style={{ top: `${yOf(mark)}%` }}
          >
            {/* Full `--muted-foreground`, not a faded one: at 70% opacity these
                measured 3.06:1 against the card, under the 4.5:1 floor. The
                scale is the only thing telling the reader what the line means,
                so it is the last text on the card that should be whispered. */}
            <span
              className="shrink-0 text-right text-[10px] font-semibold tabular-nums leading-none text-muted-foreground"
              style={{ width: AXIS_WIDTH - 8 }}
            >
              {mark.toFixed(1)}
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
        ))}

        {/* The plot keeps a little right inset so the last dot is not half-cut
            by the card edge it would otherwise sit on. */}
        <div className="absolute inset-y-0 right-1" style={{ left: AXIS_WIDTH }}>
          <svg
            className="absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {runs.map((segment) => {
              const first = segment[0];
              const last = segment[segment.length - 1];
              if (!first || !last || segment.length < 2) return null;
              const line = segment
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.index)},${yOf(p.rating)}`)
                .join(' ');
              return (
                <g key={`seg-${first.index}`}>
                  <path
                    d={`${line} L${xOf(last.index)},100 L${xOf(first.index)},100 Z`}
                    fill={`url(#${gradientId})`}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>

          {measured.map(({ index, rating }) => {
            const point = points[index];
            if (!point) return null;
            return (
              <span
                key={point.month}
                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
                style={{ left: `${xOf(index)}%`, top: `${yOf(rating)}%` }}
                title={`${point.label} · ${formatStars(rating)} over ${point.missions} missions`}
              />
            );
          })}
        </div>
      </div>

      {/* Month names sit at the same x as their dot, not in equal columns — a
          label a third of a bucket away from its point is worse than none. */}
      <div
        className="relative mr-1"
        aria-hidden
        style={{ marginLeft: AXIS_WIDTH, height: LABEL_HEIGHT }}
      >
        {points.map((point, index) => (
          <span
            key={point.month}
            className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none text-muted-foreground"
            style={{ left: `${xOf(index)}%` }}
          >
            {point.label}
          </span>
        ))}
      </div>

      <figcaption className="sr-only">
        Overall rating by month, on a scale of {RATING_MIN} to {RATING_MAX}. {summary}.
      </figcaption>
      <table className="sr-only">
        <caption>Overall rating by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Rating</th>
            <th scope="col">Missions</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <th scope="row">{point.label}</th>
              <td>{point.rating === null ? 'No missions closed' : formatStars(point.rating)}</td>
              <td>{point.missions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
