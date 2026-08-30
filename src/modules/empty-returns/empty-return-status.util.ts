import { PROOF_OF_DELIVERY } from '../documents/document-owner-type';

/**
 * A booking counts as "delivered" — eligible to become an empty — at exactly
 * these statuses. Mirrors `DELIVERED_SHIPMENT_STATUSES` from the frontend
 * bridge this backend module replaces.
 */
export const DELIVERED_STATUSES = ['Arrived', 'Unloading', 'POD Submitted', 'Empty Ready', 'Empty Picked Up', 'Completed'];

/**
 * Maps a real booking's status onto the small post-match cycle vocabulary.
 * Everything before a match (unloading/empty ready) is read straight off the
 * booking itself — there is no cycle row yet to carry it. `null` means "no
 * opinion", so a status this module doesn't recognise (Payment Pending,
 * Loading, Cancelled, Failed — none reachable today via `NEXT_STATUS` in
 * `MissionRowCard.tsx`) is a no-op rather than a guess.
 */
export function cycleStatusForBookingStatus(status: string): string | null {
  switch (status) {
    case 'Assigned':
      return 'preparing';
    case 'Driver Assigned':
      return 'ready';
    // The whole pickup leg is the truck already working on this cycle. Before
    // these rungs existed the ladder went straight from "Driver Assigned" to
    // "En Route"; without them a matched cycle sat on `ready` through four
    // real status changes and looked stalled.
    case 'Heading to Pickup':
    case 'At Pickup':
    case 'Loading':
    case 'Loaded':
    case 'En Route':
      return 'in_progress';
    default:
      return DELIVERED_STATUSES.includes(status) ? 'completed' : null;
  }
}

/**
 * Has this booking's delivery been proven?
 *
 * The proof of delivery is the hinge of the whole container cycle: it is what
 * says the cargo reached the consignee, and **nothing downstream may happen
 * without it**. A box cannot start its way home on an unproven delivery — if
 * the empty is ready and there is no POD, the return does not begin, because
 * the yard would be sending back a container for a drop nobody can evidence.
 * So this gates the `POD Submitted` rung *and* every door into Empty Return.
 *
 * One category, on the booking itself — see `PROOF_OF_DELIVERY`.
 */
export async function hasProofOfDelivery(
  prisma: { document: { count(args: unknown): Promise<number> } },
  bookingId: string,
): Promise<boolean> {
  const count = await prisma.document.count({
    where: { ownerType: 'BOOKING', ownerId: bookingId, category: PROOF_OF_DELIVERY },
  });
  return count > 0;
}

/**
 * Has this booking's own container gone back to the depot?
 *
 * The empty return is **part of the job, not an epilogue to it**: a shipper who
 * hires a truck for a container has not been fully served until the box is off
 * their hands, and the line bills detention for every day it is not. So a
 * containerized booking is not finished at delivery — it is finished when this
 * returns true, and `BookingsService.updateStatus` refuses "Completed" until
 * then. Without that guard the board showed containers marked Completed while
 * the very same card read "Empty Return: awaiting match", which is a job
 * claiming to be over with work outstanding.
 *
 * Bulk and machinery have no box, so there is nothing to wait for and they
 * settle the moment they are delivered.
 */
export async function isEmptyReturnSettled(
  prisma: { emptyReturnCycle: { findUnique(args: unknown): Promise<{ returnedAt: Date | null } | null> } },
  booking: { id: string; containerNumber?: string | null },
): Promise<boolean> {
  if (!booking.containerNumber) return true;
  const cycle = await prisma.emptyReturnCycle.findUnique({
    where: { bookingId: booking.id },
    select: { returnedAt: true },
  });
  return Boolean(cycle?.returnedAt);
}
