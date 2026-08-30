/**
 * The shipment status state machine (BR-2.1/2.2/2.3), ported server-side.
 *
 * Every guard here lived only in a React component (`MissionRowCard.tsx`'s
 * `NEXT_STATUS` map) before this — the store accepted any transition handed
 * to it. Two edges bypass the linear ladder entirely because the (out of
 * scope) Empty Returns module forces them as a side effect of its own
 * workflow: creating a cycle forces a shipment to `Assigned` from any state,
 * and completing one forces `Completed`, skipping every intermediate step.
 * Both must stay legal here or that module's existing behavior breaks the
 * moment it starts calling this endpoint instead of mutating local state.
 */

/**
 * Rank on the happy-path ladder — higher is further along. Used to derive a
 * shipment's status from its bookings (see `deriveShipmentStatus`); the ladder
 * map below still owns which single-step transitions are legal for a booking.
 */
const LADDER_RANK: Record<string, number> = {
  Pending: 0,
  Assigned: 1,
  'Driver Assigned': 2,
  'Heading to Pickup': 3,
  'At Pickup': 4,
  Loading: 5,
  Loaded: 6,
  'En Route': 7,
  Arrived: 8,
  Unloading: 9,
  'POD Submitted': 10,
  /* The box is off the truck and empty. This is the rung the whole return
     side hangs off: it is what puts the container into Empty Return's pool
     and starts its clock, so it is recorded with the time it actually
     happened rather than the time somebody got round to clicking. */
  'Empty Ready': 11,
  /* A truck has the empty and is running it back. Between "the box is free"
     and "the box is home" there was nothing, so a container in transit to the
     depot looked identical to one still sitting at the consignee's yard. */
  'Empty Picked Up': 12,
  Completed: 13,
};

/** A booking that will never move again, and never counts as progress. */
const NEGATIVE_TERMINAL: readonly string[] = ['Cancelled', 'Failed'];

/**
 * The only two statuses a shipment may still be given by hand. Everything on
 * the happy-path ladder is derived from the bookings underneath it
 * (`deriveShipmentStatus`) — a shipment is a job, its bookings are the real
 * container runs, and letting both move independently is what allowed a
 * shipment to read "Pending" while every one of its containers was delivered.
 * Cancelling or failing the whole job is a decision no booking implies, so it
 * stays manual, and it wins: a cancelled shipment is never resurrected by its
 * bookings.
 */
export const MANUAL_SHIPMENT_STATUSES: readonly string[] = ['Cancelled', 'Failed'];

/**
 * A shipment's status, read off the bookings it covers.
 *
 * The **least advanced** live booking wins: a 20-container job is not "En
 * Route" because one truck left, and it is certainly not "Completed" until the
 * last container is. Cancelled/failed bookings are excluded from that minimum
 * — they are not progress and must not hold the whole job back — unless every
 * booking is one, in which case the job itself is over.
 *
 * `null` means "no opinion, leave the shipment alone": no bookings at all
 * (nothing to derive from), or only statuses off the known ladder.
 */
export function deriveShipmentStatus(bookingStatuses: readonly string[]): string | null {
  if (bookingStatuses.length === 0) return null;

  const live = bookingStatuses.filter((status) => !NEGATIVE_TERMINAL.includes(status));
  if (live.length === 0) {
    return bookingStatuses.includes('Cancelled') ? 'Cancelled' : 'Failed';
  }

  let leastAdvanced: string | null = null;
  let lowestRank = Number.POSITIVE_INFINITY;
  for (const status of live) {
    const rank = LADDER_RANK[status];
    if (rank === undefined) continue;
    if (rank < lowestRank) {
      lowestRank = rank;
      leastAdvanced = status;
    }
  }
  return leastAdvanced;
}

/**
 * The rung a booking's own assignments already prove it has reached.
 *
 * The mirror of the guards in `BookingsService.updateStatus`: those stop a
 * status claiming more than the data supports, and this stops the data sitting
 * ahead of the status. A booking with a truck and a driver on it *is* driver-
 * assigned — making somebody click "Mark as Assigned" and then "Mark as Driver
 * Assigned" to restate two facts the record already carries is busywork, and
 * worse, it means the same booking reads differently depending on whether
 * anyone got round to pressing the buttons.
 *
 * Only ever raises, and only within the pre-departure rungs: once a truck is
 * rolling, its position on the ladder is a report of where it is, not an
 * inference from who is on it. Returns `null` when the status already reflects
 * the assignments, or when the booking has moved past them.
 */
