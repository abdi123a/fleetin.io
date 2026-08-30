/**
 * A day's worth of Workspace, so the page is not empty on first open.
 *
 * An empty board reads as broken rather than as new: there is no way to tell a
 * feature that works and has nothing in it from one that is not wired up. These
 * are the shapes the desk actually raises — a broken door, a missing PoD, a box
 * that has not come back, a licence about to expire — hung off real shipments,
 * vehicles and drivers from whatever is already in the database.
 *
 * Idempotent. Every task is keyed by its title and the record it names, so a
 * second run changes nothing. It creates only Workspace rows and never touches
 * a domain table, so it is safe on a working database.
 */
import { PrismaClient, WorkspaceRecordType, WorkspaceTaskPriority, WorkspaceTaskStatus } from '@prisma/client';
import { nextReference } from '../src/common/helpers/reference.util';
import { assertSeedTargetIsSafe } from './seed-target-guard';

const prisma = new PrismaClient();

type Seed = {
  title: string;
  description?: string;
  status: WorkspaceTaskStatus;
  priority: WorkspaceTaskPriority;
  /** Days from today. Negative is deliberately overdue — a board with nothing
      late does not show what late looks like. */
  dueInDays?: number;
  record?: WorkspaceRecordType;
  comment?: string;
  /** Makes the comment an assigned one, owed by the task's assignee. */
  assignComment?: boolean;
};

const SEEDS: Seed[] = [
  { title: 'Broken container door — needs the garage', status: 'IN_PROGRESS', priority: 'HIGH', dueInDays: 1,
    record: 'VEHICLE', comment: 'Driver reported it at the gate this morning. Garage can take it Thursday.',
    assignComment: true },
  { title: 'PoD still missing after delivery', status: 'OPEN', priority: 'URGENT', dueInDays: -2,
    record: 'BOOKING', comment: 'Consignee says they signed. Chasing the transporter for the scan.' },
  { title: 'Empty not returned — detention running', status: 'WAITING', priority: 'HIGH', dueInDays: -1,
    record: 'BOOKING', comment: 'Free days ran out yesterday. Waiting on the depot slot.' },
  { title: 'Driver licence expires next month', status: 'OPEN', priority: 'NORMAL', dueInDays: 14,
    record: 'DRIVER', comment: 'Asked the transporter for the renewed copy.' },
  { title: 'Invoice disputed by the shipper', status: 'WAITING', priority: 'HIGH', dueInDays: 3,
    record: 'INVOICE', comment: 'They query two of the container lines. Finance is pulling the vouchers.' },
  { title: 'Confirm the transporter rate for next month', status: 'OPEN', priority: 'NORMAL', dueInDays: 7,
    record: 'PARTNER' },
  { title: 'Shipper asked for a monthly report', status: 'OPEN', priority: 'LOW', dueInDays: 5,
    record: 'SHIPPER' },
  { title: 'Late pickup — find out what happened', status: 'COMPLETED', priority: 'NORMAL',
    record: 'SHIPMENT', comment: 'Truck was held at the port gate for two hours. Nothing on our side.' },
  /* Standalone work: not everything the desk owes is about a container. */
  { title: 'Renew the office insurance', status: 'OPEN', priority: 'NORMAL', dueInDays: 21 },
  { title: 'Chase the stationery supplier', status: 'OPEN', priority: 'LOW', dueInDays: 10 },
  { title: 'Book the annual fleet inspection', status: 'IN_PROGRESS', priority: 'NORMAL', dueInDays: 30 },
  { title: 'Update the emergency contact list', status: 'OPEN', priority: 'LOW' },
];

