import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReferenceField } from '../../common/helpers/reference.util';
import { LedgerService } from '../ledger/ledger.service';
import { HoldsService } from '../holds/holds.service';
import { BankAccountsService } from '../funding/bank-accounts.service';
import { PayTransporterDto } from './dto/pay-transporter.dto';

interface FindAllParams {
  transporterId?: string;
  shipmentId?: string;
  status?: string;
  page: number;
  limit: number;
}

/**
 * Accounts payable. Money moves per shipment, never per booking — but each
 * transporter's own cut within a multi-transporter shipment is the sum of
 * only their own bookings' `transporterCostMinorUnits`. One `PaymentOrder`
 * per transporter per shipment, matching the frontend model this backend
 * was built to serve.
 */
@Injectable()
export class PaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly holds: HoldsService,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  async findAll(params: FindAllParams) {
    const { transporterId, shipmentId, status, page, limit } = params;
    const where = {
      ...(transporterId ? { transporterId } : {}),
      ...(shipmentId ? { missionId: shipmentId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.paymentOrder.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.paymentOrder.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const order = await this.prisma.paymentOrder.findFirst({ where: { OR: [{ id }, { number: id }] } });
    if (!order) throw new NotFoundException(`Payment order with ID "${id}" not found`);
    return order;
  }

  async payTransporter(dto: PayTransporterDto, actorId: string, actorName: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: dto.shipmentId }, { reference: dto.shipmentId }], deletedAt: null },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${dto.shipmentId}" not found`);

    if (!shipment.payoutReleasedAt) {
      throw new BadRequestException(`Shipment "${shipment.reference}" has not been released for payout yet`);
    }
    if (await this.holds.isShipmentHeld(shipment.id)) {
      throw new BadRequestException(`Shipment "${shipment.reference}" has an open hold — clear it before paying transporters`);
    }

    const transporter = await this.prisma.partner.findFirst({ where: { id: dto.transporterId, deletedAt: null } });
    if (!transporter) throw new NotFoundException(`Transporter with ID "${dto.transporterId}" not found`);

    // One transaction from the already-paid guard to the ledger entry: the
    // debit, the payment order, the payment, its allocation and the ledger
    // row all land together or not at all — a mid-sequence failure can't
    // strand a debit, and two concurrent requests can't both pass the guard
    // and pay twice.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentOrder.findFirst({
        where: { missionId: shipment.id, transporterId: transporter.id, status: 'Paid' },
      });
      if (existing) {
        throw new BadRequestException(`${transporter.companyLegalName} has already been paid for shipment "${shipment.reference}"`);
      }

      // Cancelled/Failed bookings never carried anything, so they are never
      // paid for — cancellation is a status change, not a soft delete.
      const bookings = await tx.booking.findMany({
        where: {
          shipmentId: shipment.id,
          partnerId: transporter.id,
          deletedAt: null,
          status: { notIn: ['Cancelled', 'Failed'] },
        },
      });
      if (bookings.length === 0) {
        throw new BadRequestException(`${transporter.companyLegalName} has no bookings on shipment "${shipment.reference}"`);
      }
      const unpriced = bookings.filter((b) => b.transporterCostMinorUnits == null);
      if (unpriced.length > 0) {
        throw new BadRequestException(
          `Cannot pay — ${unpriced.length} of ${transporter.companyLegalName}'s booking(s) have no cost set: ${unpriced.map((b) => b.reference).join(', ')}`,
        );
      }

      const amountMinorUnits = bookings.reduce((sum, b) => sum + (b.transporterCostMinorUnits ?? 0n), 0n);
      const firstBooking = bookings[0]!;

      // Money out — before any record is written, so a bad account or
      // insufficient balance fails before the payment order even exists.
      await this.bankAccounts.adjustBalance(dto.bankAccountId, -amountMinorUnits, tx);

      const number = await nextReferenceField(tx.paymentOrder, 'number', 'PO');
      const paymentMethod = dto.paymentMethod ?? 'bank_transfer';

      const order = await tx.paymentOrder.create({
        data: {
          number,
          transporterId: transporter.id,
          transporterName: transporter.companyLegalName,
          transporterCompany: transporter.companyLegalName,
          missionId: shipment.id,
          route: `${shipment.pickupLocationCity} → ${shipment.deliveryLocationCity}`,
          amountMinorUnits,
          currency: firstBooking.transporterCostCurrency ?? 'DJF',
          fxRate: firstBooking.transporterCostFxRate ?? 1.0,
          baseAmountMinorUnits: amountMinorUnits,
          status: 'Paid',
          createdById: actorId,
          createdByName: actorName,
          approvedById: actorId,
          approvedByName: actorName,
          approvedAt: new Date(),
          paidAt: new Date(),
          paymentMethod,
          notes: dto.notes,
        },
      });

      const payment = await tx.payment.create({
        data: {
          number: await nextReferenceField(tx.payment, 'number', 'PAY'),
          direction: 'OUT',
          counterpartyType: 'TRANSPORTER',
          counterpartyId: transporter.id,
          counterpartyName: transporter.companyLegalName,
          amountMinorUnits,
          currency: order.currency,
          fxRate: order.fxRate,
          baseAmountMinorUnits: amountMinorUnits,
          unallocatedMinorUnits: 0n,
          paidAt: new Date(),
          method: paymentMethod,
          bankAccountId: dto.bankAccountId,
          createdById: actorId,
          createdByName: actorName,
        },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          targetType: 'PAYMENT_ORDER',
          targetId: order.id,
          amountMinorUnits,
          paymentOrderId: order.id,
        },
      });

      await this.ledger.append(
        {
          entryDate: new Date(),
          type: 'transporter_payment',
          direction: 'OUT',
          amountMinorUnits,
          currency: order.currency,
          fxRate: order.fxRate,
          baseAmountMinorUnits: amountMinorUnits,
          counterpartyType: 'TRANSPORTER',
          counterpartyId: transporter.id,
          counterpartyName: transporter.companyLegalName,
          sourceType: 'payment_order',
          sourceId: order.id,
          missionId: shipment.id,
          description: `${transporter.companyLegalName} paid for shipment ${shipment.reference} (${bookings.length} booking(s))`,
          createdById: actorId,
          createdByName: actorName,
        },
        tx,
      );

      return order;
    });
  }
}
