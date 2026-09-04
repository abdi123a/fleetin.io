import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReferenceField } from '../../common/helpers/reference.util';
import { resolveCommission, splitCommission } from '../../common/helpers/pricing.util';
import { CreateProformaDto } from './dto/create-proforma.dto';

interface FindAllParams {
  shipperId?: string;
  projectId?: string;
  kind?: string;
  status?: string;
  page: number;
  limit: number;
}

/**
 * The stored category, in the words a client uses.
 *
 * `shipmentCategory` is a slug written for the matching engine
 * (`container_20`, `bulky_goods`…). A bill is read by somebody outside this
 * system, and "container_40" on an invoice line is our vocabulary leaking onto
 * their paperwork. Falls back to the free-text `cargoType` — which the
 * operator typed — and to nothing at all rather than printing a slug.
 */
function cargoLabel(category: string | null, cargoType: string | null): string | null {
  switch (category) {
    case 'container_20':
      return '20ft container';
    case 'container_40':
      return '40ft container';
    case 'containerized':
      return 'Containerized';
    case 'bulk':
      return 'Bulk';
    case 'bulky_goods':
      return 'Bulky goods';
    case 'machinery':
      return 'Machinery';
    case 'special':
      return 'Special cargo';
    default:
      return cargoType?.trim() || null;
  }
}

/** One printed line: a container the shipper is being charged for. */
interface DocumentLine {
  reference: string;
  containerNo: string | null;
  category: string | null;
  description: string;
  qty: number;
  unitMinorUnits: string;
  totalMinorUnits: string;
}

