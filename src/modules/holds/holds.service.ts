import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHoldDto } from './dto/create-hold.dto';

/**
 * The one manual dispute override the payout workflow keeps: raising a hold
 * pauses `ShipmentsService.release()`/`payment-orders`' "pay transporter"
 * action on the held shipment. It does not touch `Shipment`/`Booking.status`
 * at all — physical delivery tracking and the money-side dispute are
 * deliberately independent facts.
 */
@Injectable()
export class HoldsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    return shipment;
  }

  async raise(shipmentId: string, dto: CreateHoldDto, raisedById: string, raisedByName: string) {
    const shipment = await this.resolveShipment(shipmentId);

    if (dto.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { OR: [{ id: dto.bookingId }, { reference: dto.bookingId }], shipmentId: shipment.id, deletedAt: null },
      });
      if (!booking) throw new NotFoundException(`Booking with ID "${dto.bookingId}" not found on this shipment`);
    }

    return this.prisma.payoutHold.create({
      data: {
        shipmentId: shipment.id,
        bookingId: dto.bookingId,
        category: dto.category,
        reason: dto.reason,
        raisedById,
        raisedByName,
      },
    });
  }

  async clear(id: string, clearedById: string, clearedByName: string, note?: string) {
    const hold = await this.prisma.payoutHold.findUnique({ where: { id } });
    if (!hold) throw new NotFoundException(`Hold with ID "${id}" not found`);
    if (hold.clearedAt) return hold;

    return this.prisma.payoutHold.update({
      where: { id },
      data: { clearedAt: new Date(), clearedById, clearedByName, note },
    });
  }

  async findForShipment(shipmentId: string) {
    const shipment = await this.resolveShipment(shipmentId);
    return this.prisma.payoutHold.findMany({ where: { shipmentId: shipment.id }, orderBy: { raisedAt: 'desc' } });
  }

  /** Book-wide, for Finance's overview — `findForShipment` only sees one shipment at a time. */
  async findAll(status?: 'open' | 'cleared') {
    const clearedAt = status === 'open' ? null : status === 'cleared' ? { not: null } : undefined;
    return this.prisma.payoutHold.findMany({
      where: clearedAt === undefined ? {} : { clearedAt },
      orderBy: { raisedAt: 'desc' },
    });
  }

  /** Read-only existence check — other services (payment-orders) call this directly rather than duplicating the query. */
  async isShipmentHeld(shipmentId: string): Promise<boolean> {
    const open = await this.prisma.payoutHold.findFirst({ where: { shipmentId, clearedAt: null } });
    return Boolean(open);
  }
}
