import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Skeleton } from '@/design-system/primitives/Skeleton';
import { IconChip, type IconChipTint } from '../Display/IconChip/IconChip';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export type StatisticTrend = 'up' | 'down' | 'neutral';
export type StatisticStatus = 'default' | 'success' | 'warning' | 'danger' | 'info';
/**
 * `green`, `orange` and `slate` joined on 2026-08-30. With `teal` they are the
 * four phases of the shipment ladder — booked · in transit · owes a return ·
 * closed — and they hold the same colours `statusIntentClasses` gives the pill
 * on a shipment card (`./statusIntent`). A tile counting shipments in a phase
 * and a card wearing that phase are then the same colour, which is the whole
 * point: the pastels below say nothing about the job.
 */
export type StatisticVariant =
  | 'default'
  | 'teal'
  | 'green'
  | 'orange'
  | 'slate'
  | 'pink'
  | 'peach'
  | 'blue'
  | 'amber';

export interface StatisticCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card title / metric name shown below the value. */
  title: string;
  /** Primary numeric or percentage metric (e.g. "26", "632", "649", "17%"). */
  value?: string | number;
  /** Supporting subtitle or period descriptor. */
  subtitle?: string;
  /** Color theme variant matching FLEETIN KPI cards (teal, pink, peach, blue). */
  variant?: StatisticVariant;
  /** Trend direction arrow. */
  trend?: StatisticTrend;
  /** Percentage delta to display alongside trend. */
  percentage?: string | number;
  /** Icon rendered on the top right corner of the card. */
  icon?: ReactNode;
  /** Status colour applied when variant is default. */
  status?: StatisticStatus;
  /** Shows skeleton loading shimmer. */
  loading?: boolean;
  /** Renders empty state when true. */
  isEmpty?: boolean;
  /** Called when the card is clicked. */
  onClick?: () => void;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/* The four solid tones plus the outlined default. Colour comes from the
 * `--tile-*` semantic roles, so a tone is one token swap away from re-theming
 * and the tiles keep their fill in dark mode instead of washing out. */
const variantClasses: Record<
  StatisticVariant,
  { container: string; title: string; value: string; icon: IconChipTint }
> = {
  teal: {
    container: 'bg-tile-teal text-tile-teal-foreground border-transparent',
    title: 'text-tile-teal-foreground/95 font-medium',
    value: 'text-tile-teal-foreground font-semibold',
    icon: 'on-teal',
  },
  /* The shipment ladder's three remaining phases. Deliberately the same fills
     as `statusIntentClasses` rather than new pastels, so the tile counting
     "started" shipments is the green those shipments' own pills wear. */
  green: {
    container: 'bg-success text-success-foreground border-transparent',
    title: 'text-success-foreground/95 font-medium',
    value: 'text-success-foreground font-semibold',
    icon: 'on-green',
  },
  orange: {
    container: 'bg-accent text-accent-foreground border-transparent',
    title: 'text-accent-foreground/90 font-medium',
    value: 'text-accent-foreground font-semibold',
    icon: 'on-light',
  },
  /* Closed. `--tile-done` is the same dark slab a fully-returned shipment's
     masthead goes to, so "finished" is one colour across the app — and it is
     the neutral ramp on purpose: a done tile must stop asking for attention. */
  slate: {
    container: 'bg-tile-done text-tile-done-foreground border-transparent',
    title: 'text-tile-done-foreground/90 font-medium',
    value: 'text-tile-done-foreground font-semibold',
    icon: 'on-done',
  },
  pink: {
    container: 'bg-tile-pink text-tile-foreground border-transparent',
    title: 'text-tile-foreground font-medium',
    value: 'text-tile-foreground font-semibold',
    icon: 'on-light',
  },
  peach: {
    container: 'bg-tile-peach text-tile-foreground border-transparent',
    title: 'text-tile-foreground font-medium',
    value: 'text-tile-foreground font-semibold',
    icon: 'on-light',
  },
  blue: {
    container: 'bg-tile-sky text-tile-foreground border-transparent',
    title: 'text-tile-foreground font-medium',
    value: 'text-tile-foreground font-semibold',
    icon: 'on-light',
  },
  /* The one tile that flags rather than reports: same solid-fill treatment as
   * `teal`, but on `--warning` so the single metric asking for attention this
   * month (a bottleneck stage, a rising cost) reads as different in kind from
   * the four pastel tiles beside it, not just a different hue. */
  amber: {
    container: 'bg-warning text-warning-foreground border-transparent',
    title: 'text-warning-foreground/90 font-medium',
    value: 'text-warning-foreground font-semibold',
    icon: 'on-light',
  },
  default: {
    container: 'bg-surface border-border text-foreground',
    title: 'text-muted-foreground font-medium',
    value: 'text-foreground font-semibold',
    icon: 'teal',
  },
};

