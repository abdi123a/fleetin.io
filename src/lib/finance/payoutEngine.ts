/**
 * The payout state machine.
 *
 * The stations, after the 2026-08-13 restructure:
 *
 *   BOOKING:   in transit → delivered → proven (both PoD documents)
 *   SHIPMENT:  awaiting PoD → ready → released → settled
 *
 * Proof is per container; MONEY IS PER SHIPMENT. Twenty containers are proven
 * twenty times and released once, then each transporter is paid once for
 * everything they carried — not once per container. `settlementsFor` is where
 * that grouping happens and it is the reason this file was rewritten.
 *
 * Four rules here are load-bearing and non-negotiable:
 *
 * 1. Proof of delivery is the ONLY hard precondition for money leaving, and it
 *    means BOTH proofs on EVERY booking: the signed delivery note and the
 *    photograph, for each container. A shipment with one unproven container
 *    cannot release; callers must name the container rather than greying a
 *    button, because that gap is an operations failure creating a financial
 *    liability.
 * 2. A hold PAUSES the validation counter — it never resets it. When the hold
 *    clears, the counter resumes where it stopped. (A dispute must not cost
 *    the transporter their entire wait.)
 * 3. The 48-hour window ADVISES; it does not block. It is the period during
 *    which a client may dispute, so the desk watches it — but the desk can
 *    always pay a trusted transporter immediately, and the engine records that
 *    the release was early rather than refusing it. The only things that can
 *    stop money are: an unproven booking, or an open dispute.
 * 4. A settlement is DERIVED from cost lines every time it is read. It is never
 *    stored, because a stored total could drift from the lines it claims to sum
 *    — and this is the total a transporter signs a receipt for.
 *
 * Everything is pure: `(record, now) -> value` or `(record, event) -> record`.
 * The store applies transitions; no function here mutates.
 */

import type {
  BookingStage,
  CostLine,
  DeliveryProof,
  FinanceBooking,
  FinanceShipment,
  PaymentMethod,
  PayoutHold,
  PodDocument,
  PodDocumentKind,
  SettlementLine,
  SettlementStatus,
  ShipmentPayout,
  ShipmentStage,
  TransporterSettlement,
} from '@/types/finance';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** The review period the desk watches. Advisory — see rule 3. */
export const VALIDATION_WINDOW_MS = 48 * HOUR_MS;
/** How close to the window's end counts as "about to close" — the reminder. */
export const WINDOW_REMINDER_MS = 6 * HOUR_MS;

const toMs = (iso: string): number => new Date(iso).getTime();
const iso = (ms: number): string => new Date(ms).toISOString();

// ─── Proof of delivery (per booking) ────────────────────────────────────────

/** Both, always. Neither proof substitutes for the other — see `PodDocument`. */
export const POD_DOCUMENT_KINDS: readonly PodDocumentKind[] = ['signed_pdf', 'delivery_photo'];

export const POD_DOCUMENT_LABEL: Record<PodDocumentKind, string> = {
  signed_pdf: 'Signed delivery note (PDF)',
  delivery_photo: 'Photo of the delivery',
};

/** Which proofs are still missing on this container. Empty means confirmable. */
export function missingPodDocuments(proof: DeliveryProof): PodDocumentKind[] {
  const held = new Set((proof.podDocuments ?? []).map((doc) => doc.kind));
  return POD_DOCUMENT_KINDS.filter((kind) => !held.has(kind));
}

export function hasCompletePod(proof: DeliveryProof): boolean {
  return missingPodDocuments(proof).length === 0;
}

/** Derived, never stored: the record cannot contradict its own history. */
export function bookingStage(proof: DeliveryProof): BookingStage {
  if (proof.podSentAt) return 'proven';
  if (proof.completedAt) return 'awaiting_pod';
  return 'in_transit';
}

export function isProven(booking: FinanceBooking): boolean {
  return booking.proof.podSentAt !== undefined;
}

/**
 * The containers standing between this shipment and its release.
 *
 * Returned as records, not a count, so the UI can NAME them. "Release blocked"
 * is useless; "BKG-00412 (Dire Dawa) has no signed note" is actionable.
 */
export function unprovenBookings(bookings: FinanceBooking[]): FinanceBooking[] {
  return bookings.filter((booking) => !isProven(booking));
}

