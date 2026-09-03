/**
 * Demo garages, and the impact they let the book measure.
 *
 * The Fleetin Impact arithmetic needs one fact the demo book never carried:
 * where each transporter's trucks sleep. Without it every realized
 * continuation is recognised and none is measured — the dashboard reads
 * "6 realized matches, 0 km", which is honest and useless as a demonstration.
 *
 * So this gives each of the closed list's ten transporters a garage: a `yard`
 * location dropped in the Djibouti City neighbourhood its address names, then
 * re-judges every pairing so the continuations that happened get their two
 * roads measured. Real deployments record the garage on the transporter's
 * profile; this is the demo's stand-in for that form.
 *
 * Idempotent. A garage already on file — set by an operator, or by an earlier
 * run — is left alone, and a location with the same name is reused rather
 * than duplicated.
 *
 * Local databases only, like every seed here — see seed-target-guard.ts.
 *
 *     pnpm prisma:seed:garages
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { CarbonImpactService } from '../src/modules/emissions/carbon-impact.service';
import { nextReference } from '../src/common/helpers/reference.util';
import { assertSeedTargetIsSafe } from './seed-target-guard';

/**
 * Where each transporter's address puts its yard. Coordinates are the
 * neighbourhood, not a surveyed gate — a demo garage a kilometre off still
 * measures a plausible road, and a real one is set from the map picker.
 */
const GARAGES: { partner: string; suburb: string; latitude: number; longitude: number }[] = [
  { partner: 'GEMINI', suburb: 'PK12', latitude: 11.5418, longitude: 43.0305 },
  { partner: 'Massida Logistics', suburb: 'Zone Industrielle de Boulaos', latitude: 11.5884, longitude: 43.1492 },
  { partner: 'Transit Marill', suburb: 'Boulevard de la République', latitude: 11.5962, longitude: 43.1478 },
  { partner: 'MTI Logistics', suburb: 'Doraleh Corridor', latitude: 11.5897, longitude: 43.0903 },
  { partner: 'Freight Secure Logistics & Services', suburb: 'Balbala', latitude: 11.5619, longitude: 43.1176 },
  { partner: 'J.J. Kothari Logistics', suburb: 'Plateau du Serpent', latitude: 11.6003, longitude: 43.1504 },
  { partner: 'East West Transport', suburb: 'Nagad', latitude: 11.5401, longitude: 43.1502 },
  { partner: 'Trans Nomadia', suburb: 'Avenue Nasser', latitude: 11.5851, longitude: 43.1398 },
  { partner: 'Move One Djibouti', suburb: 'Héron', latitude: 11.6021, longitude: 43.1561 },
  { partner: 'Dita Transit', suburb: 'Ambouli', latitude: 11.5602, longitude: 43.1403 },
];

export async function seedGarages(prisma: PrismaService, impact: CarbonImpactService): Promise<void> {
  const partners = await prisma.partner.findMany({
    where: { deletedAt: null },
    select: { id: true, companyLegalName: true, address: true, garageLocationId: true },
  });

  let created = 0;
  let linked = 0;
  for (const partner of partners) {
    if (partner.garageLocationId) continue;
    const spec = GARAGES.find((g) => g.partner === partner.companyLegalName);
    if (!spec) {
      console.log(`   · ${partner.companyLegalName}: not in the garage list, left without one`);
      continue;
    }

    const name = `${partner.companyLegalName} Garage`;
    let location = await prisma.location.findFirst({ where: { name, deletedAt: null }, select: { id: true } });
    if (!location) {
      location = await prisma.location.create({
        data: {
          reference: await nextReference(prisma.location, 'LOC'),
          name,
          kind: 'yard',
          formattedAddress: partner.address,
          city: 'Djibouti',
          country: 'Djibouti',
          countryCode: 'DJ',
          latitude: spec.latitude,
          longitude: spec.longitude,
          source: 'manual',
          notes: `Transporter garage — ${spec.suburb}. Demo placement; move the pin to the real gate.`,
        },
        select: { id: true },
      });
      created += 1;
    }

    await prisma.partner.update({ where: { id: partner.id }, data: { garageLocationId: location.id } });
    linked += 1;
  }
  console.log(`🏠 ${created} garage locations created, ${linked} transporters linked`);

  const result = await impact.rebuildAll();
  console.log(
    `♻️  Impact re-judged over ${result.evaluated} pairings: ${result.realized} realized (${result.counted} counted), ` +
      `${result.matched} still matched, ${result.notRealized} not realized, ${result.failed} failed`,
  );
}

