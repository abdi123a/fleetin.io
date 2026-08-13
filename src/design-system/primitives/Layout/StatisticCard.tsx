import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Skeleton } from '@/design-system/primitives/Skeleton';
import { IconChip, type IconChipTint } from '../Display/IconChip/IconChip';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export type StatisticTrend = 'up' | 'down' | 'neutral';
export type StatisticStatus = 'default' | 'success' | 'warning' | 'danger' | 'info';
export type StatisticVariant = 'default' | 'teal' | 'pink' | 'peach' | 'blue';

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
          'relative flex flex-col justify-between gap-4 rounded-card border p-5 transition-all min-h-[116px] select-none',
          theme.container,
          isClickable && 'cursor-pointer hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      >
        {/* Top Row: Metric Value (left) + Icon (right) */}
        <div className="flex items-start justify-between gap-3">
          <span className={cn('text-3xl sm:text-4xl tracking-tight leading-none', theme.value)}>
            {isEmpty ? '—' : (value ?? '—')}
          </span>
          {/* The system's solid disc — white on a filled tile, teal on the
              outlined default, so every card in the app opens the same way. */}
          {icon && <IconChip tint={theme.icon}>{icon}</IconChip>}
        </div>

        {/* Bottom Row: Title / Subtitle / Trend */}
        <div className="flex flex-col gap-0.5">
          <span className={cn('text-lg sm:text-xl tracking-tight', theme.title)}>
            {title}
          </span>
          {(subtitle || (trend && percentage !== undefined)) && (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs">
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
