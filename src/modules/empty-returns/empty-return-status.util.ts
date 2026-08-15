/**
 * A booking counts as "delivered" — eligible to become an empty — at exactly
 * these statuses. Mirrors `DELIVERED_SHIPMENT_STATUSES` from the frontend
 * bridge this backend module replaces.
 */
export const DELIVERED_STATUSES = ['Arrived', 'Unloading', 'POD Submitted', 'Completed'];

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
    case 'En Route':
      return 'in_progress';
    default:
      return DELIVERED_STATUSES.includes(status) ? 'completed' : null;
  }
}