/**
 * Re-time the welded empties of a book seeded before the weld was physical.
 *
 * `seed-volume.ts` now times a matched empty's collection off its load's own
 * gate-in, so a fresh `--reset` needs none of this. A book seeded before that
 * fix records every welded empty collected days before its load gated in — a
 * truck that went home in between — and the impact record refuses all of
 * them, correctly.
 *
 * For each closed pairing whose two bookings share a transporter, this moves
 * the empty's collection to one to three hours before the load's gate-in and
 * its return to a few hours after that, on the booking, its rungs and the
 * cycle alike — the same three stamps the live rungs write. The load's road
 * is not touched: it is the fixed point the empty is timed against, exactly
 * as the seed now does. Never earlier than the box was stripped.
 *
 * Demo data only, behind a flag, on a local database:
 *
 *     pnpm prisma:seed:garages --align-continuations
 */
export async function alignSeededContinuations(prisma: PrismaService): Promise<void> {
  const HOUR = 3_600_000;
  const cycles = await prisma.emptyReturnCycle.findMany({
    where: { nextBookingId: { not: null }, returnedAt: { not: null } },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      booking: {
        select: {
          id: true,
          reference: true,
          partnerId: true,
          emptyReadyAt: true,
          timeline: { select: { id: true, key: true, timestamp: true } },
        },
      },
      nextBooking: {
        select: { partnerId: true, timeline: { select: { key: true, timestamp: true } } },
      },
    },
  });

  let moved = 0;
  let skipped = 0;
  for (const cycle of cycles) {
    const empty = cycle.booking;
    const next = cycle.nextBooking;
    if (!next || !empty.partnerId || empty.partnerId !== next.partnerId) continue;

    const collectedStep = empty.timeline.find((s) => s.key === 'empty_picked_up' && s.timestamp);
    const closedStep = empty.timeline.find((s) => s.key === 'completion' && s.timestamp);
    const gateIn = next.timeline.find((s) => s.key === 'gate_in' && s.timestamp)?.timestamp;
    if (!collectedStep?.timestamp || !gateIn) continue;

    const gap = gateIn.getTime() - collectedStep.timestamp.getTime();
    const collectedAt =
      gap >= 0 && gap <= 12 * HOUR
        ? collectedStep.timestamp // already one trip — only the stamps below may need repair
        : new Date(gateIn.getTime() - (1 + Math.random() * 2) * HOUR);
    /* The rung, not the column: the seeded `emptyReadyAt` column sits days
       after the box's own "Empty Ready" step on some rows, and the step is
       what the yard's story is told from. */
    const stripped =
      empty.timeline.find((s) => s.key === 'empty_ready' && s.timestamp)?.timestamp?.getTime() ??
      empty.emptyReadyAt?.getTime() ??
      0;
    if (collectedAt.getTime() < stripped + 0.5 * HOUR) {
      skipped += 1;
      console.log(`   · ${cycle.reference}: the load gated in before ${empty.reference} was stripped — left alone`);
      continue;
    }
    const returnedAt = new Date(collectedAt.getTime() + (1.5 + Math.random() * 4.5) * HOUR);

    /* The seeded `emptyReadyAt` column and the cycle's own "matched" stamp
       can both sit AFTER the box was collected — a pairing decided three
       days after the truck left with it. Both are pulled back behind the
       collection, and never before the box was stripped. */
    const readyAt = new Date(stripped);
    const matchedAt = new Date(
      Math.max(stripped + 0.25 * HOUR, collectedAt.getTime() - (0.5 + Math.random() * 2.5) * HOUR),
    );
    const repairs: string[] = [];
    if (collectedAt.getTime() !== collectedStep.timestamp.getTime()) repairs.push('collection re-timed');
    if ((empty.emptyReadyAt?.getTime() ?? 0) > collectedAt.getTime()) repairs.push('emptyReadyAt pulled back');
    if (cycle.createdAt.getTime() > collectedAt.getTime()) repairs.push('matched-at pulled back');
    if (repairs.length === 0) continue;

    await prisma.bookingTimelineStep.update({ where: { id: collectedStep.id }, data: { timestamp: collectedAt } });
    if (closedStep) {
      await prisma.bookingTimelineStep.update({ where: { id: closedStep.id }, data: { timestamp: returnedAt } });
    }
    await prisma.booking.update({
      where: { id: empty.id },
      data: {
        completedAt: returnedAt,
        ...((empty.emptyReadyAt?.getTime() ?? 0) > collectedAt.getTime() ? { emptyReadyAt: readyAt } : {}),
      },
    });
    await prisma.emptyReturnCycle.update({
      where: { id: cycle.id },
      data: {
        returnedAt,
        ...(cycle.createdAt.getTime() > collectedAt.getTime()
          ? { createdAt: matchedAt, matchedAt, emptyReadyAt: readyAt }
          : {}),
      },
    });
    console.log(`   · ${cycle.reference}: ${repairs.join(', ')}`);
    moved += 1;
  }
  console.log(`🕒 ${moved} welded empties re-timed to their loads' gate-in, ${skipped} left alone`);
}

async function main() {
  assertSeedTargetIsSafe('seed-garages.ts');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService);
    if (process.argv.includes('--align-continuations')) await alignSeededContinuations(prisma);
    await seedGarages(prisma, app.get(CarbonImpactService));
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Garage seed failed:', error);
    process.exit(1);
  });
}
