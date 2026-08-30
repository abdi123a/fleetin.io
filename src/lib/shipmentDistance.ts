/**
 * How far a shipment is actually driven.
 *
 * `estimatedDistanceKm` on a shipment is **one leg of one truck** — port to
 * free zone, 25km on the Djibouti corridor. Printing it beside a shipment
 * implies that is the job, and for a five-container shipment it is off by an
 * order of magnitude: five trucks make that run, and five boxes come back.
 *
 * The road actually driven is therefore:
 *
 *     containers × (out + back)
 *
 * ## The two assumptions, stated
 *
 * **One container is one truck run.** That is what a booking is in this system
 * — `CreateShipmentModal` mints one per container — so the count of bookings is
 * the count of trips out.
 *
 * **The empty comes back the way it went.** The shipment carries no separate
 * return distance (`Booking.emptyReturnDistanceKm` exists but is unset on the
 * live book), and the Empty Return module already describes the return as "the
 * delivery leg backwards, out of the free zone and back into the terminal the
 * box came off". Same road, same length.
 *
 * ## What this deliberately does not model
 *
 * Pairing. A container matched to an outbound load rides back on a truck that
 * was making the trip anyway, so that return is shared rather than driven
 * again — which is the whole argument of the Empty Return module. Discounting
 * it here would need each booking's pairing state, which a shipment list does
 * not have and cannot afford to fetch per row. So this is the distance the
 * shipment *commits*, and pairing is what claws some of it back; the Empty
 * Return performance page is where that saving is reported.
 */

/** Out and back. Named because it is an assumption, not a constant of nature. */
export const LEGS_PER_CONTAINER = 2;

/**
 * How many trucks this shipment puts on the road.
 *
 * The references arrive joined — `"57734, 3458348, 34583486"` — because that is
 * how the backend returns a shipment's booking and container lists. Falls back
 * to one: a shipment with no booking list recorded is still one run, not zero.
 */
export function containerCount(refs: string | null | undefined): number {
  if (!refs) return 1;
  const parts = refs
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.length : 1;
}

export interface ShipmentDistance {
  /** Trucks on the road — one per container. */
  containers: number;
  /** The one-way leg the shipment was quoted at. */
  legKm: number;
  /** Every kilometre the shipment commits: `containers × leg × 2`. */
  totalKm: number;
}

export function shipmentDistance(
  estimatedDistanceKm: number | null | undefined,
  bookingRefs: string | null | undefined,
): ShipmentDistance {
  const legKm = Math.max(estimatedDistanceKm ?? 0, 0);
  const containers = containerCount(bookingRefs);
  return { containers, legKm, totalKm: containers * legKm * LEGS_PER_CONTAINER };
}

/** `250 km`. Whole kilometres — a tenth of a kilometre is noise on a road. */
export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString()} km`;
}
