import { cn } from '@/utils';
import { INSIGHT_RANGES, type InsightRange } from './buildInsight';

/**
 * The page's only control.
 *
 * Its predecessor was a filter bar with a date preset, a custom range, and five
 * dimension pickers (transporter, route, stage, cargo, delay owner) — of which
 * only the date reached most of the page, so four of the six controls silently
 * did nothing to the cards under them. One control that works beats six that
 * mostly do not, and it is the only question a shipper actually asks of this
 * page: *over what stretch of time?*
 */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: InsightRange;
  onChange: (range: InsightRange) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Reporting period"
      className="inline-flex items-center gap-1 rounded-full bg-surface-sunken p-1"
    >
      {INSIGHT_RANGES.map((range) => {
        const isActive = range.key === value;
        return (
          <button
            key={range.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={range.label}
            onClick={() => onChange(range.key)}
            className={cn(
              'cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
              isActive
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {range.short}
          </button>
        );
      })}
    </div>
  );
}