/**
 * Billing, in one file. Two documents, same paper, and they are made
 * DIFFERENTLY — which is the thing to understand before changing anything here.
 *
 *   - **Proforma** — a quotation, for work that has not happened. It is
 *     composed by hand: the operator picks the client and types the lines,
 *     because at the moment a client asks "what would this cost?" there is no
 *     shipment in the system to build an answer from. `createProforma`.
 *
 *   - **Invoice** — the bill for work that HAS happened. Built from exactly one
 *     shipment, its lines are that shipment's bookings, one container each, and
 *     its total is the price already agreed on the job. `issueForShipment`.
 *
 * An earlier cut of this raised proformas from shipment rows too. That was
 * backwards and the user said so: quoting a job that is already delivered is
 * not a quote. If you are about to add a "raise proforma" button to a list of
 * existing shipments, this is the mistake that was removed.
 *
 * There is no monthly statement, no multi-shipment roll-up and no ledger.
 * Neither path ever estimates: a shipment with no `clientRateMinorUnits` is
 * refused rather than billed at zero.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: FindAllParams) {
    const { shipperId, projectId, kind, status, page, limit } = params;
    const where = {
      ...(shipperId ? { shipperId } : {}),
      ...(kind && kind !== 'all' ? { kind } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      /* Either the document is the project's own (a project invoice carries
         `projectId` and no shipment), or it bills one of the project's
         shipments. Matching only through the shipment relation — as this did —
         hid every project-level invoice from the project's own screen, which
         then reported its billed work as "not billed". */
      ...(projectId ? { OR: [{ projectId }, { shipment: { projectId } }] } : {}),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, skip, take: limit, orderBy: { issueDate: 'desc' } }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { OR: [{ id }, { number: id }] } });
    if (!invoice) throw new NotFoundException(`Document with ID "${id}" not found`);
    return invoice;
  }

  /** Both documents a shipment carries, newest first. */
  async findForShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
      select: { id: true },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    return this.prisma.invoice.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { issueDate: 'desc' },
    });
  }

  /**
   * Turns a shipment's containers into printed lines.
   *
   * The shipment carries ONE price — what the client pays for the whole job —
   * and the bookings split it evenly, with the rounding remainder going to the
   * first line so the lines always re-add to exactly the total. A document
   * whose lines sum to one franc less than its total is a document somebody
   * has to explain.
   *
   * A shipment with no bookings yet still prints: one line for the job itself.
   * That is the normal case for a proforma raised before the containers are
   * booked, which is exactly when a client wants a quote.
   */
  private buildLines(
    bookings: Array<{
      reference: string;
      containerNumber: string | null;
      shipmentCategory: string | null;
      cargoType: string | null;
    }>,
    totalMinorUnits: bigint,
    shipmentReference: string,
  ): DocumentLine[] {
    if (bookings.length === 0) {
      return [
        {
          reference: shipmentReference,
          containerNo: null,
          category: null,
          description: `Container haulage — ${shipmentReference}`,
          qty: 1,
          unitMinorUnits: totalMinorUnits.toString(),
          totalMinorUnits: totalMinorUnits.toString(),
        },
      ];
    }

    const each = totalMinorUnits / BigInt(bookings.length);
    const remainder = totalMinorUnits - each * BigInt(bookings.length);

    return bookings.map((booking, index) => {
      const line = index === 0 ? each + remainder : each;
      return {
        reference: booking.reference,
        containerNo: booking.containerNumber,
        category: cargoLabel(booking.shipmentCategory, booking.cargoType),
        description: booking.containerNumber
          ? `Container ${booking.containerNumber}`
          : `Container — ${booking.reference}`,
        qty: 1,
        unitMinorUnits: line.toString(),
        totalMinorUnits: line.toString(),
      };
    });
  }

  /**
   * Bills a whole PROJECT as one invoice.
   *
   * This is what a project is for. A project groups a client's shipments under
   * one agreement, and an agreement is settled once — the client wants a
   * single document listing the month's work, not fourteen envelopes. So the
   * lines here are SHIPMENTS, one each, where a single-shipment invoice's
   * lines are containers.
   *
   * Only priced shipments that are not already on a live invoice are taken:
   * unpriced work cannot be billed at all, and re-billing a shipment that
   * already has its own invoice would charge the client twice for it. Both are
   * counted in the result so the screen can say what was left out rather than
   * quietly billing less than the operator expected.
   *
   * Not idempotent by itself — a project runs for months and is legitimately
   * billed more than once — but it cannot double-bill, because a shipment that
   * reached an invoice is excluded from the next one by the check above.
   */
  async issueForProject(projectId: string, actorId: string, actorName: string) {
    const project = await this.prisma.project.findFirst({
      where: { OR: [{ id: projectId }, { reference: projectId }], deletedAt: null },
      include: {
        shipper: true,
        shipments: {
          where: { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } },
          include: { bookings: { where: { deletedAt: null } } },
          orderBy: { scheduledPickupTime: 'asc' },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project with ID "${projectId}" not found`);

    const alreadyBilled = await this.prisma.invoice.findMany({
      where: {
        kind: 'invoice',
        status: { not: 'Cancelled' },
        shipmentId: { in: project.shipments.map((shipment) => shipment.id) },
      },
      select: { shipmentId: true },
    });
    const billedIds = new Set(alreadyBilled.map((row) => row.shipmentId));

    /* Shipments already covered by an EARLIER project invoice are excluded the
       same way — those carry the ids in `missionIds` rather than `shipmentId`. */
    const priorProjectInvoices = await this.prisma.invoice.findMany({
      where: { kind: 'invoice', status: { not: 'Cancelled' }, projectId: project.id },
      select: { missionIds: true },
    });
    for (const row of priorProjectInvoices) {
      const ids = Array.isArray(row.missionIds) ? (row.missionIds as string[]) : [];
      for (const id of ids) billedIds.add(id);
    }

    const unpriced = project.shipments.filter((shipment) => shipment.clientRateMinorUnits == null);
    const billable = project.shipments.filter(
      (shipment) => shipment.clientRateMinorUnits != null && !billedIds.has(shipment.id),
    );

    if (billable.length === 0) {
      throw new BadRequestException(
        unpriced.length > 0
          ? `Nothing to bill on "${project.name}" — every priced shipment is already invoiced, and ${unpriced.length} carr${unpriced.length === 1 ? 'ies' : 'y'} no price.`
          : `Nothing to bill on "${project.name}" — every shipment is already invoiced.`,
      );
    }

    /* One line per shipment: the job, its route, and how many boxes it moved.
       `qty` is containers so the client can check the count, and `unit` is the
       per-container rate that produces the line total exactly. */
    const lines: DocumentLine[] = billable.map((shipment) => {
      const total = shipment.clientRateMinorUnits as bigint;
      const boxes = shipment.bookings.length || 1;
      return {
        reference: shipment.reference,
        containerNo: null,
        /* The lane, in full. A project invoice is checked line by line against
           the client's own paperwork, and "Doraleh → UKAB" is what they filed
           it under. */
        description: `${shipment.pickupLocationName} → ${shipment.deliveryLocationName}`,
        /* What kind of cargo the job moved. A client reconciling a project
           bill needs to tell a containerized run from a bulk one — the
           container COUNT alone reads the same for both. */
        category: cargoLabel(shipment.shipmentCategory, shipment.cargoType),
        qty: boxes,
        unitMinorUnits: (total / BigInt(boxes)).toString(),
        totalMinorUnits: total.toString(),
        /* Every container the shipment moved, so the client can tick them off.
           Snapshotted with the rest of the document. */
        children: shipment.bookings.map((booking) => ({
          reference: booking.reference,
          containerNo: booking.containerNumber,
          route: null,
        })),
      };
    });

    const total = billable.reduce((sum, shipment) => sum + (shipment.clientRateMinorUnits as bigint), 0n);
    const containers = billable.reduce((sum, shipment) => sum + (shipment.bookings.length || 1), 0);
    const commission = await resolveCommission(this.prisma, { shipperId: project.shipperId });
    const split = splitCommission(total, commission, containers);

    const number = await nextReferenceField(this.prisma.invoice, 'number', 'INV');
    const issueDate = new Date();
    const contractDeadline = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const invoice = await this.prisma.invoice.create({
      data: {
        number,
        kind: 'invoice',
        /* No `shipmentId`: this document belongs to the project, and pinning it
           to one of its shipments would make that shipment look individually
           billed to every other screen. The set lives in `missionIds`. */
        shipmentId: null,
        projectId: project.id,
        shipperId: project.shipperId,
        shipperName: billable[0]!.customerName,
        shipperCompany: project.shipper.companyLegalName,
        missionIds: billable.map((shipment) => shipment.id),
        /* Just the agreement's name. The count belongs to the sentence the
           document composes around it — carrying it here too printed
           "… — 3 shipments — 3 shipments covering 11 containers". */
        description: project.name,
        lines: lines as unknown as object,
        subtotalMinorUnits: total,
        taxMinorUnits: 0n,
        totalMinorUnits: total,
        commissionMode: commission.mode,
        commissionSource: commission.source,
        commissionPct: commission.pct,
        commissionFixedMinorUnits: commission.fixedMinorUnits,
        commissionMinorUnits: split.fleetinMinorUnits,
        currency: 'FDJ',
        fxRate: 1.0,
        baseAmountMinorUnits: total,
        contractDeadline,
        issueDate,
        status: 'Draft',
        remainingMinorUnits: total,
        issuedById: actorId,
        issuedByName: actorName,
      },
    });

    return { ...invoice, shipmentsBilled: billable.length, skippedUnpriced: unpriced.length };
  }

  /**
   * Writes a quotation by hand.
   *
   * The lines are the operator's own — description, how many, price each — and
   * the total is their sum. Nothing is looked up, because nothing exists yet:
   * that is what makes this a quote rather than a bill.
   *
   * The commission is still resolved and stored, from the client's deal or the
   * house rate. There is no transporter to fall back to — nobody has been
   * assigned to a job that has not been agreed — so the middle step of the
   * resolution chain is simply absent here, not skipped.
   *
   * Not idempotent, unlike `issueForShipment`: two quotes to the same client
   * for different work are two real documents, and there is no shipment to
   * key them by. The operator chooses when to write one.
   */
  async createProforma(dto: CreateProformaDto, actorId: string, actorName: string) {
    const shipper = await this.prisma.shipper.findFirst({
      where: { id: dto.shipperId, deletedAt: null },
    });
    if (!shipper) throw new NotFoundException(`Shipper with ID "${dto.shipperId}" not found`);

    const lines: DocumentLine[] = dto.lines.map((line, index) => {
      const total = BigInt(Math.round(line.unitAmount)) * BigInt(line.qty);
      return {
        reference: `L${index + 1}`,
        containerNo: null,
        /* Same label pipeline as an invoice's lines, so a quote and the bill
           that follows it describe the cargo identically. */
        category: cargoLabel(line.category ?? null, null),
        description: line.description,
        qty: line.qty,
        unitMinorUnits: BigInt(Math.round(line.unitAmount)).toString(),
        totalMinorUnits: total.toString(),
      };
    });

    const total = lines.reduce((sum, line) => sum + BigInt(line.totalMinorUnits), 0n);
    const commission = await resolveCommission(this.prisma, { shipperId: shipper.id });
    /* Containers quoted, not lines — a single line of "5 × 40ft" is five
       containers, and a fixed per-container deal has to charge five fees. */
    const containers = dto.lines.reduce((sum, line) => sum + line.qty, 0);
    const split = splitCommission(total, commission, containers);

    const contact = await this.prisma.contact.findFirst({
      where: { ownerType: 'SHIPPER', ownerId: shipper.id, isPrimary: true },
    });

    const number = await nextReferenceField(this.prisma.invoice, 'number', 'PRO');
    const issueDate = new Date();
    // A quote that never expires is a quote you cannot reprice.
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.invoice.create({
      data: {
        number,
        kind: 'proforma',
        shipmentId: null,
        shipperId: shipper.id,
        shipperName: contact?.name ?? shipper.companyLegalName,
        shipperCompany: shipper.companyLegalName,
        missionIds: [],
        description: dto.description?.trim() || 'Quotation for container haulage',
        lines: lines as unknown as object,
        notes: dto.notes,
        subtotalMinorUnits: total,
        taxMinorUnits: 0n,
        totalMinorUnits: total,
        commissionMode: commission.mode,
        commissionSource: commission.source,
        commissionPct: commission.pct,
        commissionFixedMinorUnits: commission.fixedMinorUnits,
        commissionMinorUnits: split.fleetinMinorUnits,
        currency: 'FDJ',
        fxRate: 1.0,
        baseAmountMinorUnits: total,
        contractDeadline: validUntil,
        issueDate,
        status: 'Draft',
        remainingMinorUnits: total,
        issuedById: actorId,
        issuedByName: actorName,
      },
    });
  }

  /**
   * Raises an invoice from one shipment.
   *
   * Idempotent per shipment: asking twice returns the invoice that already
   * exists rather than issuing a second one with a new number. That matters —
   * a client who has been sent INV-00012 must not receive INV-00013 for the
   * same job because somebody double-clicked.
   *
   * The commission rate is resolved once, here, and STORED. Renegotiating a
   * client's percentage tomorrow must not restate what Fleetin earned on work
   * already billed today.
   */
  async issueForShipment(shipmentId: string, actorId: string, actorName: string) {
    const kind = 'invoice';
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
      include: {
        bookings: {
          where: { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } },
          orderBy: { reference: 'asc' },
        },
        shipper: { select: { companyLegalName: true } },
      },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    if (shipment.clientRateMinorUnits == null) {
      throw new BadRequestException(
        `Shipment "${shipment.reference}" has no price yet — set one before billing it.`,
      );
    }

    const existing = await this.prisma.invoice.findFirst({ where: { shipmentId: shipment.id, kind } });
    if (existing) return existing;

    const total = shipment.clientRateMinorUnits;
    const lines = this.buildLines(shipment.bookings, total, shipment.reference);
    const commission = await resolveCommission(this.prisma, {
      shipperId: shipment.shipperId,
      partnerId: shipment.partnerId,
    });
    /* A fixed deal is charged PER CONTAINER, so the split needs the line count
       the document actually prints — not the raw booking count, which differs
       when a shipment has none and falls back to a single job line. */
    const split = splitCommission(total, commission, lines.length);

    const number = await nextReferenceField(this.prisma.invoice, 'number', 'INV');
    const issueDate = new Date();
    const contractDeadline = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.invoice.create({
      data: {
        number,
        kind,
        shipmentId: shipment.id,
        shipperId: shipment.shipperId,
        shipperName: shipment.customerName,
        shipperCompany: shipment.shipper?.companyLegalName ?? shipment.customerCompany,
        missionIds: [shipment.id],
        projectId: shipment.projectId,
        description: `Shipment ${shipment.reference}`,
        lines: lines as unknown as object,
        subtotalMinorUnits: total,
        taxMinorUnits: 0n,
        totalMinorUnits: total,
        commissionMode: commission.mode,
        commissionSource: commission.source,
        commissionPct: commission.pct,
        commissionFixedMinorUnits: commission.fixedMinorUnits,
        commissionMinorUnits: split.fleetinMinorUnits,
        currency: shipment.clientRateCurrency ?? 'FDJ',
        fxRate: shipment.clientRateFxRate ?? 1.0,
        baseAmountMinorUnits: shipment.clientRateBaseAmountMinorUnits ?? total,
        contractDeadline,
        issueDate,
        status: 'Draft',
        remainingMinorUnits: total,
        issuedById: actorId,
        issuedByName: actorName,
      },
    });
  }

  /** Records that the document was sent to the client. */
  async markSent(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.sentAt) return invoice;
    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date(), status: invoice.status === 'Draft' ? 'Sent' : invoice.status },
    });
  }

  /**
   * The shipper's money arrived. Full amount only — this business does not do
   * partial settlement, and a half-paid invoice was a concept the old module
   * carried and nobody used.
   *
   * A proforma cannot be paid. It is a quote: there is nothing owed against it,
   * and letting one be settled would leave the real invoice unbilled.
   */
  async markPaid(id: string) {
    const invoice = await this.findOne(id);
    if (invoice.kind === 'proforma') {
      throw new BadRequestException(
        `${invoice.number} is a proforma — raise the invoice from its shipment before recording payment.`,
      );
    }
    if (invoice.status === 'Paid') return invoice;

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'Paid',
        paidAt: new Date(),
        allocatedMinorUnits: invoice.totalMinorUnits,
        remainingMinorUnits: 0n,
      },
    });
  }

  /** Withdraws a document raised in error. Paid invoices cannot be cancelled. */
  async cancel(id: string, reason: string) {
    const invoice = await this.findOne(id);
    if (invoice.status === 'Paid') {
      throw new BadRequestException(`${invoice.number} has been paid and cannot be cancelled.`);
    }
    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'Cancelled', notes: reason },
    });
  }
}
