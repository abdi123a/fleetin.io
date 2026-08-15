import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ID_DIGITS, nextReference } from '../../common/helpers/reference.util';
import { fleetinCommissionPct, resolvePartnerRateMinorUnitsFdj, splitCommission } from '../../common/helpers/pricing.util';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { allowedNextShipmentStatuses, isValidShipmentStatusTransition, timelineKeyForStatus } from './shipment-status.util';

interface FindAllParams {
  searchKeyword?: string;
  status?: string;
  paymentStatus?: string;
  customerId?: string;
  transporterId?: string;
  driverId?: string;
  vehicleId?: string;
  cargoType?: string;
  containerNumber?: string;
  route?: string;
  datePreset?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

/**
 * How many containers a shipment actually moved. A shipment is a job; the
 * bookings under it are the individual container runs, and every document
 * that bills or reports a shipment needs to say how many there were —
 * the shipper's invoice most of all. Cancelled and deleted bookings are
 * excluded: the count has to match what was carried, not what was planned.
 */
const BOOKING_COUNT_INCLUDE = {
  _count: { select: { bookings: { where: { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } } } } },
} satisfies Prisma.ShipmentInclude;

/** Flattens Prisma's `_count.bookings` into the `bookingCount` the wire carries. */
function withBookingCount<T extends { _count?: { bookings: number } }>(shipment: T) {
  const { _count, ...rest } = shipment;
  return { ...rest, bookingCount: _count?.bookings ?? 0 };
}

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private orderBy(sortBy?: string): Prisma.ShipmentOrderByWithRelationInput {
    switch (sortBy) {
      case 'plate:asc':
        return { vehicleRegistrationNumber: 'asc' };
      case 'booking:asc':
        return { bookingId: 'asc' };
      case 'customer:asc':
        return { customerCompany: 'asc' };
      case 'date:desc':
      default:
        return { createdAt: 'desc' };
    }
  }

  private dateRangeFilter(datePreset?: string, startDate?: string, endDate?: string): Prisma.ShipmentWhereInput {
    if (datePreset === 'custom' && (startDate || endDate)) {
      return {
        scheduledPickupTime: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(endDate) } : {}),
        },
      };
    }
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (datePreset === 'today') {
      return { scheduledPickupTime: { gte: new Date(now - DAY_MS) } };
    }
    if (datePreset === 'week') {
      return { scheduledPickupTime: { gte: new Date(now - 7 * DAY_MS) } };
    }
    if (datePreset === 'month') {
      return { scheduledPickupTime: { gte: new Date(now - 30 * DAY_MS) } };
    }
    return {};
  }

  async findAll(params: FindAllParams) {
    const {
      searchKeyword,
      status,
      paymentStatus,
      customerId,
      transporterId,
      driverId,
      vehicleId,
      cargoType,
      containerNumber,
      route,
      datePreset,
      startDate,
      endDate,
      sortBy,
      page,
      limit,
      scope,
    } = params;

    const where: Prisma.ShipmentWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(paymentStatus && paymentStatus !== 'all' ? { paymentStatus } : {}),
      ...(customerId ? { shipperId: customerId } : {}),
      ...(transporterId ? { partnerId: transporterId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(cargoType ? { cargoType: { contains: cargoType } } : {}),
      ...(containerNumber ? { containerNumber: { contains: containerNumber } } : {}),
      ...(route
        ? {
            OR: [
              { pickupLocationName: { contains: route } },
              { deliveryLocationName: { contains: route } },
              { pickupLocationCity: { contains: route } },
              { deliveryLocationCity: { contains: route } },
            ],
          }
        : {}),
      ...(searchKeyword
        ? {
            OR: [
              { reference: { contains: searchKeyword } },
              { bookingId: { contains: searchKeyword } },
              { referenceNumber: { contains: searchKeyword } },
              { dpcsReference: { contains: searchKeyword } },
              { customerName: { contains: searchKeyword } },
              { customerCompany: { contains: searchKeyword } },
              { vehicleRegistrationNumber: { contains: searchKeyword } },
              { containerNumber: { contains: searchKeyword } },
            ],
          }
        : {}),
      ...this.dateRangeFilter(datePreset, startDate, endDate),
    };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: this.orderBy(sortBy),
        include: BOOKING_COUNT_INCLUDE,
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return {
      items: items.map(withBookingCount),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * `id` may be either the real primary key or the human-readable
   * `reference` (e.g. "MSN-08801") — unlike Shipper/Partner/Vehicle/
   * Driver, the frontend's `Mission.id` is the reference string throughout
   * (it's what `/shipments/:id` routes on and what the create-shipment
   * success screen displays), so every lookup here accepts both.
   */
  async findOne(id: string, scope: Record<string, string> | null) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null, ...(scope ?? {}) },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...BOOKING_COUNT_INCLUDE },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${id}" not found`);
    return withBookingCount(shipment);
  }

  async kpis(scope: Record<string, string> | null) {
    const where: Prisma.ShipmentWhereInput = { deletedAt: null, ...(scope ?? {}) };
    const TERMINAL = ['Completed', 'Cancelled', 'Failed'];
    const [total, active, delayed, pendingAssignment] = await Promise.all([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.count({ where: { ...where, status: { notIn: TERMINAL } } }),
      this.prisma.shipment.count({
        where: { ...where, status: { notIn: TERMINAL }, scheduledPickupTime: { lt: new Date() } },
      }),
      this.prisma.shipment.count({ where: { ...where, status: 'Pending' } }),
    ]);
    return { total, active, delayed, pendingAssignment };
  }

  /**
   * Prices a shipment off the chosen transporters' own price lists:
   * containers times each partner's per-mission rate, summed. That total is
   * what the shipper pays; Fleetin's commission comes out of it and the
   * transporter is paid the remainder — see `splitCommission`.
   *
   * There is no separate shipper-side price list and no manual rate entry:
   * picking the transporter IS picking the price.
   *
   * Returns `null` when any assignment's partner has no resolvable rate —
   * the shipment is then left unpriced rather than priced off an invented
   * figure, and `InvoicesService` already leaves unpriced shipments off
   * every statement rather than estimating.
   */
  private async priceFromPartnerGrids(assignments: { partnerId: string; vehicles: number }[], vehicleType: string) {
    let totalFdj = 0n;
    for (const assignment of assignments) {
      const rateFdj = await resolvePartnerRateMinorUnitsFdj(this.prisma, assignment.partnerId, vehicleType, assignment.vehicles);
      if (rateFdj == null) return null;
      totalFdj += rateFdj;
    }
    return splitCommission(totalFdj, await fleetinCommissionPct(this.prisma));
  }

  async create(dto: CreateShipmentDto, actorName: string) {
    const shipper = await this.prisma.shipper.findFirst({ where: { id: dto.shipperId, deletedAt: null } });
    if (!shipper) throw new NotFoundException(`Shipper with ID "${dto.shipperId}" not found`);

    const partnerIds = [...new Set(dto.transporterAssignments.map((a) => a.partnerId))];
    const partners = await this.prisma.partner.findMany({ where: { id: { in: partnerIds }, deletedAt: null } });
    if (partners.length !== partnerIds.length) {
      throw new NotFoundException('One or more transporter assignments reference a partner that does not exist');
    }

    const primaryAssignment = dto.transporterAssignments[0]!;
    const primaryPartner = partners.find((p) => p.id === primaryAssignment.partnerId)!;

    const [shipperContact, partnerContact] = await Promise.all([
      this.prisma.contact.findFirst({ where: { ownerType: 'SHIPPER', ownerId: shipper.id, isPrimary: true } }),
      this.prisma.contact.findFirst({ where: { ownerType: 'PARTNER', ownerId: primaryPartner.id, isPrimary: true } }),
    ]);

    // One price list, two sides of it: the shipper is billed the partners'
    // own figure, the transporters are paid it net of Fleetin's commission.
    // A null price (no resolvable rate) leaves the shipment unpriced.
    const price = await this.priceFromPartnerGrids(dto.transporterAssignments, dto.preferredVehicleType);
    // An explicitly-passed rate still wins — a negotiated one-off overrides
    // the price list rather than being silently replaced by it.
    const clientRateMinorUnits = dto.clientRateMinorUnits != null ? BigInt(dto.clientRateMinorUnits) : (price?.totalMinorUnits ?? null);
    // The transporter-cost column is non-nullable, so an unresolvable rate
    // lands as a visibly-wrong 0 — never an invented figure — until
    // `repriceFromPriceList` can resolve it. No payout reads this aggregate;
    // money moves off each booking's own `transporterCostMinorUnits`.
    const rateMinorUnits = price?.transporterMinorUnits ?? 0n;

    const isDpcs = dto.shipmentSource === 'dpcs';
    let reference: string;
    if (isDpcs && dto.dpcsReference?.trim()) {
      reference = dto.dpcsReference.trim();
      const existing = await this.prisma.shipment.findUnique({ where: { reference } });
      if (existing) throw new ConflictException(`A shipment with reference "${reference}" already exists`);
    } else {
      reference = await nextReference(this.prisma.shipment, 'MSN');
    }

    const bookingId = isDpcs
      ? dto.transporterAssignments.flatMap((a) => a.bookingIds ?? []).filter(Boolean).join(', ') ||
        `BKG-${Date.now().toString().slice(-ID_DIGITS)}`
      : dto.bookingId?.trim() || `BKG-${Date.now().toString().slice(-ID_DIGITS)}`;

    const shipment = await this.prisma.shipment.create({
      data: {
        reference,
        bookingId,
        referenceNumber: `REF-${Math.floor(80000 + Math.random() * 10000)}`,
        dpcsReference: dto.dpcsReference?.trim() || `DPCS-DJ-${Math.floor(7000 + Math.random() * 1000)}`,
        source: isDpcs ? 'dpcs' : 'custom',
        status: 'Pending',
        paymentStatus: dto.paymentStatus ?? 'Pending',

        shipperId: shipper.id,
        customerName: shipperContact?.name ?? shipper.companyLegalName,
        customerCompany: shipper.companyLegalName,
        customerPhone: shipperContact?.phone ?? '',
        customerEmail: shipperContact?.email ?? '',
        customerRating: 4.5,

        partnerId: primaryPartner.id,
        transporterName: partnerContact?.name ?? primaryPartner.companyLegalName,
        transporterCompany: primaryPartner.companyLegalName,
        transporterPhone: partnerContact?.phone ?? '',
        transporterFleetCode: `FLT-${primaryPartner.id.slice(-3).toUpperCase()}`,
        transporterRating: 4.5,

        pickupLocationName: dto.pickupLocationName,
        pickupLocationAddress: dto.pickupLocationAddress,
        pickupLocationCity: dto.pickupLocationCity,
        pickupGateOrTerminal: dto.pickupGateOrTerminal,

        deliveryLocationName: dto.deliveryLocationName,
        deliveryLocationAddress: dto.deliveryLocationAddress,
        deliveryLocationCity: dto.deliveryLocationCity,
        deliveryGateOrTerminal: dto.deliveryGateOrTerminal,

        estimatedDistanceKm: dto.estimatedDistanceKm,
        estimatedDurationHours: dto.estimatedDurationHours ?? '',
        cargoType: dto.cargoType,
        shipmentCategory: dto.shipmentCategory,
        machineryType: dto.machineryType,
        bulkCommodity: dto.bulkCommodity,
        containerNumber: dto.containerNumber,
        shippingLine: dto.shippingLine,
        containerReturnDepot: dto.containerReturnDepot,
        containerReturnDeadline: dto.containerReturnDeadline ? new Date(dto.containerReturnDeadline) : undefined,
        containerReturnFreeDays: dto.containerReturnFreeDays,
        goodsDescription: dto.goodsDescription,
        totalWeightKg: dto.totalWeightKg,
        requiredDocuments: dto.requiredDocuments,

        scheduledPickupTime: new Date(dto.scheduledPickupTime),

        rateMinorUnits,
        rateCurrency: 'FDJ',
        rateFxRate: 1.0,
        rateBaseAmountMinorUnits: rateMinorUnits,

        clientRateMinorUnits,
        clientRateCurrency: 'FDJ',
        clientRateFxRate: 1.0,
        clientRateBaseAmountMinorUnits: clientRateMinorUnits,
        projectId: dto.projectId,

        timeline: {
          create: {
            key: 'creation',
            title: 'Shipment Created',
            description: `Shipment #${reference} created via Create Shipment Wizard`,
            timestamp: new Date(),
            status: 'completed',
            actor: actorName,
          },
        },
      },
      include: { timeline: true },
    });

    return shipment;
  }

  async update(id: string, dto: UpdateShipmentDto) {
    const existing = await this.findOne(id, null);

    let driverSnapshot: Prisma.ShipmentUpdateInput = {};
    if (dto.driverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: dto.driverId, deletedAt: null } });
      if (!driver) throw new NotFoundException(`Driver with ID "${dto.driverId}" not found`);
      driverSnapshot = {
        driver: { connect: { id: driver.id } },
        driverName: driver.fullName,
        driverPhone: driver.phone,
        driverLicenseNumber: driver.drivingLicenseNumber,
        driverRating: 4.5,
        driverVerified: true,
      };
    }

    let vehicleSnapshot: Prisma.ShipmentUpdateInput = {};
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, deletedAt: null } });
      if (!vehicle) throw new NotFoundException(`Vehicle with ID "${dto.vehicleId}" not found`);
      vehicleSnapshot = {
        vehicle: { connect: { id: vehicle.id } },
        vehicleRegistrationNumber: vehicle.plateNumber,
        vehicleTypeSnapshot: vehicle.truckType,
        vehicleCapacity: vehicle.containerCapacity,
        vehicleVerified: true,
      };
    }

    const shipment = await this.prisma.shipment.update({
      where: { id: existing.id },
      data: {
        ...driverSnapshot,
        ...vehicleSnapshot,
        paymentStatus: dto.paymentStatus,
        pickupLocationName: dto.pickupLocationName,
        pickupLocationAddress: dto.pickupLocationAddress,
        pickupLocationCity: dto.pickupLocationCity,
        pickupGateOrTerminal: dto.pickupGateOrTerminal,
        deliveryLocationName: dto.deliveryLocationName,
        deliveryLocationAddress: dto.deliveryLocationAddress,
        deliveryLocationCity: dto.deliveryLocationCity,
        deliveryGateOrTerminal: dto.deliveryGateOrTerminal,
        goodsDescription: dto.goodsDescription,
        totalWeightKg: dto.totalWeightKg,
        requiredDocuments: dto.requiredDocuments,
        containerNumber: dto.containerNumber,
        shippingLine: dto.shippingLine,
        containerReturnDepot: dto.containerReturnDepot,
        containerReturnFreeDays: dto.containerReturnFreeDays,
        clientRateMinorUnits: dto.clientRateMinorUnits != null ? BigInt(dto.clientRateMinorUnits) : undefined,
        clientRateCurrency: dto.clientRateMinorUnits != null ? 'FDJ' : undefined,
        clientRateFxRate: dto.clientRateMinorUnits != null ? 1.0 : undefined,
        clientRateBaseAmountMinorUnits: dto.clientRateMinorUnits != null ? BigInt(dto.clientRateMinorUnits) : undefined,
        project: dto.projectId ? { connect: { id: dto.projectId } } : undefined,
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } } },
    });

    return shipment;
  }

  /**
   * Prices an existing shipment off its transporters' price lists — the fix
   * for the backlog of shipments created before the wizard resolved a price,
   * the ones Finance lists as "unpriced".
   *
   * Its bookings are the container count (that is what a booking is), so the
   * arithmetic is the same containers × per-mission-price rule `create` uses;
   * a shipment with no bookings yet prices as a single trip on its own
   * partner. Never overwrites a rate that is already set — a negotiated
   * figure is not the price list's to revise.
   */
  async repriceFromPriceList(id: string) {
    const existing = await this.findOne(id, null);
    if (existing.clientRateMinorUnits != null) return existing;

    const bookings = await this.prisma.booking.findMany({
      where: { shipmentId: existing.id, deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } },
      select: { partnerId: true },
    });
    const byPartner = new Map<string, number>();
    for (const { partnerId } of bookings) {
      if (partnerId) byPartner.set(partnerId, (byPartner.get(partnerId) ?? 0) + 1);
    }
    const assignments =
      byPartner.size > 0
        ? [...byPartner].map(([partnerId, vehicles]) => ({ partnerId, vehicles }))
        : [{ partnerId: existing.partnerId, vehicles: 1 }];

    const price = await this.priceFromPartnerGrids(assignments, existing.vehicleTypeSnapshot ?? '');
    // No resolvable rate — the shipment stays unpriced rather than being
    // priced off an invented figure; it keeps showing up in "unpriced".
    if (price == null) return existing;

    return this.prisma.shipment.update({
      where: { id: existing.id },
      data: {
        clientRateMinorUnits: price.totalMinorUnits,
        clientRateCurrency: 'FDJ',
        clientRateFxRate: 1.0,
        clientRateBaseAmountMinorUnits: price.totalMinorUnits,
        rateMinorUnits: price.transporterMinorUnits,
        rateBaseAmountMinorUnits: price.transporterMinorUnits,
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** `repriceFromPriceList` across every unpriced shipment, optionally narrowed to one shipper. */
  async repriceUnpriced(shipperId?: string) {
    const unpriced = await this.prisma.shipment.findMany({
      where: { deletedAt: null, clientRateMinorUnits: null, ...(shipperId ? { shipperId } : {}) },
      select: { id: true },
    });

    let priced = 0;
    for (const { id } of unpriced) {
      const result = await this.repriceFromPriceList(id);
      if (result.clientRateMinorUnits != null) priced += 1;
    }

    return { considered: unpriced.length, priced };
  }

  async updateStatus(id: string, dto: UpdateShipmentStatusDto) {
    const existing = await this.findOne(id, null);

    if (!isValidShipmentStatusTransition(existing.status, dto.status)) {
      const allowed = allowedNextShipmentStatuses(existing.status);
      throw new BadRequestException(
        `Cannot move a shipment from "${existing.status}" to "${dto.status}". ` +
          (allowed.length > 0 ? `Allowed next: ${allowed.join(', ')}.` : 'This status is terminal.'),
      );
    }

    const shipment = await this.prisma.shipment.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'Completed' ? new Date() : undefined,
        timeline: {
          create: {
            key: timelineKeyForStatus(dto.status),
            title: `Status changed to ${dto.status}`,
            description: `Shipment marked as ${dto.status}`,
            timestamp: new Date(),
            status: 'completed',
          },
        },
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } } },
    });

    return shipment;
  }

  /**
   * The one gate that turns "delivered" into "payable" — deliberately its
   * own explicit action, never implied by a status change. Guards on the
   * same delivered-statuses vocabulary Empty Return already uses (BR: no
   * separate "proof" model exists yet), plus no open `PayoutHold`.
   */
  async release(id: string, actorId: string, actorName: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
      include: { bookings: { where: { deletedAt: null } } },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${id}" not found`);
    if (shipment.payoutReleasedAt) {
      throw new BadRequestException(`Shipment "${shipment.reference}" is already released`);
    }

    const unproven = shipment.bookings.filter(
      (b) => !['POD Submitted', 'Completed'].includes(b.status) && !['Cancelled', 'Failed'].includes(b.status),
    );
    if (unproven.length > 0) {
      throw new BadRequestException(
        `Cannot release "${shipment.reference}" — ${unproven.length} booking(s) not yet delivered: ${unproven.map((b) => b.reference).join(', ')}`,
      );
    }

    const openHold = await this.prisma.payoutHold.findFirst({ where: { shipmentId: shipment.id, clearedAt: null } });
    if (openHold) {
      throw new BadRequestException(`Cannot release "${shipment.reference}" — an open hold (${openHold.category}) is blocking it`);
    }

    return this.prisma.shipment.update({
      where: { id: shipment.id },
      data: { payoutReleasedAt: new Date(), payoutReleasedById: actorId, payoutReleasedByName: actorName },
      include: { timeline: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id, null);
    return this.prisma.shipment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}
