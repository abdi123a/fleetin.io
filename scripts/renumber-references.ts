/**
 * One-off: renumbers every reference already in the database into the short
 * `AAA-#####` scheme (`src/common/helpers/reference.util.ts`).
 *
 * `MSN-2026-8802` -> `MSN-08802`, `INV-2026-1` -> `INV-00001`,
 * `BKG-1180` -> `BKG-01180`, `DRV-001` -> `DRV-00001`.
 *
 * The trailing run of digits is kept rather than a fresh sequence handed out,
 * so a reference someone has already written on paper still points at the same
 * row. Where two rows collapse onto the same number — `BKG-1180` and
 * `BKG-2026-1180` both want `BKG-01180` — the first keeps it and the second is
 * pushed to the next free slot.
 *
 * SHP/PTR are deliberately untouched: those are party join keys four modules
 * read, and renaming them is a migration, not a renumbering.
 *
 * Safe to re-run — a row already in the target shape is skipped.
 *
 *   npx ts-node scripts/renumber-references.ts          # report only
 *   npx ts-node scripts/renumber-references.ts --write  # apply
 */
import { PrismaClient } from '@prisma/client';

import { ID_DIGITS, ID_MAX, formatReference } from '../src/common/helpers/reference.util';

const prisma = new PrismaClient();

/** Each table's human-readable id column, and the prefix it should carry. */
const TARGETS = [
  { model: 'shipment', field: 'reference', prefix: 'MSN' },
  { model: 'booking', field: 'reference', prefix: 'BKG' },
  { model: 'project', field: 'reference', prefix: 'PRJ' },
  { model: 'emptyReturnCycle', field: 'reference', prefix: 'CYC' },
  { model: 'emptyReturnChain', field: 'reference', prefix: 'CHN' },
  { model: 'vehicle', field: 'reference', prefix: 'VEH' },
  { model: 'driver', field: 'reference', prefix: 'DRV' },
  { model: 'invoice', field: 'number', prefix: 'INV' },
  { model: 'payment', field: 'number', prefix: 'PAY' },
  { model: 'paymentOrder', field: 'number', prefix: 'PO' },
  { model: 'drawdown', field: 'number', prefix: 'DD' },
  { model: 'creditFacility', field: 'facilityNumber', prefix: 'CF' },
] as const;

const alreadyShort = (value: string, prefix: string) =>
  new RegExp(`^${prefix}-\\d{${ID_DIGITS}}$`).test(value);

function sequenceOf(value: string): number | null {
  const digits = /(\d+)(?!.*\d)/.exec(value)?.[1];
  if (!digits) return null;
  const n = parseInt(digits.slice(-ID_DIGITS), 10);
  return n >= 1 ? n : null;
}

async function renumber(target: (typeof TARGETS)[number], write: boolean) {
  const { model, field, prefix } = target;
  const delegate = (prisma as unknown as Record<string, any>)[model];
  const rows: Record<string, any>[] = await delegate.findMany({ select: { id: true, [field]: true } });

  const taken = new Set<string>(rows.map((r) => String(r[field])));
  const changes: { id: string; from: string; to: string }[] = [];

  for (const row of rows) {
    const from = String(row[field]);
    if (alreadyShort(from, prefix)) continue;
    // Not ours to renumber — a DPCS booking id, a client's own contract
    // reference. Those belong to somebody else's numbering system.
    if (!from.startsWith(`${prefix}-`)) continue;

    let sequence = sequenceOf(from);
    if (sequence == null) {
      console.warn(`  ! ${model}.${field} "${from}" has no digits — left alone`);
      continue;
    }
    let to = formatReference(prefix, sequence);
    while (taken.has(to) && sequence < ID_MAX) {
      sequence += 1;
      to = formatReference(prefix, sequence);
    }
    taken.delete(from);
    taken.add(to);
    changes.push({ id: String(row.id), from, to });
  }

  if (!changes.length) {
    console.log(`${model}.${field}: nothing to do (${rows.length} rows)`);
    return 0;
  }

  console.log(`${model}.${field}: ${changes.length} of ${rows.length} rows`);
  for (const c of changes) console.log(`  ${c.from.padEnd(16)} -> ${c.to}`);

  if (write) {
    // Two passes through a scratch value: the unique index would reject an
    // in-place swap the moment a new number equals one another row still holds.
    await prisma.$transaction([
      ...changes.map((c) =>
        delegate.update({ where: { id: c.id }, data: { [field]: `~${c.id.slice(0, 24)}` } }),
      ),
      ...changes.map((c) => delegate.update({ where: { id: c.id }, data: { [field]: c.to } })),
    ]);
  }
  return changes.length;
}

/**
 * `Shipment.bookingId` is a denormalized display copy of the booking reference,
 * not a key — no unique index, so it renumbers in one plain pass. Left out of
 * `TARGETS` because it must follow whatever `booking.reference` became.
 */
async function renumberShipmentBookingIds(write: boolean) {
  const rows = await prisma.shipment.findMany({ select: { id: true, bookingId: true } });
  const changes = rows
    .map((row) => ({ id: row.id, from: row.bookingId, to: shortBookingId(row.bookingId) }))
    .filter((c) => c.to !== c.from);

  if (!changes.length) {
    console.log(`shipment.bookingId: nothing to do (${rows.length} rows)`);
    return 0;
  }
  console.log(`shipment.bookingId: ${changes.length} of ${rows.length} rows`);
  for (const c of changes) console.log(`  ${c.from.padEnd(16)} -> ${c.to}`);

  if (write) {
    await prisma.$transaction(
      changes.map((c) => prisma.shipment.update({ where: { id: c.id }, data: { bookingId: c.to } })),
    );
  }
  return changes.length;
}

/** A comma-joined list of booking ids, each shortened where it is one of ours. */
function shortBookingId(value: string): string {
  return value
    .split(',')
    .map((part) => {
      const one = part.trim();
      if (!one.startsWith('BKG-') || alreadyShort(one, 'BKG')) return one;
      const sequence = sequenceOf(one);
      return sequence == null ? one : formatReference('BKG', sequence);
    })
    .join(', ');
}

async function main() {
  const write = process.argv.includes('--write');
  console.log(write ? 'Renumbering references…\n' : 'Dry run — pass --write to apply.\n');

  let total = 0;
  for (const target of TARGETS) total += await renumber(target, write);
  total += await renumberShipmentBookingIds(write);

  console.log(`\n${total} reference${total === 1 ? '' : 's'} ${write ? 'renumbered' : 'would change'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
