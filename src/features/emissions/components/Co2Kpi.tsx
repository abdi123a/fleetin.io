import type { ComponentType, SVGProps } from 'react';

import { IconChip, Skeleton } from '@/design-system';
import { cn } from '@/utils';

/**
 * A carbon figure at the top of a page.
 *
 * ## Why this is not `StatisticCard`
 *
 * The house KPI tile is built for three or four short numbers and sets its
 * figure at `text-4xl`. This row is five tiles wide and two of its figures are
 * long — `0.966 kg/km` and `2,377 km` — so at that size the value wrapped onto
 * a second line and the row read as a wall of digits rather than as five
 * facts. The tile's size is fixed on an inner span and cannot be overridden
 * from a `className`, so the honest options were to shrink it for every page
 * in the app or to size one here. This sizes one here.
 *
 * ## Why it is green
 *
 * A carbon page should look like one. The lead figure takes a solid green
 * slab and everything after it takes a green disc, so the row, the columns
 * beneath it and the ranking bars below all read as one subject — rather than
 * a brand-teal dashboard that happens to be about CO₂.
 *
 * The unit sits beside the number rather than under it as a subtitle: "2.3"
 * and "t CO₂" are one fact, and splitting them puts a line break inside it.
 */
export interface Co2KpiProps {
  label: string;
  /** The figure. Already formatted — this component does no arithmetic. */
  value: string | number;
  /** `t CO₂`, `km`. Sits inline, at label size. */
  unit?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** The one tile the eye should land on first. At most one per row. */
  lead?: boolean;
  /**
   * Green is carbon — what the trucks put out. Yellow is Fleetin Impact —
   * what a realized match stopped them driving. Two questions, two
   * environmental hues, so a reader never adds an avoided figure to an
   * emitted one. Not teal: teal is the console, and it would flatten the
   * one row on this page that is about the road.
   */
  tone?: 'green' | 'impact';
  loading?: boolean;
  className?: string;
}

export function Co2Kpi({ label, value, unit, icon, lead, tone = 'green', loading, className }: Co2KpiProps) {
  const impact = tone === 'impact';
  if (loading) {
    return (
      <div className="flex min-h-[92px] flex-col justify-between gap-3 rounded-card border border-border bg-surface p-3.5">
        <Skeleton className="h-4 w-20 rounded-md" shape="text" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        '@container/tile flex min-h-[92px] flex-col gap-2 rounded-card border p-3.5',
        lead
          ? impact
            ? 'border-transparent bg-impact text-impact-foreground'
            : 'border-transparent bg-success text-success-foreground'
          : impact
            ? 'border-impact-border/40 bg-impact-subtle/50 text-foreground'
            : 'border-success/20 bg-success-subtle/30 text-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'min-w-0 text-xs font-semibold leading-tight',
            lead
              ? impact
                ? 'text-impact-foreground/90'
                : 'text-success-foreground/95'
              : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {/* The system's disc, at the dense 36. Dropped on a narrow tile for the
            same reason `StatisticCard` drops it: the words are the card. */}
        <IconChip
          icon={icon}
          tint={lead ? (impact ? 'on-impact' : 'on-green') : impact ? 'impact' : 'green'}
          size={36}
          className="hidden @[9rem]/tile:inline-flex"
        />
      </div>

      {/* `mt-auto` so five figures share a baseline whatever their labels do. */}
      <span className="mt-auto flex items-baseline gap-1.5">
        <strong className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </strong>
        {unit && (
          <span
            className={cn(
              'text-xs font-semibold',
              lead
                ? impact
                  ? 'text-impact-foreground/80'
                  : 'text-success-foreground/85'
                : 'text-muted-foreground',
            )}
          >
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}