export function statusFromAssignments(
  current: string,
  assignments: { hasVehicle: boolean; hasDriver: boolean },
): string | null {
  const earned = assignments.hasVehicle && assignments.hasDriver
    ? 'Driver Assigned'
    : assignments.hasVehicle
      ? 'Assigned'
      : null;
  if (!earned) return null;

  const currentRank = LADDER_RANK[current];
  // Off-ladder (Payment Pending) or terminal (Cancelled/Failed) is left alone.
  if (currentRank === undefined) return null;
  return currentRank < LADDER_RANK[earned]! ? earned : null;
}

const LADDER: Record<string, string> = {
  Pending: 'Assigned',
  Assigned: 'Driver Assigned',
  'Driver Assigned': 'Heading to Pickup',
  'Heading to Pickup': 'At Pickup',
  'At Pickup': 'Loading',
  Loading: 'Loaded',
  Loaded: 'En Route',
  'En Route': 'Arrived',
  Arrived: 'Unloading',
  Unloading: 'POD Submitted',
  'POD Submitted': 'Empty Ready',
  'Empty Ready': 'Empty Picked Up',
  'Empty Picked Up': 'Completed',
};

/** Always reachable from any state — the Empty Returns cross-module edges (BR-2.3). */
const FORCED_ALWAYS_ALLOWED: readonly string[] = ['Assigned', 'Completed'];

const TERMINAL_STATUSES: readonly string[] = ['Completed', 'Cancelled', 'Failed'];

/** Reachable from any non-terminal state — cancelling isn't part of the happy-path ladder. */
const CANCELLATION_TARGETS: readonly string[] = ['Cancelled', 'Failed'];

export function isValidShipmentStatusTransition(current: string, next: string): boolean {
  if (current === next) return false;
  if (LADDER[current] === next) return true;
  if (FORCED_ALWAYS_ALLOWED.includes(next)) return true;
  if (!TERMINAL_STATUSES.includes(current) && CANCELLATION_TARGETS.includes(next)) return true;
  /* Stepping back down the ladder is a **correction**, and the system has to
   * allow one. Somebody marks a truck "At Pickup" a stop early, notices, and
   * needs to put it back — refusing that does not keep the record honest, it
   * just leaves it wrong. Only the rungs below the current one, and never out
   * of a terminal state: undoing a cancellation or reopening a closed mission
   * is a different decision with money attached, not a typo. */
  if (isLadderCorrection(current, next)) return true;
  return false;
}

/** A backwards step within the happy-path ladder — undoing a mis-click. */
export function isLadderCorrection(current: string, next: string): boolean {
  const from = LADDER_RANK[current];
  const to = LADDER_RANK[next];
  if (from === undefined || to === undefined) return false;
  if (TERMINAL_STATUSES.includes(current)) return false;
  return to < from;
}

/** For the error message when a transition is rejected. */
export function allowedNextShipmentStatuses(current: string): string[] {
  const next = new Set<string>();
  if (LADDER[current]) next.add(LADDER[current]);
  for (const forced of FORCED_ALWAYS_ALLOWED) next.add(forced);
  if (!TERMINAL_STATUSES.includes(current)) {
    for (const target of CANCELLATION_TARGETS) next.add(target);
  }
  // Every rung below the current one, so a mis-click can be walked back.
  for (const status of Object.keys(LADDER_RANK)) {
    if (isLadderCorrection(current, status)) next.add(status);
  }
  next.delete(current);
  return [...next];
}

/**
 * Timeline step key for a status change. `MissionTimelineStep.key` is a closed
 * union kept in lockstep with the frontend (`src/types/mission.ts`) — every
 * status that lands a trackable lifecycle event has its own key, because the
 * mission/shipment reports compute stage durations from these timestamps.
 * (`Unloading` used to reuse `gate_in`, which counted unloading time at the
 * destination as waiting time at the pickup terminal.)
 */
const TIMELINE_KEY_BY_STATUS: Record<string, string> = {
  Assigned: 'vehicle_assignment',
  'Driver Assigned': 'driver_assignment',
  'Heading to Pickup': 'left_for_pickup',
  'At Pickup': 'gate_in',
  Loading: 'loading_start',
  Loaded: 'pickup',
  'En Route': 'departure',
  Arrived: 'arrival',
  Unloading: 'unloading_start',
  'POD Submitted': 'pod_upload',
  'Empty Ready': 'empty_ready',
  'Empty Picked Up': 'empty_picked_up',
  Completed: 'completion',
  Cancelled: 'completion',
  Failed: 'completion',
  'Payment Pending': 'booking_confirmation',
};

export function timelineKeyForStatus(status: string): string {
  return TIMELINE_KEY_BY_STATUS[status] ?? 'completion';
}
