import { resolveContainerSize } from '@/data/emptyReturnData';
import type { EmptyReturnBookingRecord } from '@/features/empty-returns';
import type { PartnerRecord } from '@/types/partner';

/**
 * Which transporter should move this shipment, and why.
 *
 * Ordinarily a carrier is chosen on price and whether they have trucks free.
 * Fleetin knows one thing more, and it is the thing that decides the money: a
 * carrier **already sitting on an empty box of the right line and size, near
 * this pickup, with deadline to spare** turns two trips into one. The empty
 * return that container was going to need simply never happens, and the
 * detention it was heading for is never charged.
 *
 * So the score is mostly that. The rest is there to stop the answer being
 * useless in practice — a carrier holding four perfect empties and two trucks
 * cannot move a six-vehicle shipment, and a carrier who is twice the price is
 * not a recommendation whatever they are holding.
 *
 * ## It ranks, it never blocks
 *
 * Nothing here disables a choice or marks one wrong. A transporter with no
 * compatible empty is still a perfectly good transporter — repositioning an
 * empty truck is a normal operation, not an error state. This is an argument
 * offered next to the decision, and every score carries the reasons that made
 * it so the operator can disagree with the arithmetic rather than the badge.
 */

/** How the hundred points are split. Named, because this is the argument. */
export const RECOMMENDATION_WEIGHTS = {
  /** Empties this shipment could actually pair away. The whole point. */
  empties: 50,
  /** Of those, the ones whose return deadline this pickup genuinely beats. */
  urgency: 20,
  /** Trucks. A carrier who cannot field them is not an answer. */
  fleet: 20,
  /** Price, relative to the others in the running. */
  price: 10,
} as const;

/**
 * A deadline this close is worth beating.
 *
 * Three days — the same window Empty Container Management calls `watch`. Inside
 * it, pairing is not merely tidy: it is the difference between no fee and a
 * detention line on the invoice.
 */
const URGENT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Compatible = same line, same size, free before pickup, collected before the
 * deadline. Identical to the rule the Matching engine applies — a shipment
 * created here must not produce a pairing Matching would have called
 * impossible.
 */
export function isCompatibleEmpty(
  booking: EmptyReturnBookingRecord,
  params: { line: string; sizes: string[]; pickupAt: number },
): boolean {
  if (!booking.containerNumber) return false;
  if (!booking.partnerId) return false;
  /* A box already flagged for its own return has been decided against; offering
     it here would quietly overturn somebody else's call. */
  if (booking.emptyReturnException) return false;
  if ((booking.shippingLine ?? '') !== params.line) return false;

  const size = resolveContainerSize(booking.shipmentCategory, booking.cargoType);
  if (!params.sizes.includes(size)) return false;

  const readyAt = booking.emptyReadyAt ? Date.parse(booking.emptyReadyAt) : null;
  if (readyAt !== null && readyAt > params.pickupAt) return false;

  const deadline = booking.containerReturnDeadline
    ? Date.parse(booking.containerReturnDeadline)
    : null;
  if (deadline === null) return false;
  return params.pickupAt <= deadline;
}

export interface TransporterScore {
  partnerId: string;
  name: string;
  logoUrl?: string | null;
  /** 0–100, rounded. */
  score: number;
  /** Compatible empties this carrier is holding. */
  emptiesHeld: number;
  /** How many of them this shipment has the vehicles to take. */
  pairable: number;
  /** Of the pairable ones, those whose deadline falls inside the watch window. */
  urgent: number;
  vehicles: number;
  ratePerVehicle: number;
  /** Short phrases the panel prints under the score, in order of weight. */
  reasons: string[];
}

export interface RecommendationInput {
  partners: PartnerRecord[];
  /** Every currently available empty, unfiltered — the rule is applied here. */
  available: EmptyReturnBookingRecord[];
  line: string;
  sizes: string[];
  /** Epoch ms — when the truck has to be at the pickup. */
  pickupAt: number;
  vehiclesNeeded: number;
  /** Per-vehicle price for this shipment's vehicle type, by partner. */
  rateOf: (partner: PartnerRecord) => number;
  /** Container shipments only — bulk and machinery have no box to reuse. */
  considerEmpties: boolean;
}

