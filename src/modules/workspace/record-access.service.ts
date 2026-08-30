import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** What the composer's `/` menu and every record chip render. */
export interface RecordSummary {
  type: WorkspaceRecordType;
  id: string;
  /** The human reference — `SHI-00412`, `DJ-4471-AB`. */
  reference: string;
  /** The line under it: a shipper's name, a container number, a plate. */
  subtitle: string | null;
  /**
   * The record's LIVE status, so a chip can wear the same colour the record
   * wears on its own page — "Delivered" green, "Empty Ready" amber.
   *
   * Resolved on every read rather than stored on the link. A booking's status
   * changes several times a day; a copy taken when the task was raised would
   * be wrong by the afternoon, and a chip showing a stale status is worse than
   * one showing none.
   */
  status: string | null;
  /**
   * The reference of the record this one hangs off — a booking's shipment.
   *
   * A booking has no page of its own: it opens as a sheet on its shipment
   * (`/shipments/<parentRef>?openBooking=<id>`). Without this a booking chip
   * has nowhere real to point.
   */
  parentRef: string | null;
}

/**
 * Which record type a reference prefix belongs to.
 *
 * `MSN` maps to SHIPMENT on purpose: missions and shipments are the same row
 * under two prefixes, and a dispatcher who reads `MSN-08801` off a phone call
 * should find it. `SHP` (shipper) and `SHI` (shipment) are one letter apart —
 * that near-collision is the app's own scheme, not a typo.
 */
const PREFIX_TYPE: Record<string, WorkspaceRecordType> = {
  SHI: WorkspaceRecordType.SHIPMENT,
  MSN: WorkspaceRecordType.SHIPMENT,
  BKG: WorkspaceRecordType.BOOKING,
  VEH: WorkspaceRecordType.VEHICLE,
  DRV: WorkspaceRecordType.DRIVER,
  PTR: WorkspaceRecordType.PARTNER,
  SHP: WorkspaceRecordType.SHIPPER,
  INV: WorkspaceRecordType.INVOICE,
  CYC: WorkspaceRecordType.EMPTY_RETURN_CYCLE,
  CHN: WorkspaceRecordType.EMPTY_RETURN_CHAIN,
};

/**
 * Everything Workspace knows about the domain, in one place.
 *
 * Workspace stores a `recordType` + `recordId` and nothing else — no shipment
 * status, no rate, no container state. This service is the only thing that
 * reads across the line, and it does exactly two jobs: confirm a reference the
 * user picked is real, and turn ids back into something a chip can display.
 *
 * It never writes to a domain table.
 */
