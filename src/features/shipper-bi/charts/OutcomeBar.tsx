import { cn } from '@/utils';
import type { CategorySlice } from '../contracts';
import { intentColor, MARK, type Intent } from './chartTheme';

/**
 * A single 100% stacked bar with a legend beneath it.
 *
 * Built in HTML rather than Recharts because at this size — one bar, three
 * segments — a chart library adds an SVG, a responsive container and a
 * measurement pass to draw three divs. It also makes the 2px surface gap
 * between segments trivial, which is the spec, and gives every segment a real
 * focus target for free.
 *
 * Used wherever a whole is split into a handful of parts that *mean* something:
 * early/on-time/late, free-time headroom, container status.
 */

export interface OutcomeBarProps {
  slices: CategorySlice[];
  /** Announced to screen readers as the bar's purpose. */
  label: string;
  onSelect?: (slice: CategorySlice) => void;
  /** Hide the legend when the caller renders its own. */
  showLegend?: boolean;
  className?: string;
}

export function OutcomeBar({
  slices,
  label,
  onSelect,
  showLegend = true,
  className,
}: OutcomeBarProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const visible = slices.filter((slice) => slice.value > 0);

  if (total === 0) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        No deliveries in this period.
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`${label}: ${visible
          .map((slice) => `${slice.label} ${Math.round((slice.value / total) * 100)}%`)
          .join(', ')}`}
      >
        {visible.map((slice, index) => {
          const share = slice.value / total;
          const Segment = onSelect && slice.drillDown ? 'button' : 'div';
          return (
            <Segment
              key={slice.key}
              type={Segment === 'button' ? 'button' : undefined}
              onClick={onSelect && slice.drillDown ? () => onSelect(slice) : undefined}
              className={cn(
                'h-full transition-opacity',
                Segment === 'button' &&
                  'cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
              style={{
                width: `${share * 100}%`,
                backgroundColor: intentColor((slice.intent ?? 'neutral') as Intent),
                // White does the separating, not a stroke around each segment.
                marginLeft: index === 0 ? 0 : MARK.surfaceGap,
              }}
              aria-label={Segment === 'button' ? `${slice.label}: ${slice.value}` : undefined}
              title={`${slice.label}: ${slice.value}`}
            />
          );
        })}
      </div>

      {showLegend ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: intentColor((slice.intent ?? 'neutral') as Intent) }}
                aria-hidden
              />
              {/* Text wears a text token; the dot beside it carries identity. */}
              <span className="text-muted-foreground">{slice.label}</span>
              <span className="font-semibold tabular-nums text-foreground">
                {slice.value}
              </span>
              <span className="text-muted-foreground">
                ({Math.round((slice.value / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
