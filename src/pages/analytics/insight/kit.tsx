import type { ReactNode } from 'react';
import { IconChip, type IconChipTint } from '@/design-system';
import { ArrowDown, ArrowUp } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The five shapes this page is drawn with.
 *
 * The page it replaced had thirty cards in a dozen different treatments, and a
 * reader had to learn each one. There are now five: a **block**, a **big
 * number**, a **share bar**, a **rail** and a **line**. Every question on the
 * page is answered with one of them, so learning the page is learning five
 * things once.
 *
 * **Two colours, and they mean something.** Teal is the account working. Orange
 * is the account costing you money or needing a person. Nothing else is
 * coloured — no success green, no destructive red, no categorical ramp — which
 * is exactly what makes the orange readable without a legend. This is the same
 * rule the shipper dashboard runs on (`console/statusTone.ts`), deliberately,
 * so a shipper moving between the two pages does not relearn colour.
 */

export const ON_TIME_TARGET = 0.9;

/**
 * The page's chart palette — two brand hues, each with depth.
 *
 * The charts first shipped on the design system's *status* scale, which paints
 * good green and critical red. Correct by the token rules and wrong on this
 * page: a green-and-red ring sitting under teal, sky and peach KPI tiles reads
 * as two products stitched together, and Fleetin's brand does not contain
 * either hue. Depth inside a hue carries rank instead — the reader still gets
 * three distinguishable arcs, and every one of them is a Fleetin colour.
 *
 * The meaning is unchanged and matches the shipper dashboard: **teal is the
 * account working, orange is the account costing money.** Learn it once, apply
 * it on every page.
 */
export const TONE = {
  /** The account working. Deep for the headline, light for its neighbour. */
  good: 'var(--primary-bold)',
  goodSoft: 'var(--chart-step-1)',
  /** The account costing money or needing a person. */
  attention: 'var(--accent-bold)',
  /** Ranked shades of the attention hue, deepest first — all of it is bad, so
   *  depth carries size rather than a second meaning. */
  attentionRamp: [
    'var(--fl-orange-700)',
    'var(--fl-orange-500)',
    'var(--fl-orange-400)',
    'var(--fl-orange-300)',
    'var(--fl-orange-200)',
  ],
} as const;

/* ---------------------------------------------------------------------------
 * Block — one question, one answer
 * ------------------------------------------------------------------------ */

export interface BlockProps {
  /** The question, in the words a shipper would use. Not a metric name. */
  title: string;
  /** The answer to that question, stated. This is the point of the block. */
  answer?: ReactNode;
  icon?: ReactNode;
  tint?: IconChipTint;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Fills the remaining height, so cards in a grid row share a baseline. */
  bodyClassName?: string;
}

/**
 * One card, one question.
 *
 * A block states its own conclusion in the header and shows the working
 * underneath. A card whose header is only a noun ("Cost Breakdown") makes the
 * reader derive the finding themselves, which is the complaint that started
 * this rebuild.
 *
 * **The frame carries a visible edge.** `--background` and `--surface` are the
 * same white in light mode, so a shadow alone leaves a card floating on a field
 * of its own colour — which is how the first build came to read as a stack of
 * full-width bands rather than a dashboard. A hairline plus the card shadow
 * gives every cell a boundary, which is what lets a grid read as a grid.
 */