const trendConfig: Record<StatisticTrend, { arrow: string; classes: string }> = {
  up: { arrow: '↑', classes: 'text-success' },
  down: { arrow: '↓', classes: 'text-destructive' },
  neutral: { arrow: '→', classes: 'text-muted-foreground' },
};

/* ---------------------------------------------------------------------------
 * StatisticCard
 * ---------------------------------------------------------------------------
 * FLEETIN KPI Card: top-row metric value & top-right icon, bottom-row title/label.
 * Supports solid filled theme variants (teal, pink, peach, blue) matching app screenshot.
 * ------------------------------------------------------------------------- */

export const StatisticCard = forwardRef<HTMLDivElement, StatisticCardProps>(
  function StatisticCard(
    {
      title,
      value,
      subtitle,
      variant = 'default',
      trend,
      percentage,
      icon,
      loading = false,
      isEmpty = false,
      onClick,
      className,
      ...props
    },
    ref,
  ) {
    const isClickable = Boolean(onClick);
    const theme = variantClasses[variant];

    if (loading) {
      return <StatisticCardSkeleton className={className} />;
    }

    return (
      <div
        ref={ref}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          isClickable
            ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()
            : undefined
        }
        className={cn(
          /* `gap-2`, not `justify-between` on a 116px floor. The old card pinned
             the number to the top and the label to the bottom and let dead
             space grow between them, so four tiles side by side each had a
             different-sized hole in the middle. The content now sits in one
             block and the card is as tall as what it holds. */
          '@container/tile relative flex min-h-[104px] flex-col gap-2 rounded-card border p-3.5 transition-all select-none @[9rem]/tile:p-4',
          theme.container,
          isClickable && 'cursor-pointer hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      >
        {/* Row 1: what this is — the label leads, the icon closes.
            The label used to sit UNDER the number at `text-xl`, nearly the size
            of the number itself, so a reader met a bare figure and had to look
            below it to learn what the figure counted. Label first at reading
            size is how every serious metric card is built: it reads as a
            sentence — "Total shipments: 12" — and it leaves the number as the
            only large thing on the card. */}
        <div className="flex items-start justify-between gap-3">
          <span className={cn('min-w-0 text-xs font-semibold leading-tight', theme.title)}>
            {title}
          </span>
          {/* The system's solid disc — white on a filled tile, teal on the
              outlined default, so every card in the app opens the same way.
              36, not 44: it is a marker for the card, not a second headline.

              Gone below 9rem of card. Two of these side by side on a small
              phone leave ~120px, and a 36px disc plus a gap took a third of it
              — the title wrapped underneath and collided with the disc. The
              icon is a marker; the words are the card. */}
          {icon && (
            <IconChip tint={theme.icon} size={36} className="hidden @[9rem]/tile:inline-flex">
              {icon}
            </IconChip>
          )}
        </div>

        {/* Row 2: the figure, and nothing else at its size.
            `mt-auto` so the numbers sit on one line across a row of cards
            whatever their labels do — "Waiting empty return" wraps to two lines
            and "Total shipments" does not, which was dropping one card's figure
            half a line below its neighbours. */}
        <div className="mt-auto flex flex-col gap-0.5">
          <span
            className={cn(
              'text-3xl sm:text-4xl font-semibold leading-none tracking-tight tabular-nums',
              theme.value,
            )}
          >
            {isEmpty ? '—' : (value ?? '—')}
          </span>
          {(subtitle || (trend && percentage !== undefined)) && (
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              {trend && percentage !== undefined && (
                <span className={cn('font-semibold', variant === 'default' ? trendConfig[trend].classes : 'opacity-90')}>
                  {trendConfig[trend].arrow} {(() => {
                    const str = String(percentage);
                    return str.endsWith('%') || isNaN(Number(str)) ? str : `${str}%`;
                  })()}
                </span>
              )}
              {subtitle && (
                <span className={variant === 'default' ? 'text-muted-foreground' : 'opacity-80'}>
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

/* ---------------------------------------------------------------------------
 * StatisticCardSkeleton
 * ------------------------------------------------------------------------- */

export interface StatisticCardSkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function StatisticCardSkeleton({ className, ...props }: StatisticCardSkeletonProps) {
  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-4 rounded-card border border-border bg-surface p-5 min-h-[116px]',
        className,
      )}
      role="presentation"
      aria-hidden
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="size-11 rounded-full" />
      </div>
      <Skeleton className="h-5 w-28 rounded-md" shape="text" />
    </div>
  );
}
