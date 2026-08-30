import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { nextReference } from '../../common/helpers/reference.util';
import { fleetinCommissionPct, resolvePartnerRateMinorUnitsFdj, splitCommission } from '../../common/helpers/pricing.util';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { resolveCrewLead } from './shipment-crew.util';
import {
  MANUAL_SHIPMENT_STATUSES,
  allowedNextShipmentStatuses,
  isValidShipmentStatusTransition,
  timelineKeyForStatus,
} from './shipment-status.util';

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
  /**
   * Whether the caller may be told which of our staff is on the shipment.
   * False for a customer's or a carrier's own login — see `withBookingCount`.
   */
  includeCrew?: boolean;
  /**
   * Filter by the staff member on the crew. The literal `'unassigned'` asks
   * the opposite question — which shipments nobody is on — which is the one
   * that actually needs answering on a Monday morning.
   */
  assigneeId?: string;
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
const LIVE_BOOKINGS = { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } };

const BOOKING_COUNT_INCLUDE = {
  _count: { select: { bookings: { where: LIVE_BOOKINGS } } },
  /**
   * Who is actually carrying this shipment.
   *
   * The shipment row holds a single `partnerId`/`transporterCompany` snapshot
   * taken at creation, but the carrier is assigned per *booking*: split a
   * ten-container job between two hauliers and the snapshot names one of them
   * and hides the other. Every list that printed it was therefore telling the
   * truth about one carrier and nothing about the rest.
   *
   * Only the two fields a mark needs. The frontend resolves the logo from its
   * own company registry by id or name, so there is no reason to carry a
   * storage key — and no reason to ship the bookings themselves, which is why
   * they are stripped in the mapper below.
   */
  bookings: {
    where: LIVE_BOOKINGS,
    select: { partner: { select: { id: true, companyLegalName: true } } },
  },
  /**
   * The Fleetin staff on this shipment — see `ShipmentAssignee`.
   *
   * Ordered lead-first, then by when they joined, because the client renders
   * these as an overlapping stack and the person on point has to be the one in
   * front. Only the four fields an avatar and its tooltip need; no email, since
   * a crew stack is not a contact list and this payload rides on every list row.
   */
  assignees: {
    orderBy: [{ isLead: 'desc' }, { assignedAt: 'asc' }],
    select: {
      isLead: true,
      assignedAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          role: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.ShipmentInclude;

type BookingPartners = { bookings?: { partner: { id: string; companyLegalName: string } | null }[] };

type CrewRows = {
  assignees?: {
    isLead: boolean;
    assignedAt: Date;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
      role: { name: string } | null;
    };
  }[];
};

/**
 * Flattens the join rows into the flat crew members the wire carries — the
 * client never sees the join table's shape, only "these people, this one on
 * point".
 */
function flattenCrew(rows: CrewRows['assignees']) {
  return (rows ?? []).map((row) => ({
    id: row.user.id,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    fullName: `${row.user.firstName} ${row.user.lastName}`.trim(),
    avatarUrl: row.user.avatarUrl,
    roleName: row.user.role?.name ?? null,
    isLead: row.isLead,
    assignedAt: row.assignedAt,
  }));
}

/**
 * Flattens Prisma's `_count.bookings` into the `bookingCount` the wire carries,
 * and its bookings' partners into a deduped `transporters` list.
 *
 * Order is first-seen, which is booking order — the carrier that took the first
 * container leads, which is also the one the old snapshot named, so a client
 * reading only `transporters[0]` sees no change.
 */
function withBookingCount<T extends { _count?: { bookings: number } } & BookingPartners & CrewRows>(
  shipment: T,
  /**
   * Whether the caller may see who at Fleetin is working this shipment.
   *
   * False for a portal account. A shipper's and a carrier's own logins read
   * these same endpoints, row-scoped to their company — and which of our staff
   * is on a job is our staffing, not theirs. Nothing renders it in either
   * portal today, but "no UI reads it" is not a boundary; the payload is. So
   * the field is dropped rather than merely unused, and internal role names
   * (`FINANCE`, `EMTYMANAGER`) never cross to a customer.
   */
  includeCrew = true,
) {
  const { _count, bookings, assignees, ...rest } = shipment;
  const transporters: { id: string; name: string }[] = [];
  for (const booking of bookings ?? []) {
    const partner = booking.partner;
    if (!partner) continue;
    if (transporters.some((t) => t.id === partner.id)) continue;
    transporters.push({ id: partner.id, name: partner.companyLegalName });
  }
  return {
    ...rest,
    bookingCount: _count?.bookings ?? 0,
    transporters,
    ...(includeCrew ? { crew: flattenCrew(assignees) } : {}),
  };
}

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

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
      assigneeId,
      includeCrew = true,
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
      /* Crew filter. `'unassigned'` is the interesting half: `none: {}` is
         "has no crew rows at all", which is the backlog nobody has picked up. */
      ...(assigneeId === 'unassigned'
        ? { assignees: { none: {} } }
        : assigneeId
          ? { assignees: { some: { userId: assigneeId } } }
          : {}),
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
      items: items.map((item) => withBookingCount(item, includeCrew)),
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
  async findOne(id: string, scope: Record<string, string> | null, includeCrew = true) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null, ...(scope ?? {}) },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...BOOKING_COUNT_INCLUDE },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${id}" not found`);
    return withBookingCount(shipment, includeCrew);
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

  async create(dto: CreateShipmentDto, actorName: string, actorId?: string) {
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

    /**
     * The crew, resolved before the shipment is written so an unknown user id
     * fails the whole request rather than leaving a shipment behind with a
     * silently-dropped assignment.
     *
     * Order is the client's, deduped: the first name leads unless
     * `leadAssigneeUserId` names someone else.
     */
    const crewUserIds = [...new Set(dto.assigneeUserIds ?? [])];
    if (crewUserIds.length > 0) {
      const foundCrew = await this.prisma.user.findMany({
        where: { id: { in: crewUserIds } },
        select: { id: true },
      });
      const missingCrew = crewUserIds.filter((userId) => !foundCrew.some((u) => u.id === userId));
      if (missingCrew.length > 0) {
        throw new BadRequestException(`Unknown user(s) on the crew: ${missingCrew.join(', ')}`);
      }
      if (dto.leadAssigneeUserId && !crewUserIds.includes(dto.leadAssigneeUserId)) {
        throw new BadRequestException('The lead must be one of the assigned users');
      }
    }
    const crewLeadId = dto.leadAssigneeUserId ?? crewUserIds[0];

    const isDpcs = dto.shipmentSource === 'dpcs';
    /**
     * The caller's own number wins, on every source. Operators number their
     * shipments and bookings themselves, so the wizard always sends one and
     * the only thing the server decides is whether it collides with a
     * shipment that already exists. `nextReference` is the fallback for
     * callers that have no number of their own — seeds and imports.
     */
    const suppliedReference = dto.reference?.trim() || (isDpcs ? dto.dpcsReference?.trim() : '');
    let reference: string;
    if (suppliedReference) {
      reference = suppliedReference;
      const existing = await this.prisma.shipment.findUnique({ where: { reference } });
      if (existing) throw new ConflictException(`A shipment with reference "${reference}" already exists`);
    } else {
      reference = await nextReference(this.prisma.shipment, 'MSN');
    }

    /**
     * A placeholder only — `syncShipmentFromBookings` overwrites this with the
     * real `Booking.reference` list as soon as the bookings exist. It used to
     * be minted from `Date.now()`, which produced a plausible-looking
     * `BKG-82071` that matched no booking anywhere (325 of 337 rows) and was
     * then rendered as the shipment's own identity on the Shipments list.
     */
    const bookingId = isDpcs
      ? dto.transporterAssignments.flatMap((a) => a.bookingIds ?? []).filter(Boolean).join(', ')
      : (dto.bookingId?.trim() ?? '');

    const shipment = await this.prisma.shipment.create({
      data: {
        reference,
        bookingId,
        referenceNumber: `REF-${Math.floor(80000 + Math.random() * 10000)}`,
        // Empty for a Fleetin-direct shipment — it genuinely has no DPCS
        // reference. The random `DPCS-DJ-####` this used to fall back to gave
        // all 175 `source: 'custom'` shipments a fake one, which is what put a
        // DPCS badge on every row of the Shipments list. `source` is the
        // origination channel; this column is DPCS's own id, or nothing.
        dpcsReference: isDpcs ? (dto.dpcsReference?.trim() ?? '') : '',
        source: isDpcs ? 'dpcs' : 'custom',
        status: 'Pending',
        paymentStatus: dto.paymentStatus ?? 'Pending',

        shipperId: shipper.id,
        customerName: shipperContact?.name ?? shipper.companyLegalName,
        customerCompany: shipper.companyLegalName,
        customerPhone: shipperContact?.phone ?? '',
        customerEmail: shipperContact?.email ?? '',

        partnerId: primaryPartner.id,
        transporterName: partnerContact?.name ?? primaryPartner.companyLegalName,
        transporterCompany: primaryPartner.companyLegalName,
        transporterPhone: partnerContact?.phone ?? '',
        transporterFleetCode: `FLT-${primaryPartner.id.slice(-3).toUpperCase()}`,

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

        /* The crew, written in the same statement as the shipment — a
           shipment that was created "for Amina" and then lost her because a
           follow-up call failed is worse than one created unassigned. */
        assignees: {
          create: crewUserIds.map((userId) => ({
            userId,
            isLead: userId === crewLeadId,
            assignedById: actorId,
          })),
        },
      },
      include: { timeline: true },
    });

    if (!dto.bookings?.length) return shipment;

    // The containers, in the same request. Previously the client made a
    // second call for these, and a failure there left a shipment with no
    // bookings at all — which is exactly what one row in the live database
    // looks like. `BookingsService` owns the pricing and reference minting,
    // so it stays the one place bookings are created; on failure the
    // just-created shipment is removed again so the caller never ends up with
    // half a shipment.
    try {
      await this.bookings.createMany(shipment.id, { bookings: dto.bookings }, actorName);
    } catch (error) {
      await this.prisma.shipment.delete({ where: { id: shipment.id } });
      throw error;
    }

    // Re-read: creating the bookings runs `syncShipmentFromBookings`, which
    // rewrites `status`, `containerNumber` and `bookingId` from them.
    return this.findOne(shipment.id, null);
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

  /**
   * Cancels or fails a whole shipment. It is no longer a general status
   * setter: every happy-path status is derived from the shipment's own
   * bookings (`syncShipmentStatusFromBookings`), so accepting e.g. "En Route"
   * here would just be overwritten by the next booking write — and, before
   * that derivation existed, was exactly how a shipment came to read "Pending"
   * with every container delivered. Move the bookings instead.
   */
  async updateStatus(id: string, dto: UpdateShipmentStatusDto) {
    const existing = await this.findOne(id, null);

    if (!MANUAL_SHIPMENT_STATUSES.includes(dto.status)) {
      throw new BadRequestException(
        `A shipment's status is derived from its bookings and cannot be set directly to "${dto.status}". ` +
          `Move the booking(s) instead, or use ${MANUAL_SHIPMENT_STATUSES.join(' / ')} to close the whole shipment.`,
      );
    }

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

  /**
   * Set the whole crew on a shipment in one call.
   *
   * Replace, not add-and-remove: the picker on screen is a checklist of the
   * whole team, so "who is on this" is a set the client already holds in full.
   * A PATCH-per-person API would have made the common edit (tick two, untick
   * one) three round trips and left a half-applied crew if one failed.
   *
   * Idempotent — sending the same set twice changes nothing, including
   * `assignedAt`, because the rows that survive are left alone rather than
   * torn down and rebuilt. That matters: `assignedAt` is what orders the
   * stack, and rebuilding would reshuffle the avatars on every save.
   *
   * `leadUserId` must be one of `userIds`; promoting somebody who is not on
   * the crew is a mistake worth reporting rather than silently adding them.
   * Omitting it keeps whoever currently leads if they are still on the crew,
   * and otherwise gives point to the first person named — a crew always has a
   * lead once it has anybody, so there is always someone to call.
   */
  async setAssignees(
    id: string,
    userIds: string[],
    leadUserId: string | undefined,
    actorId: string,
  ) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
      select: { id: true, reference: true },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${id}" not found`);

    // Deduped, order preserved — the client sends checkbox order and the first
    // name is the fallback lead, so a duplicate must not change who that is.
    const wanted = [...new Set(userIds)];

    if (wanted.length > 0) {
      const found = await this.prisma.user.findMany({
        where: { id: { in: wanted } },
        select: { id: true },
      });
      const missing = wanted.filter((userId) => !found.some((u) => u.id === userId));
      if (missing.length > 0) {
        throw new BadRequestException(`Unknown user(s): ${missing.join(', ')}`);
      }
    }

    if (leadUserId && !wanted.includes(leadUserId)) {
      throw new BadRequestException('The lead must be one of the assigned users');
    }

    const existing = await this.prisma.shipmentAssignee.findMany({
      where: { shipmentId: shipment.id },
      select: { userId: true, isLead: true },
    });

    const currentLead = existing.find((row) => row.isLead)?.userId;
    const lead = resolveCrewLead(wanted, currentLead, leadUserId);

    const toRemove = existing.filter((row) => !wanted.includes(row.userId)).map((row) => row.userId);
    const toAdd = wanted.filter((userId) => !existing.some((row) => row.userId === userId));

    await this.prisma.$transaction([
      ...(toRemove.length > 0
        ? [
            this.prisma.shipmentAssignee.deleteMany({
              where: { shipmentId: shipment.id, userId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length > 0
        ? [
            this.prisma.shipmentAssignee.createMany({
              data: toAdd.map((userId) => ({
                shipmentId: shipment.id,
                userId,
                assignedById: actorId,
                isLead: false,
              })),
            }),
          ]
        : []),
      /* At most one lead, always. Clearing every flag first and setting one
         after is two statements rather than a diff, but it is the only version
         that cannot leave two leads behind if the previous lead was also the
         one being promoted. */
      this.prisma.shipmentAssignee.updateMany({
        where: { shipmentId: shipment.id, isLead: true },
        data: { isLead: false },
      }),
      ...(lead
        ? [
            this.prisma.shipmentAssignee.updateMany({
              where: { shipmentId: shipment.id, userId: lead },
              data: { isLead: true },
            }),
          ]
        : []),
    ]);

    return this.findOne(shipment.id, null);
  }

  async remove(id: string) {
    const existing = await this.findOne(id, null);
    return this.prisma.shipment.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}