/**
 * When the consignment became complete: the latest PoD across its bookings,
 * defined only once EVERY booking is proven.
 *
 * This is the moment the shipment's review window starts and the moment the
 * shipper becomes billable — not the first container's arrival, which proves
 * nothing about the consignment.
 */
export function shipmentProvenAt(bookings: FinanceBooking[]): string | undefined {
  if (bookings.length === 0) return undefined;
  let latest: string | undefined;
  for (const booking of bookings) {
    const sent = booking.proof.podSentAt;
    if (!sent) return undefined;
    if (!latest || sent > latest) latest = sent;
  }
  return latest;
}

// ─── Holds (per shipment) ───────────────────────────────────────────────────

export function activeHolds(payout: ShipmentPayout): PayoutHold[] {
  return payout.holds.filter((hold) => !hold.clearedAt);
}

export function isHeld(payout: ShipmentPayout): boolean {
  return activeHolds(payout).length > 0;
}

/**
 * Milliseconds of [startMs, endMs] covered by holds, with overlapping holds
 * union-merged so concurrent holds never double-count the pause.
 */
function heldMsBetween(holds: PayoutHold[], startMs: number, endMs: number): number {
  const intervals = holds
    .map((hold) => ({
      from: Math.max(toMs(hold.raisedAt), startMs),
      to: Math.min(hold.clearedAt ? toMs(hold.clearedAt) : endMs, endMs),
    }))
    .filter((interval) => interval.to > interval.from)
    .sort((a, b) => a.from - b.from);

  let total = 0;
  let cursorFrom = Number.NEGATIVE_INFINITY;
  let cursorTo = Number.NEGATIVE_INFINITY;
  for (const interval of intervals) {
    if (interval.from > cursorTo) {
      total += cursorTo - cursorFrom > 0 ? cursorTo - cursorFrom : 0;
      cursorFrom = interval.from;
      cursorTo = interval.to;
    } else {
      cursorTo = Math.max(cursorTo, interval.to);
    }
  }
  total += cursorTo - cursorFrom > 0 ? cursorTo - cursorFrom : 0;
  return total;
}

// ─── The validation clock (per shipment) ────────────────────────────────────

export interface ValidationClock {
  /** False until every booking is proven — an incomplete shipment has no clock. */
  started: boolean;
  /** Unheld time accumulated inside the window, capped at the window. */
  elapsedMs: number;
  remainingMs: number;
  /** True while an uncleared hold is pausing the counter. */
  paused: boolean;
  /** Window fully elapsed — the payout is overdue for release. */
  expired: boolean;
  /**
   * Inside the last stretch before the window closes. This is the REMINDER the
   * desk acts on — not a permission, which it already has.
   */
  closingSoon: boolean;
  /**
   * Wall-clock moment the window will close if nothing else pauses it.
   * Null while paused (no honest projection exists) or before the shipment is
   * fully proven.
   */
  closesAt: number | null;
}

const STOPPED_CLOCK = (windowMs: number): ValidationClock => ({
  started: false,
  elapsedMs: 0,
  remainingMs: windowMs,
  paused: false,
  expired: false,
  closingSoon: false,
  closesAt: null,
});

export function validationClock(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  nowMs: number,
  windowMs: number = VALIDATION_WINDOW_MS,
): ValidationClock {
  const provenAt = shipmentProvenAt(bookings);
  if (!provenAt) return STOPPED_CLOCK(windowMs);

  const startMs = toMs(provenAt);
  // A released shipment's clock froze at release.
  const releasedAt = shipment.payout.releasedAt;
  const endMs = releasedAt ? Math.min(toMs(releasedAt), nowMs) : nowMs;
  const gross = Math.max(0, endMs - startMs);
  const held = heldMsBetween(shipment.payout.holds, startMs, endMs);
  const elapsed = Math.min(windowMs, Math.max(0, gross - held));
  const remaining = Math.max(0, windowMs - elapsed);
  const paused = !releasedAt && isHeld(shipment.payout);

  return {
    started: true,
    elapsedMs: elapsed,
    remainingMs: remaining,
    paused,
    expired: remaining === 0,
    closingSoon: !paused && !releasedAt && remaining > 0 && remaining <= WINDOW_REMINDER_MS,
    closesAt: paused || releasedAt ? null : nowMs + remaining,
  };
}

