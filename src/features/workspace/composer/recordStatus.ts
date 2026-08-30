import { statusBadgeIntentOf } from '@/lib/shipmentStatus';

import type { RecordType } from '../contracts';

export type RecordStatusIntent = 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'default';

/**
 * A record's status, as one of the app's own colour intents.
 *
 * Shipments, bookings and empty-return cycles run on the shared ladder, so
 * they defer to `statusBadgeIntentOf` — the same function the shipment and
 * booking cards use. Getting a second opinion on that ladder is how a booking
 * ends up teal on its card and green on a chip.
 *
 * The register (vehicles, drivers, partners, shippers) has its own short
 * vocabularies, which do not run through that ladder at all and are mapped
 * here. The rule across all of them is the same one the rest of the app
 * follows: green is fine, amber is waiting on somebody, red is stopped.
 */
export function recordStatusIntent(type: RecordType, status: string | null | undefined): RecordStatusIntent {
  if (!status) return 'default';

  switch (type) {
    case 'SHIPMENT':
    case 'BOOKING':
    case 'EMPTY_RETURN_CYCLE':
      return statusBadgeIntentOf(status);

    /* Vehicles and drivers share one vocabulary — the schema says so. */
    case 'VEHICLE':
    case 'DRIVER':
      switch (status) {
        case 'Available': return 'success';
        case 'In Transit': return 'primary';
        case 'Under Maintenance': return 'warning';
        case 'Out of Service': return 'destructive';
        default: return 'default';
      }

    case 'PARTNER':
      switch (status) {
        case 'Active': return 'success';
        case 'Pending': return 'warning';
        case 'Suspended': return 'destructive';
        default: return 'default';
      }

    case 'SHIPPER':
      switch (status) {
        case 'Verified': return 'success';
        case 'Pending': return 'warning';
        case 'Suspended':
        case 'Canceled': return 'destructive';
        default: return 'default';
      }

    case 'INVOICE':
      switch (status) {
        case 'Paid': return 'success';
        case 'Overdue': return 'destructive';
        case 'Issued':
        case 'Sent': return 'primary';
        default: return 'default';
      }

    /* A hold is the one record whose *open* state is the alarming one. */
    case 'PAYOUT_HOLD':
      return status === 'Cleared' ? 'success' : 'destructive';

    default:
      return 'default';
  }
}