export interface RecommendationResult {
  /** Best first. Callers show the head of this list. */
  ranked: TransporterScore[];
  /** True when nobody is holding a box this shipment could take. */
  noEmptiesAnywhere: boolean;
}

export function recommendTransporters({
  partners,
  available,
  line,
  sizes,
  pickupAt,
  vehiclesNeeded,
  rateOf,
  considerEmpties,
}: RecommendationInput): RecommendationResult {
  const needed = Math.max(1, vehiclesNeeded);

  /* Empties per carrier, and how urgent each one is. */
  const emptiesByPartner = new Map<string, { total: number; urgent: number }>();
  if (considerEmpties) {
    for (const booking of available) {
      if (!isCompatibleEmpty(booking, { line, sizes, pickupAt })) continue;
      const partnerId = booking.partnerId as string;
      const deadline = booking.containerReturnDeadline
        ? Date.parse(booking.containerReturnDeadline)
        : null;
      const bucket = emptiesByPartner.get(partnerId) ?? { total: 0, urgent: 0 };
      bucket.total += 1;
      if (deadline !== null && deadline - pickupAt <= URGENT_WINDOW_MS) bucket.urgent += 1;
      emptiesByPartner.set(partnerId, bucket);
    }
  }

  const rates = partners.map(rateOf).filter((rate) => rate > 0);
  const cheapest = rates.length > 0 ? Math.min(...rates) : 0;
  const dearest = rates.length > 0 ? Math.max(...rates) : 0;
  const spread = dearest - cheapest;

  const ranked = partners
    .map((partner): TransporterScore => {
      const held = emptiesByPartner.get(partner.id) ?? { total: 0, urgent: 0 };
      /* Capped at the vehicle count: a carrier holding ten boxes when this
         shipment runs two trucks can only pair two of them today. */
      const pairable = Math.min(held.total, needed);
      const urgent = Math.min(held.urgent, pairable);
      const vehicles = partner.vehicles?.length ?? 0;
      const rate = rateOf(partner);

      const emptiesPts = (pairable / needed) * RECOMMENDATION_WEIGHTS.empties;
      const urgencyPts =
        pairable > 0 ? (urgent / pairable) * RECOMMENDATION_WEIGHTS.urgency : 0;
      const fleetPts = (Math.min(vehicles, needed) / needed) * RECOMMENDATION_WEIGHTS.fleet;
      const pricePts =
        rate <= 0 || spread <= 0
          ? RECOMMENDATION_WEIGHTS.price
          : (1 - (rate - cheapest) / spread) * RECOMMENDATION_WEIGHTS.price;

      const reasons: string[] = [];
      if (held.total > 0) {
        reasons.push(`${held.total} empty${held.total === 1 ? '' : ' boxes'} waiting`);
      }
      if (urgent > 0) {
        reasons.push(`${urgent} due back within 3 days`);
      }
      reasons.push(
        vehicles >= needed
          ? `${vehicles} vehicles — covers all ${needed}`
          : `${vehicles} vehicle${vehicles === 1 ? '' : 's'} of ${needed} needed`,
      );
      if (rate > 0) reasons.push(`${rate.toLocaleString()} FDJ per vehicle`);

      return {
        partnerId: partner.id,
        name: partner.companyLegalName,
        logoUrl: partner.logoUrl,
        score: Math.round(emptiesPts + urgencyPts + fleetPts + pricePts),
        emptiesHeld: held.total,
        pairable,
        urgent,
        vehicles,
        ratePerVehicle: rate,
        reasons,
      };
    })
    /* Score first; ties go to the carrier holding more boxes, then the cheaper
       one, so the order is stable and never arbitrary. */
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.emptiesHeld - a.emptiesHeld ||
        a.ratePerVehicle - b.ratePerVehicle,
    );

  return {
    ranked,
    noEmptiesAnywhere: ranked.every((entry) => entry.emptiesHeld === 0),
  };
}
