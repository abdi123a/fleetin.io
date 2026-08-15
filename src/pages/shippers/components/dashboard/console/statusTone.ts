import { CheckCircle2, Clock3, Truck } from '@/design-system/icons';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { onTimeGraceMinutes } from '@/lib/bi/config';

/**
 * The console speaks in two colours, and this is where they are assigned.
 *
 *   TEAL   — the account working. On plan, moving, done.
 *   ORANGE — the account needing you. Late, stuck, costing money.
 *
 * One rule the reader learns once, on the first panel, and can then apply to
 * every other panel on the page without a legend. The previous palette spent
 * four hues on it — green delivered, blue in transit, gold delayed, red money —
 * which meant holding four associations, and two of them (`--accent` at #f9ac17
 * against `--warning` at #ffb502) were the same colour to the eye anyway.
 * Colour was carrying identity where it should have been carrying meaning.
 *
 * Within teal, depth carries progress: a solid deep block for arrived, the
 * lighter subtle fill for still moving. Depth is a weaker channel than hue,
 * which is correct — the distinction between "delivered" and "in transit" is
 * not one anybody has to act on, and both carry their own icon and label
 * regardless.
 */

/**
 * The punctuality floor the account is judged against, and the line where the
 * console switches from teal to orange. It lives here rather than on the page
 * so the gauge, the carrier table and the headline all break at the same
 * number — three panels each carrying their own idea of "good" is how a reader
 * ends up with a green score above an orange carrier at the same rate.
 */
export const ON_TIME_TARGET = 0.9;

export type ConsoleStatus = 'delivered' | 'in_transit' | 'delayed';

export interface StatusTone {
  status: ConsoleStatus;
  label: string;
  icon: typeof Truck;
  /** Solid disc behind the row icon; depth, not a wash, separates the states. */
  chip: string;
  /** Status text beside the reference. The `-subtle-foreground` steps are the
   *  only ones on either ramp that clear AA on a card surface. */
  text: string;
  /** Bar or segment fill. */
  bar: string;
  /** The same fill as a raw token reference, for SVG `fill`/`stroke` props that
   *  cannot take a class. */
  swatch: string;
}

const TONES: Record<ConsoleStatus, StatusTone> = {
  delivered: {
    status: 'delivered',
    label: 'Delivered',
    icon: CheckCircle2,
    chip: 'bg-primary-bold text-primary-bold-foreground',
    text: 'text-primary-subtle-foreground',
    bar: 'bg-primary-bold',
    swatch: 'var(--primary-bold)',
  },
  in_transit: {
    status: 'in_transit',
    label: 'In Transit',
    icon: Truck,
    chip: 'bg-primary text-primary-foreground',
    text: 'text-primary-subtle-foreground',
    bar: 'bg-primary/55',
    swatch: 'color-mix(in srgb, var(--primary) 55%, var(--surface))',
  },
  delayed: {
    status: 'delayed',
    label: 'Delayed',
    icon: Clock3,
    chip: 'bg-accent-bold text-accent-bold-foreground',
    text: 'text-accent-subtle-foreground',
    bar: 'bg-accent-bold',
    swatch: 'var(--accent-bold)',
  },
};

export function toneFor(status: ConsoleStatus): StatusTone {
  return TONES[status];
}

/**
 * Has the cargo physically arrived, whether or not it arrived on time?
 *
 * Deliberately separate from `classifyStatus`, which sends a late arrival to
 * `delayed` because that is the row's *tone*. A count of delivered shipments is
 * not a punctuality score: a load that landed six hours late still landed, and
 * a "Delivered" figure that quietly excludes it undercounts the account against
 * its own shipment list.
 */
export function hasLanded(row: ShipperShipmentRow): boolean {
  return row.status === 'delivered' || row.status === 'closed' || row.stage === 'delivered';
}

/**
 * Which of the three a row belongs to. A true partition — every row lands in
 * exactly one bucket, so the mix bar's segments always sum to the headline
 * total.
 *
 * Risk score is deliberately not consulted. It blends ETA drift, stage dwell
 * and free-time headroom, and most open rows clear 70 on it — reading that as
 * "delayed" put every open shipment in the delayed bucket and left In Transit
 * showing zero. At risk is a forecast; delayed is a missed promise.
 */
export function classifyStatus(row: ShipperShipmentRow): ConsoleStatus {
  if (hasLanded(row)) return row.outcome === 'late' ? 'delayed' : 'delivered';

  // Still moving: late only once the forecast breaks the promise past grace.
  return (row.varianceMinutes ?? 0) > onTimeGraceMinutes() ? 'delayed' : 'in_transit';
}

export function classifyRow(row: ShipperShipmentRow): StatusTone {
  return TONES[classifyStatus(row)];
}

/** Where a row sits along its corridor, as a percentage for the progress bar. */
const STAGE_PROGRESS: Record<string, number> = {
  created: 8,
  documentation: 18,
  gate_in: 28,
  dispatched: 40,
  picked_up: 52,
  in_transit: 68,
  arrived: 84,
  unloading: 92,
  delivered: 96,
  empty_awaiting: 98,
  empty_returned: 100,
};

export function stageProgress(stage: string): number {
  return STAGE_PROGRESS[stage] ?? 40;
}