/** Days a delivered container has sat with no proof of delivery. */
export function daysAwaitingPod(proof: DeliveryProof, nowMs: number): number {
  if (proof.podSentAt || !proof.completedAt) return 0;
  return Math.max(0, Math.floor((nowMs - toMs(proof.completedAt)) / DAY_MS));
}

/** The longest any container on this shipment has waited for its proof. */
export function shipmentDaysAwaitingPod(bookings: FinanceBooking[], nowMs: number): number {
  return bookings.reduce((worst, booking) => Math.max(worst, daysAwaitingPod(booking.proof, nowMs)), 0);
}

// ─── Stage ──────────────────────────────────────────────────────────────────

/** Every cost line on the shipment, flattened. The settlement raw material. */
export function shipmentCostLines(bookings: FinanceBooking[]): CostLine[] {
  return bookings.flatMap((booking) => booking.costLines);
}

/** Derived, never stored. */
export function shipmentStage(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
): ShipmentStage {
  if (shipment.payout.releasedAt) {
    const lines = shipmentCostLines(bookings);
    // A shipment with nothing to pay is settled the moment it is released.
    return lines.every((line) => line.paidAt) ? 'settled' : 'released';
  }
  if (bookings.length > 0 && unprovenBookings(bookings).length === 0) return 'ready';
  return 'awaiting_pod';
}

// ─── Release guards ─────────────────────────────────────────────────────────

/**
 * The only things that stop a shipment's money.
 *
 * `window_open` is deliberately absent: an open validation window is a state to
 * be told about, not a refusal. See rule 3 at the top of this file.
 */
export type ReleaseBlocker = 'already_released' | 'no_bookings' | 'incomplete_pod' | 'held';

/** Null means the release button is live. */
export function releaseBlocker(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
): ReleaseBlocker | null {
  if (shipment.payout.releasedAt) return 'already_released';
  if (bookings.length === 0) return 'no_bookings';
  // Every container, both proofs. One unproven booking blocks the consignment.
  if (unprovenBookings(bookings).length > 0) return 'incomplete_pod';
  if (isHeld(shipment.payout)) return 'held'; // a disputed shipment is the real block
  return null;
}

export function canRelease(shipment: FinanceShipment, bookings: FinanceBooking[]): boolean {
  return releaseBlocker(shipment, bookings) === null;
}

/**
 * Releasing now would close the review period early.
 *
 * Not a warning that something is wrong — early release is the normal, wanted
 * path for a transporter the desk trusts. It exists so the UI can say what it
 * is doing and the record can show the window was shortened by a decision
 * rather than elapsed on its own.
 */
export function isEarlyRelease(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  nowMs: number,
  windowMs: number = VALIDATION_WINDOW_MS,
): boolean {
  if (shipment.payout.releasedAt) return false;
  return !validationClock(shipment, bookings, nowMs, windowMs).expired;
}

/** Derived, never stored: was this release taken before its window closed? */
export function wasReleasedEarly(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  windowMs: number = VALIDATION_WINDOW_MS,
): boolean {
  const releasedAt = shipment.payout.releasedAt;
  if (!releasedAt) return false;
  const clock = validationClock(shipment, bookings, toMs(releasedAt), windowMs);
  return clock.started && !clock.expired;
}

// ─── Settlement: the per-transporter aggregate ──────────────────────────────

/**
 * What each transporter is owed for this shipment, as ONE row each.
 *
 * This is the function the restructure exists for. A shipment of twenty
 * containers split between two hauliers produces exactly two rows — ten
 * bookings and their total, ten bookings and their total — not twenty payments
 * to click through. The port handling firm and the escort come out as their own
 * rows on the same basis, because they are counterparties too.
 *
 * Grouped by `counterpartyId`, so a transporter that also did the handling on
 * one container appears once, with both amounts in the same total: he is one
 * party, owed one sum, paid once.
 *
 * Sorted by size, descending — the biggest obligation is the one the desk is
 * looking for.
 */
