/**
 * A shipment cannot have been created in the future.
 *
 * The demo book deliberately runs a week or so past today — upcoming work is
 * most of what an operator looks at — and `seed-volume.ts` dated each
 * shipment's `createdAt` 12–36 hours before its own pickup. For a pickup next
 * Tuesday that produced a creation timestamp next Monday, and the Shipments
 * directory sorts newest-created-first, so those rows sat permanently above
 * anything a real person created today. Reported on 2026-09-01 as "I create a
 * shipment and it disappears": it was at row seven, under a wall of work
 * booked for next week.
 *
 * The seed now caps `createdAt` at its own `NOW`, so this cannot recur. This
 * repairs the rows written before that cap.
 *
 * Each affected shipment moves to the moment the book was seeded, approximated
 * by the newest `createdAt` **older than an hour**, with a one-minute step so
 * the group keeps its own order instead of collapsing into a tie. `updatedAt`
 * follows only where it would otherwise land before its own `createdAt`.
 *
 * The hour is what stops this repair from landing on top of the very rows it
 * exists to make room for. The first cut anchored on the newest past row of
 * any kind, which on a live database is the shipment the operator just
 * created — so the demo rows were re-dated to *its* timestamp and shuffled
 * back in among the real ones. Anything created during the current sitting is
 * a person's own work, and seeded rows belong underneath it.
 *
 * Idempotent: a second run finds nothing to do. Local databases only.
 *
 *   npx ts-node prisma/tools/repair-future-shipment-dates.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

/* The seeds do not pull in dotenv, and Prisma loads `.env` for its own
   connection without necessarily exporting it. The guard below is worthless if
   it reads an empty string, so the file is parsed here rather than trusted. */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
    return /^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m.exec(env)?.[1] ?? '';
  } catch {
    return '';
  }
}

const url = databaseUrl();
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  throw new Error(
    `refusing to run against a non-local database: ${url.replace(/:[^:@]*@/, ':***@') || '(unset)'}`,
  );
}

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const future = await prisma.shipment.findMany({
    where: { createdAt: { gt: now } },
    select: { id: true, reference: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  });

  if (future.length === 0) {
    console.log('Nothing to do — no shipment claims a future creation date.');
    return;
  }

  const settled = new Date(now.getTime() - 3_600_000);
  const newestSettled = await prisma.shipment.findFirst({
    where: { createdAt: { lte: settled } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const anchor = newestSettled?.createdAt ?? settled;

  console.log(`${future.length} shipment(s) dated in the future. Anchor ${anchor.toISOString()}\n`);

  for (const [index, row] of future.entries()) {
    /* Strictly below the anchor — `index + 1` — so a repaired row never ties
       with the real shipment it was measured against. */
    const createdAt = new Date(anchor.getTime() - (index + 1) * 60_000);
    const updatedAt = row.updatedAt < createdAt ? createdAt : row.updatedAt;
    await prisma.shipment.update({ where: { id: row.id }, data: { createdAt, updatedAt } });
    console.log(
      `  ${row.reference}  ${row.createdAt.toISOString().slice(0, 16)}  ->  ${createdAt
        .toISOString()
        .slice(0, 16)}`,
    );
  }

  console.log(
    `\nRemaining future-dated shipments: ${await prisma.shipment.count({
      where: { createdAt: { gt: new Date() } },
    })}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
