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
  empties: 40,
  /**
   * Already booked to run an empty back around this pickup.
   *
   * Read straight off the Empty Return calendar. A carrier with a return
   * scheduled that week is going to be at the depot anyway, so this load costs
   * them a detour rather than a trip — a different saving from pairing, and one
   * that survives even when no box of theirs suits this shipment.
   */
  scheduled: 20,
  /** Of the pairable empties, those whose deadline this pickup genuinely beats. */
  urgency: 15,
  /**
   * Trucks. A carrier who cannot field them is not an answer.
   *
   * Took the 8 points that were `price` when partner price lists were removed
   * on 2026-08-31 — there is no per-carrier rate left to compare, the shipment's
   * price is entered by the operator, and a dimension scoring every carrier
   * identically is the "everyone gets 56%" bug with extra steps.
   */
  fleet: 16,
  /**
   * How they have actually performed — the derived star rating.
   *
   * Added 2026-08-30. Without it the panel printed "56% match" against three
   * different carriers, because on a corridor where everyone runs ten trucks at
   * the same rate the only two dimensions in play were identical for all of
   * them. Fleet and price describe what a carrier *offers*; this is the only
   * dimension that describes what they have actually *done*, and it is the one
   * an operator would otherwise be applying from memory.
   */
  rating: 10,
} as const;

/**
 * How close a scheduled return has to be to count as "the same trip".
 *
 * Two days either side of the pickup. Tighter and a return planned for the
 * morning after stops counting; looser and every carrier with anything on the
 * calendar that week scores, which is the same as nobody scoring.
 */