export function settlementsFor(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
): TransporterSettlement[] {
  const released = shipment.payout.releasedAt !== undefined;
  const held = isHeld(shipment.payout);
  const byParty = new Map<string, { name: string; lines: SettlementLine[] }>();

  for (const booking of bookings) {
    // One line per (booking × counterparty): a container's transport and its
    // handling by the same firm collapse into that firm's single line here.
    const perParty = new Map<string, { name: string; amountDjf: number; costLineIds: string[]; paidAt?: string }>();
    for (const line of booking.costLines) {
      const entry = perParty.get(line.counterpartyId) ?? {
        name: line.counterpartyName,
        amountDjf: 0,
        costLineIds: [],
      };
      entry.amountDjf += line.amountDjf;
      entry.costLineIds.push(line.id);
      // A booking line reads as paid only when every one of its parts is.
      if (line.paidAt && (entry.paidAt === undefined || line.paidAt > entry.paidAt)) {
        entry.paidAt = line.paidAt;
      }
      perParty.set(line.counterpartyId, entry);
    }

    for (const [partyId, entry] of perParty) {
      const allPaid = booking.costLines
        .filter((line) => line.counterpartyId === partyId)
        .every((line) => line.paidAt);
      const bucket = byParty.get(partyId) ?? { name: entry.name, lines: [] };
      bucket.lines.push({
        bookingId: booking.id,
        containerNumber: booking.containerNumber,
        destination: booking.destination,
        cargoSummary: booking.cargoSummary,
        amountDjf: entry.amountDjf,
        paidAt: allPaid ? entry.paidAt : undefined,
        costLineIds: entry.costLineIds,
      });
      byParty.set(partyId, bucket);
    }
  }

  const settlements: TransporterSettlement[] = [];
  for (const [transporterId, bucket] of byParty) {
    const totalDjf = bucket.lines.reduce((sum, line) => sum + line.amountDjf, 0);
    const paidDjf = bucket.lines.reduce((sum, line) => sum + (line.paidAt ? line.amountDjf : 0), 0);
    const outstanding = totalDjf - paidDjf;
    // Held or unreleased money is NEVER presented as payable — it is real
    // money that cannot move, and calling it payable would misstate the day.
    const payableDjf = released && !held ? outstanding : 0;

    let status: SettlementStatus;
    if (totalDjf > 0 && outstanding === 0) status = 'paid';
    else if (!released || held) status = 'blocked';
    else if (paidDjf > 0) status = 'part_paid';
    else status = 'payable';

    settlements.push({
      transporterId,
      transporterName: bucket.name,
      lines: bucket.lines,
      bookingsCount: bucket.lines.length,
      totalDjf,
      paidDjf,
      payableDjf,
      status,
      paymentId: paymentIdOf(bucket.lines, bookings),
    });
  }

  return settlements.sort((a, b) => b.totalDjf - a.totalDjf);
}