@Injectable()
export class RecordAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve one reference-or-id to a summary, or throw.
   *
   * Accepts either form because the composer sends what the user picked (a
   * reference) while the record pages send what they hold (a uuid).
   */
  async resolve(type: WorkspaceRecordType, idOrRef: string): Promise<RecordSummary> {
    const found = await this.resolveMany([{ type, idOrRef }]);
    const summary = found[0];
    if (!summary) {
      throw new NotFoundException(`${type} "${idOrRef}" does not exist`);
    }
    return summary;
  }

  /**
   * Resolve a batch, one query per DISTINCT TYPE rather than one per row.
   *
   * A task list of 50 rows carrying 80 links would otherwise be 80 round
   * trips. Grouping by type makes it at most ten, and usually two.
   */
  async resolveMany(
    wanted: { type: WorkspaceRecordType; idOrRef: string }[],
  ): Promise<RecordSummary[]> {
    const byType = new Map<WorkspaceRecordType, Set<string>>();
    for (const { type, idOrRef } of wanted) {
      const bucket = byType.get(type) ?? new Set<string>();
      bucket.add(idOrRef);
      byType.set(type, bucket);
    }

    const batches = await Promise.all(
      [...byType.entries()].map(([type, keys]) => this.loadType(type, [...keys])),
    );
    return batches.flat();
  }

  /** Free-text and reference search across every type — ONE call, not nine. */
  async search(query: string, limitPerType = 5): Promise<RecordSummary[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const allTypes = Object.values(WorkspaceRecordType) as WorkspaceRecordType[];

    /* A reference prefix narrows to exactly one type, so do not pay for the
       other nine. `VEH-000` matches on prefix alone — the user is still
       typing. */
    const prefix = /^([A-Z]{3})-?/i.exec(q)?.[1]?.toUpperCase();
    const narrowed = prefix ? PREFIX_TYPE[prefix] : undefined;

    if (narrowed) {
      const hits = await this.searchType(narrowed, q, limitPerType);
      if (hits.length > 0) return hits;
      /* The prefix looked like a reference and matched nothing. Widen rather
         than dead-end: this database's shipment references are bare digits
         (`260701`), not `SHI-00412`, so a prefix guess is a hint and never a
         guarantee. Typing "SHI" should still find the shipper called SHIPCO. */
    }

    const batches = await Promise.all(allTypes.map((type) => this.searchType(type, q, limitPerType)));
    return batches.flat();
  }

  // ── per-type loaders ──────────────────────────────────────────────────────
  //
  // Ten small readers rather than one clever generic one. A generic version
  // would need a field map per type anyway, and this way each says plainly
  // which column is the reference and which is the subtitle — `Invoice` uses
  // `number`, `Vehicle` shows its plate, and `PayoutHold` has no reference of
  // its own at all and borrows the shipment it is holding.

  private async loadType(type: WorkspaceRecordType, keys: string[]): Promise<RecordSummary[]> {
    switch (type) {
      case WorkspaceRecordType.SHIPMENT: {
        const rows = await this.prisma.shipment.findMany({
          where: { OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, customerCompany: true, status: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.customerCompany, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.BOOKING: {
        const rows = await this.prisma.booking.findMany({
          where: { OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, containerNumber: true, status: true, shipment: { select: { reference: true } } },
        });
        return rows.map((r) => ({
          type, id: r.id, reference: r.reference, subtitle: r.containerNumber,
          status: r.status, parentRef: r.shipment?.reference ?? null,
        }));
      }
      case WorkspaceRecordType.VEHICLE: {
        const rows = await this.prisma.vehicle.findMany({
          where: {
            deletedAt: null,
            OR: [{ id: { in: keys } }, { reference: { in: keys } }, { plateNumber: { in: keys } }],
          },
          select: { id: true, reference: true, plateNumber: true, operationalStatus: true },
        });
        /* The plate is what anybody actually says out loud about a truck. */
        return rows.map((r) => ({ type, id: r.id, reference: r.plateNumber, subtitle: r.reference, status: r.operationalStatus, parentRef: null }));
      }
      case WorkspaceRecordType.DRIVER: {
        const rows = await this.prisma.driver.findMany({
          where: { deletedAt: null, OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, fullName: true, status: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.fullName, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.PARTNER: {
        const rows = await this.prisma.partner.findMany({
          where: { deletedAt: null, OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, companyLegalName: true, partnerStatus: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.companyLegalName, status: r.partnerStatus, parentRef: null }));
      }
      case WorkspaceRecordType.SHIPPER: {
        const rows = await this.prisma.shipper.findMany({
          where: { deletedAt: null, OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, companyLegalName: true, approvalStatus: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.companyLegalName, status: r.approvalStatus, parentRef: null }));
      }
      case WorkspaceRecordType.INVOICE: {
        const rows = await this.prisma.invoice.findMany({
          where: { OR: [{ id: { in: keys } }, { number: { in: keys } }] },
          select: { id: true, number: true, status: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.number, subtitle: null, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.PAYOUT_HOLD: {
        const rows = await this.prisma.payoutHold.findMany({
          where: { id: { in: keys } },
          select: { id: true, category: true, clearedAt: true, shipment: { select: { reference: true } } },
        });
        /* A hold has no reference column. It is always about one shipment, so
           it borrows that and names its category. */
        return rows.map((r) => ({
          type,
          id: r.id,
          reference: r.shipment?.reference ?? r.id,
          subtitle: r.category,
          status: r.clearedAt ? 'Cleared' : 'Open',
          parentRef: r.shipment?.reference ?? null,
        }));
      }
      case WorkspaceRecordType.EMPTY_RETURN_CYCLE: {
        const rows = await this.prisma.emptyReturnCycle.findMany({
          where: { OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true, status: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: null, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.EMPTY_RETURN_CHAIN: {
        const rows = await this.prisma.emptyReturnChain.findMany({
          where: { OR: [{ id: { in: keys } }, { reference: { in: keys } }] },
          select: { id: true, reference: true },
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: null, status: null, parentRef: null }));
      }
      default:
        return [];
    }
  }

  private async searchType(
    type: WorkspaceRecordType,
    q: string,
    take: number,
  ): Promise<RecordSummary[]> {
    const like = { contains: q };
    switch (type) {
      case WorkspaceRecordType.SHIPMENT: {
        const rows = await this.prisma.shipment.findMany({
          where: { OR: [{ reference: like }, { customerCompany: like }] },
          select: { id: true, reference: true, customerCompany: true, status: true },
          orderBy: { createdAt: 'desc' },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.customerCompany, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.BOOKING: {
        const rows = await this.prisma.booking.findMany({
          where: { OR: [{ reference: like }, { containerNumber: like }] },
          select: { id: true, reference: true, containerNumber: true, status: true, shipment: { select: { reference: true } } },
          orderBy: { createdAt: 'desc' },
          take,
        });
        return rows.map((r) => ({
          type, id: r.id, reference: r.reference, subtitle: r.containerNumber,
          status: r.status, parentRef: r.shipment?.reference ?? null,
        }));
      }
      case WorkspaceRecordType.VEHICLE: {
        const rows = await this.prisma.vehicle.findMany({
          where: { deletedAt: null, OR: [{ reference: like }, { plateNumber: like }] },
          select: { id: true, reference: true, plateNumber: true, operationalStatus: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.plateNumber, subtitle: r.reference, status: r.operationalStatus, parentRef: null }));
      }
      case WorkspaceRecordType.DRIVER: {
        const rows = await this.prisma.driver.findMany({
          where: { deletedAt: null, OR: [{ reference: like }, { fullName: like }] },
          select: { id: true, reference: true, fullName: true, status: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.fullName, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.PARTNER: {
        const rows = await this.prisma.partner.findMany({
          where: { deletedAt: null, OR: [{ reference: like }, { companyLegalName: like }] },
          select: { id: true, reference: true, companyLegalName: true, partnerStatus: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.companyLegalName, status: r.partnerStatus, parentRef: null }));
      }
      case WorkspaceRecordType.SHIPPER: {
        const rows = await this.prisma.shipper.findMany({
          where: { deletedAt: null, OR: [{ reference: like }, { companyLegalName: like }] },
          select: { id: true, reference: true, companyLegalName: true, approvalStatus: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: r.companyLegalName, status: r.approvalStatus, parentRef: null }));
      }
      case WorkspaceRecordType.INVOICE: {
        const rows = await this.prisma.invoice.findMany({
          where: { number: like },
          select: { id: true, number: true, status: true },
          orderBy: { createdAt: 'desc' },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.number, subtitle: null, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.EMPTY_RETURN_CYCLE: {
        const rows = await this.prisma.emptyReturnCycle.findMany({
          where: { reference: like },
          select: { id: true, reference: true, status: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: null, status: r.status, parentRef: null }));
      }
      case WorkspaceRecordType.EMPTY_RETURN_CHAIN: {
        const rows = await this.prisma.emptyReturnChain.findMany({
          where: { reference: like },
          select: { id: true, reference: true },
          take,
        });
        return rows.map((r) => ({ type, id: r.id, reference: r.reference, subtitle: null, status: null, parentRef: null }));
      }
      /* Holds are not searchable by name — they have none. They are reachable
         from the shipment they hold, which is how anybody looks for one. */
      default:
        return [];
    }
  }
}
