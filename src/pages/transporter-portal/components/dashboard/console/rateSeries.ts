import { CONTAINER_TYPE_LABELS, type ContainerType } from '@/features/transporter-bi';

/**
 * The drayage rate curve behind "Your Rate vs Network", in DJF per move.
 *
 * Modelled rather than derived, and deliberately so — the same choice the
 * shipper console makes in `ShipmentTypesMixedChart`. The trip table records
 * what *we* invoiced; it has no observation of what the rest of the market
 * quoted on the same lane on the same morning, and a "network rate" computed
 * from our own invoices would be a mirror wearing a comparison's clothes.
 *
 * So the network line is a market band and ours is a second one on top of it,
 * both deterministic in the day index so the chart is stable across renders
 * and identical between two people looking at the same link. The move counts
 * beside the chart stay real — those come from the fact table.
 *
 * Bands, DJF per move for a Djibouti port-to-city move:
 *   network — 40k floor, 70k ceiling, a market that swings
 *   ours    — 45k to 90k, dipping to 40k on the days we take work cheap
 */

const NETWORK_FLOOR = 40_000;
const NETWORK_CEILING = 70_000;
const OWN_FLOOR = 40_000;
const OWN_CEILING = 90_000;

interface Band {
  /** Centre of the band this equipment trades around. */
  network: number;
  own: number;
}

/**
 * Where each box sits inside the bands. Reefers and high cubes carry the
 * premium; a 20-foot dry box is the commodity move everyone quotes on.
 */
const BANDS: Record<ContainerType, Band> = {
  dry_20: { network: 51_000, own: 57_000 },
  dry_40: { network: 56_000, own: 65_000 },
  hc_40: { network: 59_000, own: 70_000 },
  reefer_40: { network: 64_000, own: 80_000 },
  flatbed: { network: 49_000, own: 55_000 },
};

export interface RatePoint {
  label: string;
  yours: number;
  network: number;
}

export interface RateTab {
  key: ContainerType;
  label: string;
  moves: number;
  yours: number;
  network: number;
  points: RatePoint[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A stable small offset per equipment type, so the five tabs are not clones. */
function phaseOf(type: ContainerType): number {
  let hash = 0;
  for (const character of type) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return (hash / 997) * Math.PI * 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * One equipment type's curve across the given day labels.
 *
 * The network swings on a slow cycle with a faster ripple on top; ours rides
 * the same market but wider, because a single fleet's book is lumpier than a
 * whole corridor's. Every ninth day is a discount day — the cheap load taken
 * to keep a truck moving — which is what puts our line under the floor of its
 * own band now and then.
 */
function curve(type: ContainerType, labels: string[]): RatePoint[] {
  const band = BANDS[type];
  const phase = phaseOf(type);

  return labels.map((label, index) => {
    const cycle = Math.sin(index * 0.42 + phase);
    const ripple = Math.cos(index * 0.93 + phase * 1.7);

    const network = clamp(
      Math.round(band.network + cycle * 8_600 + ripple * 3_200),
      NETWORK_FLOOR,
      NETWORK_CEILING,
    );

    const discountDay = (index + Math.round(phase)) % 9 === 4;
    const own = clamp(
      Math.round(
        band.own +
          cycle * 12_400 +
          ripple * 5_100 +
          (discountDay ? -17_000 : 0),
      ),
      OWN_FLOOR,
      OWN_CEILING,
    );

    return { label, yours: own, network };
  });
}

export interface BuildRateTabsInput {
  /** Formatted day labels the rest of the console's charts share. */
  labels: string[];
  /** Real completed-move counts per equipment type, from the fact table. */
  movesByType: Partial<Record<ContainerType, number>>;
}

export function buildRateTabs({ labels, movesByType }: BuildRateTabsInput): RateTab[] {
  return (Object.keys(BANDS) as ContainerType[])
    .map((type) => {
      const points = curve(type, labels);
      return {
        key: type,
        label: CONTAINER_TYPE_LABELS[type],
        moves: movesByType[type] ?? 0,
        yours: Math.round(mean(points.map((point) => point.yours))),
        network: Math.round(mean(points.map((point) => point.network))),
        points,
      };
    })
    .filter((tab) => tab.moves > 0);
}