export const SCHEDULED_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

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
  /** Empty returns already on their calendar within the pickup window. */
  scheduledReturns: number;
  /** How many of them this shipment has the vehicles to take. */
  pairable: number;
  /** Of the pairable ones, those whose deadline falls inside the watch window. */
  urgent: number;
  vehicles: number;
  /** Derived star rating, 1–5, or null when they have no closed bookings yet. */
  rating: number | null;
  /** False when this carrier cannot field every truck the shipment needs. */
  coversFleet: boolean;
  vehiclesNeeded: number;
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
  /**
   * Their derived star rating, 1–5, or null when they have no record yet.
   *
   * Optional: a caller with no booking history to hand simply omits it and the
   * dimension drops out of the denominator for everyone, the same way the
   * empty-container dimensions do when nobody is holding a box.
   */
  ratingOf?: (partner: PartnerRecord) => number | null;
  /** Container shipments only — bulk and machinery have no box to reuse. */
  considerEmpties: boolean;
  /**
   * Empty returns already scheduled near this pickup, by carrier legal name.
   *
   * Keyed by name rather than id because the Empty Return record carries the
   * carrier as the company name it was delivered under, and there is no partner
   * id on it to join by.
   */
  scheduledByName?: ReadonlyMap<string, number>;
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
  ratingOf,
  considerEmpties,
  scheduledByName,
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

  /**
   * The most any carrier could score on THIS shipment.
   *
   * Fleet and price are always in play. The three empty-container dimensions
   * are only winnable if some carrier actually holds a compatible box or has a
   * return already booked — otherwise they are dead weight that drags every
   * score down equally and tells the reader nothing.
   *
   * Dropping them from the denominator is what makes the percentage mean
   * "how good is this carrier among the ones available", which is the question
   * the panel is actually answering.
   */
  /** The biggest fleet on offer — the yardstick headroom is scored against. */
  const largestFleet = partners.reduce((max, p) => Math.max(max, p.vehicles?.length ?? 0), 0);

  const anyEmpties = [...emptiesByPartner.values()].some((held) => held.total > 0);
  const anyScheduled = considerEmpties
    ? partners.some(
        (partner) =>
          (scheduledByName?.get(partner.companyLegalName.trim().toLowerCase()) ?? 0) > 0,
      )
    : false;
  const anyRated = partners.some((partner) => (ratingOf?.(partner) ?? null) !== null);
  const achievable =
    RECOMMENDATION_WEIGHTS.fleet +
    (anyRated ? RECOMMENDATION_WEIGHTS.rating : 0) +
    (anyEmpties ? RECOMMENDATION_WEIGHTS.empties + RECOMMENDATION_WEIGHTS.urgency : 0) +
    (anyScheduled ? RECOMMENDATION_WEIGHTS.scheduled : 0);

  const ranked = partners
    .map((partner): TransporterScore => {
      const held = emptiesByPartner.get(partner.id) ?? { total: 0, urgent: 0 };
      /* Capped at the vehicle count: a carrier holding ten boxes when this
         shipment runs two trucks can only pair two of them today. */
      const pairable = Math.min(held.total, needed);
      const urgent = Math.min(held.urgent, pairable);
      const vehicles = partner.vehicles?.length ?? 0;

      /* Straight off their Empty Return calendar. One scheduled return in the
         window earns most of the weight — they are already going — and a second
         earns the rest; beyond that it is the same trip either way. */
      const scheduledReturns = considerEmpties
        ? (scheduledByName?.get(partner.companyLegalName.trim().toLowerCase()) ?? 0)
        : 0;
      const scheduledPts =
        Math.min(scheduledReturns, 2) / 2 * RECOMMENDATION_WEIGHTS.scheduled;

      const emptiesPts = (pairable / needed) * RECOMMENDATION_WEIGHTS.empties;
      const urgencyPts =
        pairable > 0 ? (urgent / pairable) * RECOMMENDATION_WEIGHTS.urgency : 0;

      /* Fleet is two parts, not one.
       *
       * It used to be `min(vehicles, needed) / needed`, which awards full marks
       * to anyone who merely meets the minimum — so on a one-truck shipment a
       * carrier with 8 vehicles and one with 10 scored identically, and the
       * whole list tied. Covering the job is most of it, but headroom is a real
       * signal: the carrier with spare trucks is the one who still delivers
       * when a vehicle breaks down. Capped at 3× the need, beyond which more
       * trucks tell you nothing about today. */
      const coverage = Math.min(vehicles, needed) / needed;
      /* Headroom is measured against the biggest fleet in the running, not
         against a multiple of the need. A fixed multiple saturates: on a
         one-truck job anything with 3+ vehicles maxed out, so 8 trucks and 10
         trucks tied again and the sort fell back to input order. Relative to
         the field, the answer is always "who has the most spare capacity of
         the carriers you are actually choosing between". */
      const headroom =
        largestFleet > needed
          ? Math.min(Math.max(vehicles - needed, 0) / (largestFleet - needed), 1)
          : 0;
      const fleetPts = (coverage * 0.75 + headroom * 0.25) * RECOMMENDATION_WEIGHTS.fleet;

      /* Stars, scored across the 1–5 band rather than from zero: a carrier at
         3.0 has not earned 60% of this dimension, they have earned half of the
         range anyone can actually occupy. An unrated carrier scores nothing
         here and the dimension leaves the denominator for everyone if nobody
         is rated, exactly as the empty-container dimensions do. */
      const rating = ratingOf?.(partner) ?? null;
      const ratingPts =
        rating === null
          ? 0
          : (Math.min(Math.max(rating, 1), 5) - 1) / 4 * RECOMMENDATION_WEIGHTS.rating;

      /* Figures, not sentences. Composing the phrases here meant the panel read
         them back positionally — and on a carrier with boxes but none urgent,
         the fleet count landed in the slot reserved for the urgency line and
         was printed as if it were one. */
      return {
        partnerId: partner.id,
        name: partner.companyLegalName,
        logoUrl: partner.logoUrl,
        /* Scored against what is WINNABLE here, not against a fixed 100.
           See `achievable` below: when nobody is holding a box, those 75
           points cannot be earned by anyone and dividing by them printed 25%
           beside every carrier — a number that reads as "all of these are
           bad" when it actually meant "this dimension does not apply today". */
        score: Math.round(
          ((emptiesPts + scheduledPts + urgencyPts + fleetPts + ratingPts) /
            achievable) *
            100,
        ),
        emptiesHeld: held.total,
        scheduledReturns,
        pairable,
        urgent,
        vehicles,
        rating,
        coversFleet: vehicles >= needed,
        vehiclesNeeded: needed,
      };
    })
    /* Score first; ties go to the carrier holding more boxes, then the cheaper
       one, so the order is stable and never arbitrary. */
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.emptiesHeld - a.emptiesHeld ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        b.scheduledReturns - a.scheduledReturns,
    );

  return {
    ranked,
    noEmptiesAnywhere: ranked.every((entry) => entry.emptiesHeld === 0),
  };
}
