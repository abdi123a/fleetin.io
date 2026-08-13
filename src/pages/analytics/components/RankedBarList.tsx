import { cn } from '@/utils';

/**
 * A ranked composition: label, a bar for the magnitude, a value, and an
 * optional running total.
 *
 * The page previously had four cards that were all the same markup — a bordered
 * button with the label pushed left and the value pushed right — for cost
 * breakdown, delay responsibility, empty-return reasons and cost by
 * transporter. Four different subjects rendered identically, so nothing told
 * you at a glance which one you were looking at, and none of them showed the
 * one thing a composition is for: how big the first row is against the rest.
 *
 * The bar does that work. `cumulativeShare` turns the same list into a Pareto
 * when the question is "how few causes cover most of it".
 */

export interface RankedBarRow {
  key: string;
  label: string;
  /** Drives the bar width and the primary figure. */
  value: number;
  /** Shown under the label — a second measure of the same row. */
  detail?: string;
  /** 0–1. Rendered as a running total, for Pareto reading. */
  cumulativeShare?: number;
}

export interface RankedBarListProps<T extends RankedBarRow> {
  rows: T[];
  /** Formats the primary figure at the end of each row. */
  formatValue: (value: number) => string;
  onSelect?: (row: T) => void;
  /** Tints the leading row's bar, for lists where the top entry is the story. */
  emphasiseLeader?: boolean;
  /**
   * Per-row bar colour, for lists whose rows are an *ordered* sequence
   * (pipeline stages, tiers) rather than one repeated measure. Ordered rows
   * earn the ordinal ramp; unordered rows keep the single wash, because a
   * value-ramp on nominal categories double-encodes bar length as hue.
   */
  barColor?: (row: T, index: number) => string;
  /** Shows each row's share of the list total beside its value. */
  showShare?: boolean;
  className?: string;
}

export function RankedBarList<T extends RankedBarRow>({
  rows,
  formatValue,
  onSelect,
  emphasiseLeader = false,
  barColor,
  showShare = false,
  className,
}: RankedBarListProps<T>) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  const total = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);

  return (
    <ol className={cn('flex flex-col gap-1', className)}>
      {rows.map((row, index) => {
        const width = `${Math.max(1.5, (Math.abs(row.value) / max) * 100)}%`;
        const isLeader = emphasiseLeader && index === 0;

        const body = (
          <>
            {/* The bar is the background of the row, not a separate column, so
                the label sits on top of its own magnitude and the row stays
                readable at any width. */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-0 left-0 rounded-card-nested transition-[width] duration-500',
                !barColor && (isLeader ? 'bg-destructive/15' : 'bg-primary/12'),
              )}
              style={{
                width,
                // Strong enough that the ordinal ramp actually reads as a
                // progression, light enough that foreground ink stays legible
                // on the darkest step.
                ...(barColor
                  ? { backgroundColor: barColor(row, index), opacity: 0.4 }
                  : undefined),
              }}
            />

            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{row.label}</span>
              {row.detail ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {row.detail}
                </span>
              ) : null}
            </span>

            {showShare && total > 0 ? (
              <span className="relative w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {((Math.abs(row.value) / total) * 100).toFixed(1)}%
              </span>
            ) : null}

            {row.cumulativeShare !== undefined ? (
              <span className="relative shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {(row.cumulativeShare * 100).toFixed(0)}% cum.
              </span>
            ) : null}

            <span className="relative shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {formatValue(row.value)}
            </span>
          </>
        );

        const shell =
          'relative flex items-center gap-3 overflow-hidden rounded-card-nested px-3 py-2.5 text-left';

        return (
          <li key={row.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={cn(
                  shell,
                  'w-full transition-colors hover:bg-surface-sunken',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                {body}
              </button>
            ) : (
              <div className={shell}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
