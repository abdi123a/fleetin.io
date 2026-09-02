import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import type { EmptyReturnCycleRecord } from './api/emptyReturnsService';

/**
 * Where a delivered container sits on its way back to the depot.
 *
 * Lifted out of `ShipmentOverviewPage` on 2026-09-02. It was never page code:
 * it is a rule about bookings and cycles, it decides what a card is allowed to
 * offer, and — the reason it moved — it could not be tested where it was. The
 * suite is deliberately pure TypeScript with no DOM (see `vitest.config.ts`),
 * so a rule living inside a React page is a rule pinned by inspection only.
 * `src/features/empty-returns` is already included for exactly this: matching
 * rules "are the kind that get loosened in a hurry".
 *
 * This is a read of Empty Return's already-real data — a matched cycle, or the
 * standalone flag — never a new status of its own.
 */
export type EmptyReturnStage =
  | 'awaiting_empty'
  | 'waiting_match'
  | 'matched'
  | 'returned'
  | 'standalone';

/**
 * Mirrors the backend's `DELIVERED_STATUSES` (`empty-return-status.util.ts`) —
 * the same boundary Empty Return itself uses to decide when a booking's
 * container is even eligible to go back.
 *
 * **`Empty Picked Up` was missing from this copy until 2026-09-02**, and the
 * backend has always had it. The drift was invisible on every other rung and
 * plainly wrong on that one: a container whose return had been arranged lost
 * its mark the moment a truck actually collected it, and got it back only once
 * the box was logged home. The one stretch of the journey where "how is this
 * going back" is a live question was the stretch that answered it with nothing.
 *
 * `containerState` already knew — `EMPTY_RUNGS` in `lib/containerState.ts`
 * lists `Empty Ready` AND `Empty Picked Up` — so the two rules disagreed about
 * the same box. Pinned by `returnStage.test.ts`, which names all six.
 */
const DELIVERED_STATUSES = [
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Empty Ready',
  'Empty Picked Up',
  'Completed',
];

export function emptyReturnStageOf(
  booking: Pick<
    BookingRecord,
    'containerNumber' | 'status' | 'emptyReadyAt' | 'emptyReturnException'
  >,
  cycle: Pick<EmptyReturnCycleRecord, 'returnedAt'> | undefined,
): EmptyReturnStage | undefined {
  // No box, no empty return. A bulk or machinery load has nothing to give
  // back, so the row simply does not apply — it used to read "Awaiting match"
  // on tipper loads, inventing an obligation that will never exist.
  if (!booking.containerNumber) return undefined;
  if (!DELIVERED_STATUSES.includes(booking.status)) return undefined;

  /* The return starts when Operations says the box was emptied — the "Empty
   * Ready" rung — not when the truck pulled up. Until then the container is
   * still being stripped and there is nothing to match it against.
   *
   * This line is what stops a card offering "Book return" on a box that is
   * still full. The user set the rule explicitly on 2026-09-02: a container
   * that is Delivered or Unstuffing cannot be booked a return, because there is
   * nothing to send back yet. `emptyReadyAt` IS that fact — a recorded moment,
   * not an inference from the status label — so the gate is here and every
   * caller inherits it rather than re-deriving it from a status list. */
  if (!booking.emptyReadyAt) return 'awaiting_empty';

  // `returnedAt` is the fact that the box is home; the cycle's own status can
  // read "completed" for the leg that carried it while the box itself is not
  // yet logged back.
  if (cycle) return cycle.returnedAt ? 'returned' : 'matched';
  if (booking.emptyReturnException) return 'standalone';
  return 'waiting_match';
}
