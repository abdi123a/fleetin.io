import { PrismaService } from '../prisma/prisma.service';
import { MANUAL_SHIPMENT_STATUSES, deriveShipmentStatus, timelineKeyForStatus } from './shipment-status.util';

/**
 * Re-reads one shipment from the bookings underneath it: its status, the
 * containers it is carrying, and the booking ids it covers.
 *
 * A plain function rather than a method on `ShipmentsService` on purpose:
 * `BookingsService` and `EmptyReturnsService` both have to call this after
 * they move a booking, and injecting `ShipmentsService` into either would
 * close a dependency cycle (`ShipmentsModule` → `BookingsModule` →
 * `EmptyReturnsModule`). Passing the caller's own `PrismaService` keeps the
 * wiring one-directional and the call sites honest about what they touch.
 *
 * `Shipment.containerNumber`/`bookingId` are legacy single-tier columns that
 * predate `Booking` and are still read by search, sort and the shipper's
 * invoice. They are kept, but no longer written from the wizard's joined
 * free-text — they are derived here, so they can't drift from the real
 * containers the way they had (a shipment claiming `MSKU-998210-4` whose only
 * booking carried `VERIFY-1`).
 *
 * Idempotent, and a no-op when nothing changed — safe to call after every
 * booking write without churning `updatedAt` or stacking timeline rows.
 */
/**
 * The widest a rollup column can be, matching `VarChar(1024)` in the schema.
 *
 * Belt as well as braces. The columns were widened because four containers
 * already overfilled the old 64, but a rollup that grows with the job will
 * always have *some* ceiling — and the place it used to hit it was the worst
 * possible one: this runs inside every booking status write, so a display
 * column overflowing failed the operator's actual work with a database error.
 * Clamping means the worst case is now a truncated string in a legacy display
 * column, which is a cosmetic problem instead of an outage.
 */
const ROLLUP_MAX = 1024;

function clampRollup(value: string): string {
  if (value.length <= ROLLUP_MAX) return value;
  const suffix = '…';
  return value.slice(0, ROLLUP_MAX - suffix.length) + suffix;
}

export async function syncShipmentFromBookings(prisma: PrismaService, shipmentId: string): Promise<void> {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, deletedAt: null },
    select: { id: true, status: true, completedAt: true, containerNumber: true, bookingId: true },
  });
  if (!shipment) return;

  const bookings = await prisma.booking.findMany({
    where: { shipmentId: shipment.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { status: true, reference: true, containerNumber: true },
  });
  if (bookings.length === 0) return;

  // A shipment cancelled or failed by hand stays that way — see
  // `MANUAL_SHIPMENT_STATUSES`. Its container/booking columns are still
  // re-derived below; only the status is frozen.
  const derived = MANUAL_SHIPMENT_STATUSES.includes(shipment.status)
    ? null
    : deriveShipmentStatus(bookings.map((booking) => booking.status));

  const containerNumber = clampRollup(bookings.map((b) => b.containerNumber).filter(Boolean).join(', ')) || null;
  const bookingId = clampRollup(bookings.map((b) => b.reference).join(', '));

  const statusChanged = Boolean(derived) && derived !== shipment.status;
  const columnsChanged = containerNumber !== shipment.containerNumber || bookingId !== shipment.bookingId;
  if (!statusChanged && !columnsChanged) return;

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: {
      ...(statusChanged
        ? {
            status: derived as string,
            // Stamped once, the first time the whole job lands on Completed.
            completedAt: derived === 'Completed' && !shipment.completedAt ? new Date() : undefined,
            timeline: {
              create: {
                key: timelineKeyForStatus(derived as string),
                title: `Status changed to ${derived}`,
                description: `Derived from the ${bookings.length} booking(s) on this shipment`,
                timestamp: new Date(),
                status: 'completed',
              },
            },
          }
        : {}),
      ...(columnsChanged ? { containerNumber, bookingId } : {}),
    },
  });
}
