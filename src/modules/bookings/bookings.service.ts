import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import { fleetinCommissionPct, resolvePartnerRateMinorUnitsFdj, splitCommission } from '../../common/helpers/pricing.util';
import { EmptyReturnsService } from '../empty-returns/empty-returns.service';
import {
  allowedNextShipmentStatuses,
  isValidShipmentStatusTransition,
  timelineKeyForStatus,
} from '../shipments/shipment-status.util';
import { CreateBookingsDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

interface FindAllParams {
  shipmentId?: string;
  status?: string;
  containerNumber?: string;
  partnerId?: string;
  page: number;
  limit: number;
}

/**
 * One container's booking. Status moves through the exact same ladder as
 * `Shipment.status` (`shipment-status.util.ts`) — reused directly rather
 * than duplicated, because it already anticipates the two Empty Returns
 * cross-module edges (`Assigned` and `Completed` forced from any state).
 * After every status write, `EmptyReturnsService.syncCycleStatusForBooking`
 * is given the chance to reflect it onto whichever cycle (if any) has this
 * booking as its matched outbound load — that is the whole of how Empty
 * Return stays driven by the real booking instead of its own clicks.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emptyReturns: EmptyReturnsService,
  ) {}

  /**
   * A bare `Booking` only carries `partnerId`/`vehicleId`/`driverId` — every
   * consumer that displays a booking (the shipment detail page's booking
   * cards, its preview sheet) needs the names and documents behind those
   * ids, not just the FK. Kept as one shared shape, same convention as
   * `EmptyReturnsService.bookingDisplayInclude`.
   */
  private readonly bookingDetailInclude = { partner: true, vehicle: true, driver: true } as const;

  private async resolveShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    return shipment;
  }

  async findAll(params: FindAllParams) {
    const { shipmentId, status, containerNumber, partnerId, page, limit } = params;
    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(shipmentId ? { shipmentId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(containerNumber ? { containerNumber: { contains: containerNumber } } : {}),
      ...(partnerId ? { partnerId } : {}),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.bookingDetailInclude,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** `id` accepts either the primary key or the human-readable `BKG-####` reference, same convention as Shipments. */
  async findOne(id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${id}" not found`);
    return booking;
  }

  async findForShipment(shipmentId: string) {
    const shipment = await this.resolveShipment(shipmentId);
    return this.prisma.booking.findMany({
      where: { shipmentId: shipment.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: this.bookingDetailInclude,
    });
  }

  /**
   * Creates every booking for a shipment in one call — one row per
   * container/trip, matching what `CreateShipmentModal`'s rotation
   * assignment already collects (BR: the shipment itself carries no
   * container count of its own; the bookings created here are the count).
   */
  async createMany(shipmentId: string, dto: CreateBookingsDto, actorName: string) {
    const shipment = await this.resolveShipment(shipmentId);

    const created = [];
    for (const item of dto.bookings) {
      let reference = item.reference?.trim();
      if (reference) {
        const existing = await this.prisma.booking.findUnique({ where: { reference } });
        if (existing) throw new ConflictException(`A booking with reference "${reference}" already exists`);
      } else {
        reference = await nextReference(this.prisma.booking, 'BKG');
      }

      // What this one container pays its transporter: the partner's own
      // per-mission price (which is what the shipper is billed for it) less
      // Fleetin's commission. Priced independently of the shipment-level
      // `rateMinorUnits` aggregate — see `Booking.transporterCostMinorUnits`'s
      // own doc comment for why the two must not be conflated. A partner with
      // no resolvable rate leaves the booking uncosted, same as no partner.
      const rateFdj = item.partnerId
        ? await resolvePartnerRateMinorUnitsFdj(this.prisma, item.partnerId, item.vehicleType ?? '', 1)
        : null;
      const transporterCostMinorUnits =
        rateFdj != null ? splitCommission(rateFdj, await fleetinCommissionPct(this.prisma)).transporterMinorUnits : null;

      const booking = await this.prisma.booking.create({
        data: {
          reference,
          shipmentId: shipment.id,
          status: 'Pending',
          cargoType: item.cargoType,
          shipmentCategory: item.shipmentCategory,
          containerNumber: item.containerNumber,
          shippingLine: item.shippingLine,
          partnerId: item.partnerId,
          vehicleId: item.vehicleId,
          driverId: item.driverId,
          transporterCostMinorUnits: transporterCostMinorUnits ?? undefined,
          transporterCostCurrency: transporterCostMinorUnits !== null ? 'DJF' : undefined,
          transporterCostFxRate: transporterCostMinorUnits !== null ? 1.0 : undefined,
          transporterCostBaseAmountMinorUnits: transporterCostMinorUnits ?? undefined,
          containerReturnDepot: item.containerReturnDepot,
          containerReturnDeadline: item.containerReturnDeadline ? new Date(item.containerReturnDeadline) : undefined,
          containerReturnFreeDays: item.containerReturnFreeDays,
          scheduledPickupTime: new Date(item.scheduledPickupTime ?? shipment.scheduledPickupTime),
          timeline: {
            create: {
              key: 'creation',
              title: 'Booking Created',
              description: `Booking created for shipment ${shipment.reference}`,
              timestamp: new Date(),
              status: 'completed',
              actor: actorName,
            },
          },
        },
        include: { timeline: true },
      });
      created.push(booking);
    }

    return created;
  }

  async update(id: string, dto: UpdateBookingDto) {
    const existing = await this.findOne(id);

    if (dto.partnerId) {
      const partner = await this.prisma.partner.findFirst({ where: { id: dto.partnerId, deletedAt: null } });
      if (!partner) throw new NotFoundException(`Partner with ID "${dto.partnerId}" not found`);
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, deletedAt: null } });
      if (!vehicle) throw new NotFoundException(`Vehicle with ID "${dto.vehicleId}" not found`);
    }
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: dto.driverId, deletedAt: null } });
      if (!driver) throw new NotFoundException(`Driver with ID "${dto.driverId}" not found`);
    }

    // Reassigning the transporter (or just correcting the vehicle type) means
    // this booking's own cost has to be re-priced against the new partner's
    // pricing tier — never left stale from whoever was assigned before. A
    // partner with no resolvable rate clears the cost to null (uncosted, the
    // same as no partner) rather than keeping the old partner's figure.
    const newPartnerId = dto.partnerId ?? existing.partnerId;
    const repriceNeeded = dto.partnerId !== undefined || dto.vehicleType !== undefined;
    const repricedRateFdj =
      repriceNeeded && newPartnerId
        ? await resolvePartnerRateMinorUnitsFdj(this.prisma, newPartnerId, dto.vehicleType ?? '', 1)
        : undefined;
    const transporterCostMinorUnits =
      repricedRateFdj != null
        ? splitCommission(repricedRateFdj, await fleetinCommissionPct(this.prisma)).transporterMinorUnits
        : repricedRateFdj;

    return this.prisma.booking.update({
      where: { id: existing.id },
      data: {
        partnerId: dto.partnerId,
        vehicleId: dto.vehicleId,
        driverId: dto.driverId,
        transporterCostMinorUnits,
        transporterCostCurrency: transporterCostMinorUnits === undefined ? undefined : transporterCostMinorUnits === null ? null : 'DJF',
        transporterCostFxRate: transporterCostMinorUnits === undefined ? undefined : transporterCostMinorUnits === null ? null : 1.0,
        transporterCostBaseAmountMinorUnits: transporterCostMinorUnits,
        containerNumber: dto.containerNumber,
        shippingLine: dto.shippingLine,
        containerReturnDepot: dto.containerReturnDepot,
        containerReturnDeadline: dto.containerReturnDeadline ? new Date(dto.containerReturnDeadline) : undefined,
        containerReturnFreeDays: dto.containerReturnFreeDays,
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });
  }

  async updateStatus(id: string, dto: UpdateBookingStatusDto) {
    const existing = await this.findOne(id);

    if (!isValidShipmentStatusTransition(existing.status, dto.status)) {
      const allowed = allowedNextShipmentStatuses(existing.status);
      throw new BadRequestException(
        `Cannot move a booking from "${existing.status}" to "${dto.status}". ` +
          (allowed.length > 0 ? `Allowed next: ${allowed.join(', ')}.` : 'This status is terminal.'),
      );
    }

    // Each of these statuses claims a fact about the booking — the ladder
    // must not let the claim get ahead of the data. "Driver Assigned" with
    // no driver, or a truck "En Route" with no vehicle, is a status lying
    // about itself.
    if (dto.status === 'Driver Assigned' && !existing.driverId) {
      throw new BadRequestException('A booking cannot move to "Driver Assigned" without an assigned driver');
    }
    if (dto.status === 'En Route' && !existing.vehicleId) {
      throw new BadRequestException('A booking cannot move to "En Route" without an assigned vehicle');
    }
    // Belt-and-braces: a booking that reached "En Route" before this rule
    // existed could still be missing a vehicle by the time it's completed.
    if (dto.status === 'Completed' && !existing.vehicleId) {
      throw new BadRequestException('A booking cannot be completed without an assigned vehicle');
    }

    const booking = await this.prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'Completed' ? new Date() : undefined,
        timeline: {
          create: {
            key: timelineKeyForStatus(dto.status),
            title: `Status changed to ${dto.status}`,
            description: `Booking marked as ${dto.status}`,
            timestamp: new Date(),
            status: 'completed',
          },
        },
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });

    // The one line that replaces the whole manual milestone clicker: if this
    // booking is somebody's matched outbound load, its cycle now reflects
    // reality instead of waiting for a button to be pressed.
    await this.emptyReturns.syncCycleStatusForBooking(booking.id, booking.status);

    // Deliberately NOT invoicing here. The shipper is billed once, at the end
    // of the month, on a statement covering every shipment that ran in it
    // (`InvoicesService.issueMonthlyStatement`) — Fleetin carries the cost of
    // the whole month in the meantime. Issuing a per-shipment invoice on
    // delivery would take that shipment off the month's statement and bill
    // the client piecemeal, which is not the arrangement.
    //
    // Delivery still matters here; it is what makes the shipment releasable
    // so the TRANSPORTER can be paid. That is the payout side, untouched.

    return booking;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    return this.prisma.booking.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}
