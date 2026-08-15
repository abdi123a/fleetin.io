import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReferenceField } from '../../common/helpers/reference.util';
import { LedgerService } from '../ledger/ledger.service';
import { BankAccountsService } from '../funding/bank-accounts.service';

interface FindAllParams {
  shipperId?: string;
  status?: string;
  page: number;
  limit: number;
}

/**
 * Accounts receivable.
 *
 * The normal path is `issueMonthlyStatement` — one invoice per shipper per
 * month, listing every shipment that ran in it. `issueForShipment` bills a
 * single shipment on its own and stays for the one-off cases (a project
 * closing mid-month, a shipment billed outside its month's statement); it is
 * no longer fired automatically on delivery, because a shipment that already
 * carries its own invoice would then be missing from the month's statement.
 *
 * Neither path ever estimates: a shipment with no `clientRateMinorUnits` is
 * left off rather than billed at zero.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  async findAll(params: FindAllParams) {
    const { shipperId, status, page, limit } = params;
    const where = {
      ...(shipperId ? { shipperId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
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
    if (!invoice) throw new NotFoundException(`Invoice with ID "${id}" not found`);
    return invoice;
  }

  /**
   * Idempotent — returns the existing invoice if this shipment already has
   * one. Returns `null`, does not throw, when the shipment has no
   * `clientRateMinorUnits` yet: an unpriced shipment is not invoiceable,
   * never estimated as 0. Callers (the booking-status hook, `ProjectsService`
   * on close-out) both rely on this null-means-skip contract.
   */
  async issueForShipment(shipmentId: string, actorId: string, actorName: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    if (shipment.clientRateMinorUnits == null) return null;

    const existing = await this.prisma.invoice.findFirst({ where: { missionIds: { array_contains: shipment.id } } });
    if (existing) return existing;

    const number = await nextReferenceField(this.prisma.invoice, 'number', 'INV');
    const issueDate = new Date();
    // No per-shipper payment-terms field exists on the real Shipper model
    // yet — net-30 is a generic placeholder deadline, not a modeled business
    // rule. Revisit once Shipper carries its own terms.
    const contractDeadline = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.invoice.create({
      data: {
        number,
        shipperId: shipment.shipperId,
        shipperName: shipment.customerName,
        shipperCompany: shipment.customerCompany,
        missionIds: [shipment.id],
        description: `Shipment ${shipment.reference}`,
        subtotalMinorUnits: shipment.clientRateMinorUnits,
        taxMinorUnits: 0n,
        totalMinorUnits: shipment.clientRateMinorUnits,
        currency: shipment.clientRateCurrency ?? 'FDJ',
        fxRate: shipment.clientRateFxRate ?? 1.0,
        baseAmountMinorUnits: shipment.clientRateBaseAmountMinorUnits ?? shipment.clientRateMinorUnits,
        contractDeadline,
        issueDate,
        status: 'Draft',
        remainingMinorUnits: shipment.clientRateMinorUnits,
        issuedById: actorId,
        issuedByName: actorName,
      },
    });
  }

  /**
   * The shipper's single end-of-month bill.
   *
   * This is how a shipper is billed, and the per-shipment invoice above is
   * the exception rather than the rule. The commercial arrangement it
   * implements: Fleetin funds the whole month out of its own money, paying
   * transporters as each shipment is released, and the shipper settles once,
   * at the end of the month, against one document that lists every shipment
   * and its total. Nothing about that is a credit check — the shipper keeps
   * shipping all month regardless of how large the running total gets.
   *
   * Idempotent on (shipper, period, project): re-running it returns the
   * statement already issued rather than billing the month twice. Shipments
   * already sitting on another invoice are skipped for the same reason, and
   * unpriced ones are left off entirely — never billed at 0 — so they show up
   * as a gap to fix rather than as revenue quietly lost.
   */
  async issueMonthlyStatement(
    params: { shipperId: string; year: number; month: number; projectId?: string },
    actorId: string,
    actorName: string,
  ) {
    const { shipperId, year, month, projectId } = params;
    const shipper = await this.prisma.shipper.findFirst({ where: { id: shipperId, deletedAt: null } });
    if (!shipper) throw new NotFoundException(`Shipper with ID "${shipperId}" not found`);

    // `month` is 1-based to match how a person says it; Date's is 0-based.
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    const existing = await this.prisma.invoice.findFirst({
      where: { shipperId: shipper.id, periodStart, projectId: projectId ?? null },
    });
    if (existing) return existing;

    const shipments = await this.prisma.shipment.findMany({
      where: {
        shipperId: shipper.id,
        deletedAt: null,
        ...(projectId ? { projectId } : {}),
        scheduledPickupTime: { gte: periodStart, lt: periodEnd },
        clientRateMinorUnits: { not: null },
        status: { notIn: ['Cancelled', 'Failed'] },
      },
      orderBy: { scheduledPickupTime: 'asc' },
    });

    // A shipment that already carries its own invoice is not re-billed here.
    const billable = [];
    for (const shipment of shipments) {
      const alreadyBilled = await this.prisma.invoice.findFirst({
        where: { missionIds: { array_contains: shipment.id } },
      });
      if (!alreadyBilled) billable.push(shipment);
    }
    if (billable.length === 0) return null;

    const totalMinorUnits = billable.reduce((sum, s) => sum + (s.clientRateMinorUnits ?? 0n), 0n);
    const monthLabel = periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const number = await nextReferenceField(this.prisma.invoice, 'number', 'INV');

    return this.prisma.invoice.create({
      data: {
        number,
        shipperId: shipper.id,
        shipperName: billable[0]!.customerName,
        shipperCompany: shipper.companyLegalName,
        missionIds: billable.map((s) => s.id),
        description: `Monthly statement — ${monthLabel} · ${billable.length} shipment${billable.length === 1 ? '' : 's'}`,
        subtotalMinorUnits: totalMinorUnits,
        taxMinorUnits: 0n,
        totalMinorUnits,
        currency: 'FDJ',
        fxRate: 1.0,
        baseAmountMinorUnits: totalMinorUnits,
        // Payable at the close of the month it covers — that is the whole
        // arrangement, not a net-N term derived from the issue date.
        contractDeadline: new Date(periodEnd.getTime() - 1),
        issueDate: new Date(),
        periodStart,
        periodEnd,
        projectId: projectId ?? null,
        status: 'Draft',
        remainingMinorUnits: totalMinorUnits,
        issuedById: actorId,
        issuedByName: actorName,
      },
    });
  }

  /**
   * Full amount only — the frontend this backend was built for never does
   * partial payment. Requires the real account the money landed in.
   *
   * One transaction from the status guard to the ledger entry: the balance
   * credit, the invoice flip, the payment, its allocation and the ledger row
   * all land together or not at all — a mid-sequence failure can't strand a
   * credited balance, and two concurrent requests can't both pass the guard.
   */
  async markPaid(id: string, bankAccountId: string, actorId: string, actorName: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { OR: [{ id }, { number: id }] } });
      if (!invoice) throw new NotFoundException(`Invoice with ID "${id}" not found`);
      if (invoice.status === 'Paid') return invoice;
      if (invoice.status === 'Written Off') {
        throw new BadRequestException(`Invoice "${invoice.number}" has been written off and cannot be marked paid`);
      }

      // Money in — before touching the invoice, so a bad account id fails
      // before anything else is recorded.
      await this.bankAccounts.adjustBalance(bankAccountId, invoice.totalMinorUnits, tx);

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'Paid', allocatedMinorUnits: invoice.totalMinorUnits, remainingMinorUnits: 0n },
      });

      const payment = await tx.payment.create({
        data: {
          number: await nextReferenceField(tx.payment, 'number', 'PAY'),
          direction: 'IN',
          counterpartyType: 'SHIPPER',
          counterpartyId: invoice.shipperId,
          counterpartyName: invoice.shipperCompany,
          amountMinorUnits: invoice.totalMinorUnits,
          currency: invoice.currency,
          fxRate: invoice.fxRate,
          baseAmountMinorUnits: invoice.baseAmountMinorUnits,
          unallocatedMinorUnits: 0n,
          paidAt: new Date(),
          method: 'bank_transfer',
          bankAccountId,
          createdById: actorId,
          createdByName: actorName,
        },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          targetType: 'INVOICE',
          targetId: invoice.id,
          amountMinorUnits: invoice.totalMinorUnits,
          invoiceId: invoice.id,
        },
      });

      const missionIds = Array.isArray(invoice.missionIds) ? invoice.missionIds : [];
      await this.ledger.append(
        {
          entryDate: new Date(),
          type: 'invoice_payment',
          direction: 'IN',
          amountMinorUnits: invoice.totalMinorUnits,
          currency: invoice.currency,
          fxRate: invoice.fxRate,
          baseAmountMinorUnits: invoice.baseAmountMinorUnits,
          counterpartyType: 'SHIPPER',
          counterpartyId: invoice.shipperId,
          counterpartyName: invoice.shipperCompany,
          sourceType: 'invoice',
          sourceId: invoice.id,
          missionId: missionIds.length > 0 ? String(missionIds[0]) : undefined,
          description: `Invoice ${invoice.number} paid`,
          createdById: actorId,
          createdByName: actorName,
        },
        tx,
      );

      return updated;
    });
  }
}
