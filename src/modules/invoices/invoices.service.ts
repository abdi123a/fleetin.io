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
      ...(projectId ? { shipment: { projectId } } : {}),
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
    bookings: Array<{ reference: string; containerNumber: string | null; shipmentCategory: string | null }>,
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
        category: booking.shipmentCategory,
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
        category: null,
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
