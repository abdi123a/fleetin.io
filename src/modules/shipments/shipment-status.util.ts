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

const LADDER: Record<string, string> = {
  Pending: 'Assigned',
  Assigned: 'Driver Assigned',
  'Driver Assigned': 'En Route',
  'En Route': 'Arrived',
  Arrived: 'Unloading',
  Unloading: 'POD Submitted',
  'POD Submitted': 'Completed',
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
  return false;
}

/** For the error message when a transition is rejected. */
export function allowedNextShipmentStatuses(current: string): string[] {
  const next = new Set<string>();
  if (LADDER[current]) next.add(LADDER[current]);
  for (const forced of FORCED_ALWAYS_ALLOWED) next.add(forced);
  if (!TERMINAL_STATUSES.includes(current)) {
    for (const target of CANCELLATION_TARGETS) next.add(target);
  }
  next.delete(current);
  return [...next];
}

/**
 * Nearest-fit timeline step key for a status change. `MissionTimelineStep.key`
 * is a closed 10-value union with no 1:1 mapping for every status (e.g.
 * nothing describes "Unloading" or "Cancelled" specifically) — reusing the
 * closest existing key keeps every timeline entry valid rather than inventing
 * new keys the frontend's union type doesn't know about.
 */
const TIMELINE_KEY_BY_STATUS: Record<string, string> = {
  Assigned: 'vehicle_assignment',
  'Driver Assigned': 'driver_assignment',
  'En Route': 'departure',
  Arrived: 'arrival',
  Unloading: 'gate_in',
  'POD Submitted': 'pod_upload',
  Completed: 'completion',
  Cancelled: 'completion',
  Failed: 'completion',
  'Payment Pending': 'booking_confirmation',
};

export function timelineKeyForStatus(status: string): string {
  return TIMELINE_KEY_BY_STATUS[status] ?? 'completion';
}
