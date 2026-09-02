/**
 * One-off: replace every guessed shipment distance with a measured one.
 *
 * `estimatedDistanceKm` on the existing book was never measured. Shipments
 * created through the wizard got `distanceForDropoff()` — a substring match on
 * the drop-off's name returning 10, 15, 20 or 25 — and the rest carry whatever
 * the seed invented. Nothing prices off it (a shipment is billed containers ×
 * the transporter's per-mission rate), but `lib/shipmentDistance.ts` multiplies
 * it by the container count and BI charts it as `Route.distanceKm`, so a wrong
 * number is wrong on every screen that reports road use.
 *
 * `20260902190300_link_shipments_to_locations` pointed every shipment at its
 * catalogue rows. This measures the road between them and writes it back.
 *
 * ## The rule this script is built around
 *
 * **It only overwrites when Google actually answers with a road.** Without a
 * `GOOGLE_MAPS_API_KEY` the Locations service falls back to the straight line,
 * which on this corridor runs about a third short — trading one wrong number
 * for a differently wrong number, and this time one that LOOKS authoritative.
 * So a `haversine` result is reported and skipped. Running this before the key
 * is set is therefore harmless and does nothing; running it after is the fix.
 *
 * Also skipped, deliberately:
 *   - `estimatedDistanceSource = 'manual'` — an operator stood behind that
 *     figure, and a batch job does not get to overrule a person.
 *   - shipments missing either link — there is nothing to measure between, and
 *     the text snapshot still reads.
 *
 * Measurements go through `LocationsService`, not a private copy of the Routes
 * call, so they land in the same `location_distances` cache the shipment form
 * reads. A corridor of this size is a few dozen distinct lanes; the hundredth
 * shipment down a lane costs nothing.
 *
 * Safe to re-run — a shipment already carrying a Google-measured distance is
 * skipped.
 *
 *   npx ts-node scripts/backfill-shipment-distances.ts          # report only
 *   npx ts-node scripts/backfill-shipment-distances.ts --write  # apply
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { LocationsService } from '../src/modules/locations/locations.service';

const WRITE = process.argv.includes('--write');

async function main() {
  /* An application context, not a server: this needs the DI graph so
     `LocationsService` arrives fully wired, but nothing should start listening
     on a port while a maintenance script runs. */
  Logger.overrideLogger(['warn', 'error']);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const locations = app.get(LocationsService);

    const { googleConfigured } = locations.status();
    console.log(
      googleConfigured
        ? '→ Google Maps key found — measuring real road distances.'
        : '→ No GOOGLE_MAPS_API_KEY. Every lane will fall back to a straight line,\n' +
            '  which this script refuses to write. Nothing will change. Set the key first.',
    );
    console.log(WRITE ? '→ WRITE mode: changes will be saved.\n' : '→ Report only. Pass --write to apply.\n');

    const shipments = await prisma.shipment.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        reference: true,
        pickupLocationId: true,
        deliveryLocationId: true,
        pickupLocationName: true,
        deliveryLocationName: true,
        estimatedDistanceKm: true,
        estimatedDistanceSource: true,
        estimatedDurationHours: true,
      },
      orderBy: { reference: 'asc' },
    });

    let measured = 0;
    let unchanged = 0;
    let skippedManual = 0;
    let skippedUnlinked = 0;
    let skippedNoRoad = 0;
    let failed = 0;
    const changes: string[] = [];

    for (const shipment of shipments) {
      if (shipment.estimatedDistanceSource === 'manual') {
        skippedManual += 1;
        continue;
      }
      if (!shipment.pickupLocationId || !shipment.deliveryLocationId) {
        skippedUnlinked += 1;
        continue;
      }
      if (shipment.pickupLocationId === shipment.deliveryLocationId) {
        /* A shipment that starts and ends at the same place has no road to
           measure. Rare, and not this script's problem to diagnose. */
        skippedUnlinked += 1;
        continue;
      }

      let result;
      try {
        result = await locations.distanceBetween(
          shipment.pickupLocationId,
          shipment.deliveryLocationId,
        );
      } catch (error) {
        failed += 1;
        console.warn(`   ${shipment.reference}: ${(error as Error).message}`);
        continue;
      }

      if (result.provider !== 'google') {
        skippedNoRoad += 1;
        continue;
      }

      const sameDistance = Math.abs(result.distanceKm - shipment.estimatedDistanceKm) < 0.05;
      const sameDuration =
        (result.durationLabel ?? '') === (shipment.estimatedDurationHours ?? '');
      if (sameDistance && sameDuration && shipment.estimatedDistanceSource === 'google') {
        unchanged += 1;
        continue;
      }

      changes.push(
        `   ${shipment.reference}  ${shipment.pickupLocationName} → ${shipment.deliveryLocationName}\n` +
          `      ${shipment.estimatedDistanceKm} km (${shipment.estimatedDistanceSource})` +
          `  →  ${result.distanceKm} km (google${result.durationLabel ? `, ${result.durationLabel}` : ''})`,
      );

      if (WRITE) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            estimatedDistanceKm: result.distanceKm,
            estimatedDistanceSource: 'google',
            estimatedDurationHours: result.durationLabel ?? shipment.estimatedDurationHours,
          },
        });
      }
      measured += 1;
    }

    if (changes.length > 0) {
      console.log(WRITE ? 'Measured:' : 'Would measure:');
      changes.forEach((line) => console.log(line));
      console.log('');
    }

    console.log(
      [
        `${shipments.length} shipments examined`,
        `${measured} ${WRITE ? 'measured' : 'would be measured'}`,
        `${unchanged} already correct`,
        `${skippedManual} skipped (operator's own figure)`,
        `${skippedUnlinked} skipped (not linked to two locations)`,
        `${skippedNoRoad} skipped (no road route — straight line refused)`,
        `${failed} failed`,
      ].join('\n'),
    );

    if (!WRITE && measured > 0) {
      console.log('\nNothing was written. Re-run with --write to apply.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
