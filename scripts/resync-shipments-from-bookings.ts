/**
 * One-off: brings every existing shipment back in line with its own bookings.
 *
 * Three drifts accumulated while `Shipment` and `Booking` moved independently:
 *
 *   1. `status` — a shipment was advanced by its own button, never by its
 *      containers, so shipments sat at "Pending" with every booking delivered
 *      (and the Shippers page counted them as active forever). Recomputed with
 *      the same `deriveShipmentStatus` the service now uses on every write.
 *   2. `containerNumber` / `bookingId` — written once from the wizard's joined
 *      free-text and never updated, so a shipment could claim `MSKU-998210-4`
 *      while its only booking carried `VERIFY-1`, and `bookingId` held a
 *      `Date.now()`-derived `BKG-82071` matching no booking anywhere.
 *   3. `dpcsReference` — a random `DPCS-DJ-####` was minted for every
 *      shipment including Fleetin-direct ones, which put a DPCS badge on all
 *      175 `source: 'custom'` rows. Cleared where the source isn't DPCS.
 *
 * Shipments with no bookings are reported and left alone — there is nothing to
 * derive from, and guessing would be the original bug again.
 *
 * Safe to re-run — a row already consistent is skipped.
 *
 *   npx ts-node scripts/resync-shipments-from-bookings.ts          # report only
 *   npx ts-node scripts/resync-shipments-from-bookings.ts --write  # apply
 */
import { PrismaClient } from '@prisma/client';

import { MANUAL_SHIPMENT_STATUSES, deriveShipmentStatus } from '../src/modules/shipments/shipment-status.util';

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');

async function main() {
  const shipments = await prisma.shipment.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      reference: true,
      status: true,
      source: true,
      dpcsReference: true,
      containerNumber: true,
      bookingId: true,
      completedAt: true,
      bookings: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { status: true, reference: true, containerNumber: true },
      },
    },
  });

  let statusFixed = 0;
  let columnsFixed = 0;
  let dpcsCleared = 0;
  let noBookings = 0;
  const examples: string[] = [];

  for (const shipment of shipments) {
    const data: Record<string, unknown> = {};

    if (shipment.source !== 'dpcs' && shipment.dpcsReference) {
      data.dpcsReference = '';
      dpcsCleared += 1;
    }

    if (shipment.bookings.length === 0) {
      noBookings += 1;
    } else {
      const derived = MANUAL_SHIPMENT_STATUSES.includes(shipment.status)
        ? null
        : deriveShipmentStatus(shipment.bookings.map((b) => b.status));
      if (derived && derived !== shipment.status) {
        data.status = derived;
        if (derived === 'Completed' && !shipment.completedAt) data.completedAt = new Date();
        statusFixed += 1;
        if (examples.length < 8) {
          examples.push(`  ${shipment.reference}: "${shipment.status}" -> "${derived}"`);
        }
      }

      const containerNumber = shipment.bookings.map((b) => b.containerNumber).filter(Boolean).join(', ') || null;
      const bookingId = shipment.bookings.map((b) => b.reference).join(', ');
      if (containerNumber !== shipment.containerNumber || bookingId !== shipment.bookingId) {
        data.containerNumber = containerNumber;
        data.bookingId = bookingId;
        columnsFixed += 1;
      }
    }

    if (WRITE && Object.keys(data).length > 0) {
      await prisma.shipment.update({ where: { id: shipment.id }, data });
    }
  }

  console.log(`${WRITE ? 'Applied' : 'Would apply'} over ${shipments.length} shipments:`);
  console.log(`  status re-derived from bookings : ${statusFixed}`);
  console.log(`  containerNumber/bookingId resynced : ${columnsFixed}`);
  console.log(`  invented dpcsReference cleared  : ${dpcsCleared}`);
  console.log(`  skipped, no bookings to derive from : ${noBookings}`);
  if (examples.length > 0) {
    console.log('\nStatus examples:');
    for (const line of examples) console.log(line);
  }
  if (!WRITE) console.log('\nDry run. Re-run with --write to apply.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
