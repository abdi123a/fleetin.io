import { Leaf, Route } from '@/design-system/icons';
import { IconChip } from '@/design-system';
import { DISTANCE_SOURCE_LABEL, co2Number, formatCo2, formatKm } from '@/lib/co2';
import { cn } from '@/utils';

/**
 * A carbon figure, wherever one appears.
 *
 * The same block draws on a booking card, in a shipment's masthead, on a
 * vehicle's panel and across the Emissions dashboard, so a reader recognises
 * it before reading it: a leaf disc, the words "CO₂ Emissions", the number
 * large, its unit small beside it. Two sizes, no variants — one for a card,
 * one for a page header.
 *
 * The distance rides along on the same block rather than in a separate card.
 * Kilometres are the *reason* the carbon figure is what it is, and splitting
 * them apart makes the reader hold two numbers in their head to see the
 * relationship the pairing states for free.
 *
 * **What it does not do**: it does not compute anything. Every figure it
 * prints was computed once, server-side, from the factor the truck carried at
 * the time. A component that multiplied here would quietly re-price history
 * every time somebody corrected a vehicle.
 */
export interface Co2FigureProps {
  /** kg CO₂. A Decimal off the wire is fine — it is read through `co2Number`. */
  co2Kg: number | string | null | undefined;
  /** Kilometres covered. Omit and the distance line is not drawn. */
  distanceKm?: number | string | null;
  /** `legs` | `shipment_estimate` | `manual` — what the distance stands on. */
  source?: string | null;
  size?: 'sm' | 'md';
  /** A frame, for when the block sits on a plain card rather than inside one. */
  bordered?: boolean;
  className?: string;
}

export function Co2Figure({
  co2Kg,
  distanceKm,
  source,
  size = 'sm',
  bordered = true,
  className,
}: Co2FigureProps) {
  const kg = co2Number(co2Kg);
  const km = co2Number(distanceKm ?? null);
  const co2 = formatCo2(kg);
  const distance = formatKm(km);
  const dense = size === 'sm';

  return (
    <div
      className={cn(
        'flex items-center gap-3',
        bordered && 'rounded-lg border border-success/25 bg-success-subtle/40',
        bordered && (dense ? 'px-3 py-2.5' : 'px-4 py-3.5'),
        className,
      )}
    >
      <IconChip icon={Leaf} tint="on-green" size={dense ? 36 : 44} />

      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-bold uppercase tracking-wider text-muted-foreground',
            dense ? 'text-[10px]' : 'text-[11px]',
          )}
        >
          CO₂ Emissions
        </span>
        <span className="flex items-baseline gap-1.5">
          <strong
            className={cn(
              'font-bold tabular-nums text-foreground',
              dense ? 'text-base' : 'text-2xl',
            )}
          >
            {co2.value}
          </strong>
          <span
            className={cn('font-semibold text-muted-foreground', dense ? 'text-[11px]' : 'text-xs')}
          >
            {co2.unit}
          </span>
        </span>
      </div>

      {/* The kilometres behind the number. Absent when nothing was measured —
          a distance of "—" beside a carbon figure of "—" says the same thing
          twice. */}
      {km !== null && (
        <div className="shrink-0 border-l border-success/25 pl-3 text-right">
          <span
            className={cn(
              'flex items-center justify-end gap-1 font-bold uppercase tracking-wider text-muted-foreground',
              dense ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            <Route className="size-3 shrink-0" aria-hidden />
            Distance
          </span>
          <span className="flex items-baseline justify-end gap-1">
            <strong
              className={cn(
                'font-bold tabular-nums text-foreground',
                dense ? 'text-base' : 'text-2xl',
              )}
            >
              {distance.value}
            </strong>
            <span
              className={cn(
                'font-semibold text-muted-foreground',
                dense ? 'text-[11px]' : 'text-xs',
              )}
            >
              {distance.unit}
            </span>
          </span>
          {/* Only when it is NOT a measured route. A page that labels every
              figure "measured" has told the reader nothing; a page that labels
              only the estimates has told them exactly what they need. */}
          {source && source !== 'legs' && (
            <span className="block text-[10px] font-medium text-muted-foreground">
              {DISTANCE_SOURCE_LABEL[source] ?? source}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The same figure as one line, for a row that has no space for the block —
 * a table cell, a list item, the inside of a chip.
 */
export function Co2Inline({
  co2Kg,
  className,
}: {
  co2Kg: number | string | null | undefined;
  className?: string;
}) {
  const { value, unit } = formatCo2(co2Number(co2Kg));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-foreground',
        className,
      )}
    >
      <Leaf className="size-3.5 shrink-0 text-success" aria-hidden />
      {value}
      <span className="font-medium text-muted-foreground">{unit}</span>
    </span>
  );
}

/**
 * The booking card's carbon line.
 *
 * One row, because the card it sits on is ~160px wide at three columns and
 * already carries a corner reference, a status badge and three label→value
 * rows. The full `Co2Figure` block would be the loudest thing on it, and the
 * carbon figure is not the news on a dispatch card — it is a fact about a trip
 * whose news is where the box is.
 *
 * So: a hairline, a leaf, the mass, and the kilometres that produced it. It
 * draws nothing at all when the booking has no figure — a truck has not been
 * assigned, or the route has not been priced — because an empty carbon row on
 * every unassigned card is a page of dashes.
 */
export function Co2CardStrip({
  co2Kg,
  distanceKm,
  className,
}: {
  co2Kg: number | string | null | undefined;
  distanceKm?: number | string | null;
  className?: string;
}) {
  const kg = co2Number(co2Kg);
  if (kg === null) return null;

  const km = co2Number(distanceKm ?? null);
  const co2 = formatCo2(kg);
  const distance = formatKm(km);

  return (
    <div
      className={cn(
        'mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[11px]',
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Leaf className="size-3.5 shrink-0 text-success" aria-hidden />
        <strong className="font-bold tabular-nums text-foreground">{co2.value}</strong>
        <span className="truncate font-medium text-muted-foreground">{co2.unit}</span>
      </span>

      {km !== null && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <Route className="size-3.5 shrink-0" aria-hidden />
          <strong className="font-bold tabular-nums text-foreground">{distance.value}</strong>
          <span className="font-medium">{distance.unit}</span>
        </span>
      )}
    </div>
  );
}