export function Block({
  title,
  answer,
  icon,
  tint = 'teal',
  action,
  children,
  className,
  bodyClassName,
}: BlockProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-5 rounded-lg border border-border-subtle bg-surface p-5 shadow-card sm:p-6',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <IconChip tint={tint} size={44} className="shrink-0">
              {icon}
            </IconChip>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[1.0625rem] font-semibold leading-snug tracking-tight text-foreground">
              {title}
            </h2>
            {answer ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{answer}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn('flex min-w-0 flex-1 flex-col', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Big number
 * ------------------------------------------------------------------------ */

export interface BigStatProps {
  label: string;
  value: string;
  /** One clause of context. Never a second metric. */
  caption?: string;
  deltaPct?: number;
  polarity?: 'up_is_good' | 'down_is_good';
  icon?: ReactNode;
  /** Draws the tile filled — reserved for the number that is currently a problem. */
  alert?: boolean;
}

export function BigStat({
  label,
  value,
  caption,
  deltaPct,
  polarity = 'up_is_good',
  icon,
  alert = false,
}: BigStatProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg p-5 shadow-card',
        alert ? 'bg-accent-bold text-accent-bold-foreground' : 'bg-surface',
      )}
    >
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-full [&_svg]:size-[15px]',
              alert
                ? 'bg-accent-bold-foreground/15 text-accent-bold-foreground'
                : 'bg-primary-subtle text-primary-subtle-foreground',
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <span
          className={cn(
            'type-body-xs font-medium uppercase tracking-[0.06em]',
            alert ? 'text-accent-bold-foreground/80' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>

      <p
        className={cn(
          'text-[2rem] font-semibold leading-none tabular-nums tracking-tight',
          alert ? 'text-accent-bold-foreground' : 'text-foreground',
        )}
      >
        {value}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Delta deltaPct={deltaPct} polarity={polarity} onFill={alert} />
        {caption ? (
          <span
            className={cn(
              'type-body-xs',
              alert ? 'text-accent-bold-foreground/75' : 'text-muted-foreground',
            )}
          >
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A change against the window before, coloured by whether it is good news for
 * this particular metric — spend falling and punctuality rising are both "down"
 * and "up", and one arrow colour for both is how a dashboard ends up painting a
 * detention spike as a win.
 */
export function Delta({
  deltaPct,
  polarity,
  onFill = false,
}: {
  deltaPct?: number;
  polarity: 'up_is_good' | 'down_is_good';
  onFill?: boolean;
}) {
  if (deltaPct === undefined || Math.abs(deltaPct) < 0.005) {
    return (
      <span
        className={cn(
          'type-body-xs font-medium',
          onFill ? 'text-accent-bold-foreground/75' : 'text-muted-foreground',
        )}
      >
        no change
      </span>
    );
  }

  const rising = deltaPct > 0;
  const good = polarity === 'up_is_good' ? rising : !rising;
  const Arrow = rising ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums',
        onFill
          ? 'bg-accent-bold-foreground/15 text-accent-bold-foreground'
          : good
            ? 'bg-primary-subtle text-primary-subtle-foreground'
            : 'bg-accent-subtle text-accent-subtle-foreground',
      )}
    >
      <Arrow className="size-3" aria-hidden />
      {Math.abs(deltaPct * 100).toFixed(0)}%
      <span className="font-normal opacity-70">vs before</span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Share bar — one composition, labelled under itself
 * ------------------------------------------------------------------------ */

export interface ShareBarSegment {
  key: string;
  label: string;
  /** Already formatted — the bar never decides how a number reads. */
  display: string;
  share: number;
  tone: 'good' | 'attention';
}

/**
 * A composition as one bar with its figures written underneath, not a donut
 * with a legend to your right. Width is the share, so the biggest thing is the
 * widest thing and no reader has to compare angles.
 */
export function ShareBar({
  segments,
  height = 'h-4',
}: {
  segments: ShareBarSegment[];
  height?: string;
}) {
  const visible = segments.filter((segment) => segment.share > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className={cn('flex w-full gap-[3px] overflow-hidden rounded-full', height)}>
        {visible.map((segment, index) => (
          <div
            key={segment.key}
            className={cn(
              'h-full min-w-[3px]',
              index === 0 && 'rounded-l-full',
              index === visible.length - 1 && 'rounded-r-full',
              segment.tone === 'attention'
                ? 'bg-accent-bold'
                : index === 0
                  ? 'bg-primary-bold'
                  : 'bg-primary/55',
            )}
            style={{ width: `${Math.max(segment.share * 100, 1.5)}%` }}
            title={`${segment.label} — ${segment.display}`}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {visible.map((segment, index) => (
          <li key={segment.key} className="flex items-center gap-2">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                segment.tone === 'attention'
                  ? 'bg-accent-bold'
                  : index === 0
                    ? 'bg-primary-bold'
                    : 'bg-primary/55',
              )}
              aria-hidden
            />
            <span className="type-body-xs text-muted-foreground">{segment.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-foreground">
              {segment.display}
            </span>
            <span className="type-body-xs tabular-nums text-muted-foreground">
              {(segment.share * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Rail — a ranked list, not a table
 * ------------------------------------------------------------------------ */

export interface RailRow {
  id: string;
  name: string;
  /** The bar's length, 0–1. */
  fill: number;
  /** Sits on the bar's right, the row's headline figure. */
  primary: string;
  /** Two supporting figures at most. A third makes it a table again. */
  meta: string[];
  tone: 'good' | 'attention';
}

/**
 * Ranked rows with the bar doing the comparing. A table of five numeric columns
 * makes the reader sort it themselves; a rail is already sorted, and the answer
 * to "who is best" is simply the row at the top.
 */
export function RankRail({ rows, emptyMessage }: { rows: RailRow[]; emptyMessage: string }) {
  if (rows.length === 0) return <EmptyNote>{emptyMessage}</EmptyNote>;

  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13.5px] font-medium text-foreground">{row.name}</span>
            <span
              className={cn(
                'shrink-0 text-[13.5px] font-semibold tabular-nums',
                row.tone === 'attention' ? 'text-accent-subtle-foreground' : 'text-foreground',
              )}
            >
              {row.primary}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                'h-full rounded-full',
                row.tone === 'attention' ? 'bg-accent-bold' : 'bg-primary',
              )}
              style={{ width: `${Math.max(Math.min(row.fill, 1) * 100, 2)}%` }}
            />
          </div>

          <p className="type-body-xs tabular-nums text-muted-foreground">{row.meta.join(' · ')}</p>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Ring — one percentage against its target
 * ------------------------------------------------------------------------ */

export function Ring({
  value,
  target,
  label,
  size = 148,
}: {
  /** 0–1. */
  value: number;
  /** 0–1. Drawn as a notch on the track, so "are we there" is visual. */
  target?: number;
  label: string;
  size?: number;
}) {
  const stroke = 13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(1, Math.max(0, value)) * circumference;
  const meetsTarget = target === undefined || value >= target;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-surface-sunken"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            className={meetsTarget ? 'stroke-primary' : 'stroke-accent-bold'}
          />
          {target !== undefined && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`2 ${circumference - 2}`}
              strokeDashoffset={-target * circumference}
              className="stroke-foreground/45"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[1.9rem] font-semibold leading-none tabular-nums tracking-tight text-foreground">
            {Math.round(value * 100)}%
          </span>
          <span className="mt-1 type-body-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      {target !== undefined && (
        <p className="type-body-xs text-muted-foreground">
          Target {Math.round(target * 100)}%
          <span className={cn('ml-1.5 font-semibold', meetsTarget ? 'text-primary' : 'text-accent-subtle-foreground')}>
            {meetsTarget ? 'met' : `${Math.round((target - value) * 100)} points short`}
          </span>
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Line — a trend that labels its own ends
 * ------------------------------------------------------------------------ */

export interface LinePoint {
  label: string;
  /** Undefined leaves a gap rather than plotting a fictional zero. */
  value?: number;
}

/**
 * One measure over time, with the first and last points labelled and an
 * optional target rule. Nothing else is annotated: labelling every point is the
 * fastest way to make a line unreadable, and a bare axis is the thing this page
 * was rebuilt to get away from.
 *
 * Deliberately single-axis. A second scale on the same plot lets any two series
 * be made to look correlated, which is why it is off-limits system-wide.
 */
export function TrendLine({
  points,
  formatValue,
  target,
  height = 132,
  tone = 'good',
}: {
  points: LinePoint[];
  formatValue: (value: number) => string;
  /** Drawn as a dashed rule in the same units as the series. */
  target?: number;
  height?: number;
  tone?: 'good' | 'attention';
}) {
  const plotted = points.filter((point) => point.value !== undefined);
  if (plotted.length < 2) {
    return <EmptyNote>Not enough history in this period to draw a trend.</EmptyNote>;
  }

  const width = 100;
  const values = plotted.map((point) => point.value as number);
  const max = Math.max(...values, target ?? 0);
  const min = Math.min(...values, target ?? Infinity);
  const span = max - min || 1;
  const pad = span * 0.15;
  const top = max + pad;
  const bottom = Math.max(0, min - pad);
  const range = top - bottom || 1;

  const x = (index: number) => (index / Math.max(1, points.length - 1)) * width;
  const y = (value: number) => height - ((value - bottom) / range) * height;

  // A gap in the data breaks the stroke instead of dropping it to the floor.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === undefined) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const firstIndex = points.findIndex((point) => point.value !== undefined);
  const lastIndex = points.length - 1 - [...points].reverse().findIndex((point) => point.value !== undefined);
  const stroke = tone === 'attention' ? 'stroke-accent-bold' : 'stroke-primary';
  const fill = tone === 'attention' ? 'fill-accent-bold' : 'fill-primary';

  const areaPath =
    segments.length === 1
      ? `${segments[0]} L${x(lastIndex)},${height} L${x(firstIndex)},${height} Z`
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[132px] w-full overflow-visible"
        role="img"
        aria-label={`Trend from ${points[firstIndex]?.label} to ${points[lastIndex]?.label}`}
      >
        {target !== undefined && (
          <line
            x1={0}
            x2={width}
            y1={y(target)}
            y2={y(target)}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className="stroke-foreground/30"
          />
        )}
        {areaPath && <path d={areaPath} className={cn(fill, 'opacity-[0.10]')} />}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={stroke}
          />
        ))}
        {[firstIndex, lastIndex].map((index) => {
          const point = points[index];
          if (!point || point.value === undefined) return null;
          return (
            <circle
              key={index}
              cx={x(index)}
              cy={y(point.value)}
              r={3}
              vectorEffect="non-scaling-stroke"
              className={cn(fill, 'stroke-surface')}
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {/* The two ends carry their figures; the axis in between is not the point. */}
      <div className="flex items-baseline justify-between gap-3">
        {[firstIndex, lastIndex].map((index, position) => {
          const point = points[index];
          if (!point || point.value === undefined) return <span key={position} />;
          return (
            <div key={position} className={cn('flex flex-col', position === 1 && 'items-end')}>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {formatValue(point.value)}
              </span>
              <span className="type-body-xs text-muted-foreground">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Shared furniture
 * ------------------------------------------------------------------------ */

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-surface-sunken px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * A figure pulled out beside a graphic. Two or three of these under a chart is
 * the whole "detail" budget of a block.
 */
export function Readout({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'text-[17px] font-semibold leading-none tabular-nums',
          attention ? 'text-accent-subtle-foreground' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="type-body-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sparkline — the shape of a headline number, inside its own tile
 * ------------------------------------------------------------------------ */

/**
 * Twelve-ish points of history under a KPI, drawn in the tile's own ink.
 *
 * A stat tile with no plot states a level and hides the movement, which is the
 * difference between a number and a dashboard. No axis, no labels, no grid —
 * the tile's value is the figure, and this is only its shape.
 */
export function Sparkline({
  points,
  className,
  strokeClassName = 'stroke-current',
  fillClassName = 'fill-current',
}: {
  points: Array<number | undefined>;
  className?: string;
  strokeClassName?: string;
  fillClassName?: string;
}) {
  const known = points.filter((point): point is number => point !== undefined);
  if (known.length < 2) return <div className={cn('h-9', className)} />;

  const width = 100;
  const height = 32;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const range = max - min || 1;

  const x = (index: number) => (index / Math.max(1, points.length - 1)) * width;
  const y = (value: number) => height - 2 - ((value - min) / range) * (height - 6);

  // A gap breaks the stroke rather than dropping it to the floor, which would
  // draw a cliff that never happened.
  const runs: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point === undefined) {
      if (current.length > 1) runs.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'}${x(index)},${y(point)}`);
  });
  if (current.length > 1) runs.push(current.join(' '));

  const firstIndex = points.findIndex((point) => point !== undefined);
  const lastIndex = points.length - 1 - [...points].reverse().findIndex((point) => point !== undefined);
  const area =
    runs.length === 1
      ? `${runs[0]} L${x(lastIndex)},${height} L${x(firstIndex)},${height} Z`
      : undefined;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-9 w-full overflow-visible', className)}
      aria-hidden
    >
      {area && <path d={area} className={cn(fillClassName, 'opacity-20')} />}
      {runs.map((run, index) => (
        <path
          key={index}
          d={run}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={strokeClassName}
        />
      ))}
      {points[lastIndex] !== undefined && (
        <circle
          cx={x(lastIndex)}
          cy={y(points[lastIndex] as number)}
          r={2.5}
          vectorEffect="non-scaling-stroke"
          className={fillClassName}
        />
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Comparison bars — two periods, same axis
 * ------------------------------------------------------------------------ */

export interface ComparisonRow {
  label: string;
  value: number;
  display: string;
  tone: 'good' | 'attention';
}

/**
 * Two or three bars sharing one scale, each with its figure on the right.
 *
 * The form for "last month against this month" — the eye compares two lengths
 * against a common left edge, which is the only comparison a bar chart is
 * actually good at.
 */
export function ComparisonBars({ rows, footnote }: { rows: ComparisonRow[]; footnote?: ReactNode }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-body-sm text-muted-foreground">{row.label}</span>
            <span className="text-[15px] font-semibold text-foreground">{row.display}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                row.tone === 'attention' ? 'bg-accent-bold' : 'bg-primary',
              )}
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
      {footnote ? <div className="border-t border-border-subtle pt-3">{footnote}</div> : null}
    </div>
  );
}