/** The voucher a settlement was paid under, when one reference covers it all. */
function paymentIdOf(lines: SettlementLine[], bookings: FinanceBooking[]): string | undefined {
  const ids = new Set<string>();
  const wanted = new Set(lines.flatMap((line) => line.costLineIds));
  for (const booking of bookings) {
    for (const line of booking.costLines) {
      if (wanted.has(line.id) && line.paymentId) ids.add(line.paymentId);
    }
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

/** One settlement out of the list, or undefined if that party isn't on it. */
export function settlementFor(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  transporterId: string,
): TransporterSettlement | undefined {
  return settlementsFor(shipment, bookings).find(
    (settlement) => settlement.transporterId === transporterId,
  );
}

/** Everything still owed on a shipment, whatever its state. */
export function outstandingDjf(bookings: FinanceBooking[]): number {
  return shipmentCostLines(bookings).reduce(
    (sum, line) => sum + (line.paidAt ? 0 : line.amountDjf),
    0,
  );
}

// ─── Transitions ────────────────────────────────────────────────────────────

/**
 * PoD confirmed for one container.
 *
 * Refuses without both proofs. The documents arrive WITH the transition rather
 * than being attached afterwards, so `podSentAt` can never exist without the
 * evidence behind it. Whether this was the LAST container — and so whether the
 * shipment is now billable and releasable — is the caller's question, answered
 * by `shipmentProvenAt`.
 */
export function withPodConfirmed(
  booking: FinanceBooking,
  atMs: number,
  documents: PodDocument[],
): FinanceBooking {
  if (booking.proof.podSentAt) return booking;
  const next = { ...booking.proof, podDocuments: documents };
  if (!hasCompletePod(next)) return booking;
  return {
    ...booking,
    proof: {
      ...next,
      // Proof implies the work finished; a booking proven without a completion
      // stamp is legacy data, so backfill rather than leave the gap.
      completedAt: next.completedAt ?? iso(atMs),
      podSentAt: iso(atMs),
    },
  };
}

/** The container arrived; its proof is still to come. */
export function withBookingCompleted(booking: FinanceBooking, atMs: number): FinanceBooking {
  if (booking.proof.completedAt) return booking;
  return { ...booking, proof: { ...booking.proof, completedAt: iso(atMs) } };
}

export function withHold(
  shipment: FinanceShipment,
  hold: Omit<PayoutHold, 'id'> & { id: string },
): FinanceShipment {
  if (shipment.payout.releasedAt) return shipment; // money already left
  return {
    ...shipment,
    payout: { ...shipment.payout, holds: [...shipment.payout.holds, hold] },
  };
}

/** Clearing resumes the counter where it stopped — never from zero. */
export function withHoldCleared(
  shipment: FinanceShipment,
  holdId: string,
  atMs: number,
  clearedBy: string,
): FinanceShipment {
  return {
    ...shipment,
    payout: {
      ...shipment.payout,
      holds: shipment.payout.holds.map((hold) =>
        hold.id === holdId && !hold.clearedAt
          ? { ...hold, clearedAt: iso(atMs), clearedBy }
          : hold,
      ),
    },
  };
}

/**
 * One release for the whole consignment.
 *
 * Guarded on proof and disputes only — NOT on the clock. The desk releasing at
 * hour 3 of 48 is a supported decision, and `wasReleasedEarly` reads it back
 * off the record afterwards.
 */
export function withShipmentReleased(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  atMs: number,
  releasedBy: string,
): FinanceShipment {
  if (!canRelease(shipment, bookings)) return shipment;
  return {
    ...shipment,
    payout: { ...shipment.payout, releasedAt: iso(atMs), releasedBy },
  };
}

export interface SettlementPaymentDetails {
  paymentId: string;
  atMs: number;
  method: PaymentMethod;
  paymentRef?: string;
}

/**
 * Pay one transporter for everything they carried on this shipment.
 *
 * Marks every unpaid line that party holds across EVERY booking of the shipment
 * — ten containers become one stamp, under one `PAY-#####` reference — and
 * returns the updated bookings. Refuses (returns the input untouched) unless
 * the shipment is released and unheld, so this can never be the thing that
 * lets held money out.
 */
export function withSettlementPaid(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  transporterId: string,
  details: SettlementPaymentDetails,
): FinanceBooking[] {
  if (!shipment.payout.releasedAt || isHeld(shipment.payout)) return bookings;
  const paidAt = iso(details.atMs);
  let touched = false;

  const next = bookings.map((booking) => {
    if (booking.shipmentId !== shipment.id) return booking;
    if (!booking.costLines.some((line) => line.counterpartyId === transporterId && !line.paidAt)) {
      return booking;
    }
    touched = true;
    return {
      ...booking,
      costLines: booking.costLines.map((line) =>
        line.counterpartyId === transporterId && !line.paidAt
          ? {
              ...line,
              paidAt,
              paidVia: details.method,
              paymentId: details.paymentId,
              paymentRef: details.paymentRef,
            }
          : line,
      ),
    };
  });

  return touched ? next : bookings;
}

// ─── Cost-line status ───────────────────────────────────────────────────────

/**
 * 'blocked' — the shipment is not released (or is held); nothing may be paid.
 * 'payable' — released and unpaid: real money waiting to leave.
 * 'paid'    — done, with its date and voucher on the line.
 *
 * Kept for the booking detail view, which shows what a container cost. It is
 * NOT a payment control any more: paying happens on the shipment, per party.
 */
export type CostLineStatus = 'blocked' | 'payable' | 'paid';

export function costLineStatus(payout: ShipmentPayout, line: CostLine): CostLineStatus {
  if (line.paidAt) return 'paid';
  return payout.releasedAt && !isHeld(payout) ? 'payable' : 'blocked';
}