/** One real row per record type, or null when the database has none. */
async function pickRecords() {
  const [shipment, booking, vehicle, driver, partner, shipper, invoice] = await Promise.all([
    prisma.shipment.findFirst({ select: { id: true, reference: true, customerCompany: true } }),
    prisma.booking.findFirst({ where: { containerNumber: { not: null } }, select: { id: true, reference: true, containerNumber: true } }),
    prisma.vehicle.findFirst({ where: { deletedAt: null }, select: { id: true, plateNumber: true, reference: true } }),
    prisma.driver.findFirst({ where: { deletedAt: null }, select: { id: true, reference: true, fullName: true } }),
    prisma.partner.findFirst({ where: { deletedAt: null }, select: { id: true, reference: true, companyLegalName: true } }),
    prisma.shipper.findFirst({ where: { deletedAt: null }, select: { id: true, reference: true, companyLegalName: true } }),
    prisma.invoice.findFirst({ select: { id: true, number: true, status: true } }),
  ]);

  const map: Partial<Record<WorkspaceRecordType, { id: string; ref: string; label: string | null }>> = {};
  if (shipment) map.SHIPMENT = { id: shipment.id, ref: shipment.reference, label: shipment.customerCompany };
  if (booking) map.BOOKING = { id: booking.id, ref: booking.reference, label: booking.containerNumber };
  if (vehicle) map.VEHICLE = { id: vehicle.id, ref: vehicle.plateNumber, label: vehicle.reference };
  if (driver) map.DRIVER = { id: driver.id, ref: driver.reference, label: driver.fullName };
  if (partner) map.PARTNER = { id: partner.id, ref: partner.reference, label: partner.companyLegalName };
  if (shipper) map.SHIPPER = { id: shipper.id, ref: shipper.reference, label: shipper.companyLegalName };
  if (invoice) map.INVOICE = { id: invoice.id, ref: invoice.number, label: invoice.status };
  return map;
}

async function main() {
  assertSeedTargetIsSafe('seed-workspace.ts');

  const team = await prisma.user.findMany({
    where: { status: 'ACTIVE', shipperId: null, partnerId: null, role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'asc' },
  });

  if (team.length === 0) {
    console.log('No internal accounts. Run `pnpm prisma:seed:team` first.');
    return;
  }

  const records = await pickRecords();
  let created = 0;
  let skipped = 0;

  for (const [index, seed] of SEEDS.entries()) {
    const record = seed.record ? records[seed.record] : undefined;
    if (seed.record && !record) {
      console.log(`  – skipped "${seed.title}" (no ${seed.record} in this database)`);
      continue;
    }

    /* Idempotency: same title, same record, no second copy. */
    const existing = await prisma.workspaceTask.findFirst({
      where: {
        title: seed.title,
        ...(record ? { links: { some: { recordType: seed.record!, recordId: record.id } } } : {}),
      },
      select: { id: true },
    });
    if (existing) { skipped += 1; continue; }

    /* Spread the work around the desk rather than piling it on one person. */
    const assignee = team[index % team.length]!;
    const author = team[(index + 1) % team.length]!;

    const dueAt = seed.dueInDays === undefined ? null : (() => {
      const date = new Date();
      date.setDate(date.getDate() + seed.dueInDays!);
      date.setHours(23, 59, 59, 0);
      return date;
    })();

    const reference = await nextReference(prisma.workspaceTask as never, 'TSK');

    const task = await prisma.workspaceTask.create({
      data: {
        reference,
        title: seed.title,
        description: seed.description ?? null,
        status: seed.status,
        priority: seed.priority,
        assigneeId: assignee.id,
        createdById: author.id,
        dueAt,
        completedAt: seed.status === 'COMPLETED' ? new Date() : null,
        links: record
          ? { create: [{ recordType: seed.record!, recordId: record.id, recordRef: record.ref, label: record.label }] }
          : undefined,
        events: { create: { actorId: author.id, kind: 'CREATED', toValue: seed.title } },
      },
    });

    if (seed.comment) {
      await prisma.workspaceMessage.create({
        data: {
          taskId: task.id,
          authorId: author.id,
          /* Written with a real mention token so the composer's own grammar is
             exercised by the seed, not only by a test. */
          body: `@[user:${assignee.id}|${assignee.firstName} ${assignee.lastName}] ${seed.comment}`,
          mentions: { create: [{ userId: assignee.id }] },
          ...(seed.assignComment
            ? { assigneeId: assignee.id, assignedById: author.id, assignedAt: new Date() }
            : {}),
        },
      });

      await prisma.workspaceNotification.create({
        data: {
          userId: assignee.id,
          kind: seed.assignComment ? 'COMMENT_ASSIGNED' : 'MENTIONED',
          actorId: author.id,
          taskId: task.id,
        },
      });
    }

    created += 1;
  }

  console.log(`✅ Workspace seeded — ${created} task(s) created, ${skipped} already present`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
