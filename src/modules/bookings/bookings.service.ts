import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import { fleetinCommissionPct, splitCommission } from '../../common/helpers/pricing.util';
import { EmptyReturnsService } from '../empty-returns/empty-returns.service';
import {
  allowedNextShipmentStatuses,
  isValidShipmentStatusTransition,
  statusFromAssignments,
  timelineKeyForStatus,
} from '../shipments/shipment-status.util';
import { hasProofOfDelivery, hasProofOfReturn, isEmptyReturnSettled } from '../empty-returns/empty-return-status.util';
import { syncShipmentFromBookings } from '../shipments/shipment-sync';
import { CreateBookingsDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

interface FindAllParams {
  shipmentId?: string;
  status?: string;
  containerNumber?: string;
  partnerId?: string;
  page: number;
  limit: number;
  /**
   * Row-level scoping for portal callers (BR-10.5) — a shipper sees only the
   * bookings under its own shipments, a transporter only its own runs. `null`
   * for internal roles, where the permission check was the whole gate.
   */
  scope?: Record<string, unknown> | null;
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
  /* `returnDriver`/`returnVehicle` ride along with the delivery pair: a
     container's round trip is two jobs and the card has to name both crews
     without a second round trip of its own. Null on almost every row — it only
     fills in when the empty went back with somebody else. */
  private readonly bookingDetailInclude = {
    shipment: true,
    partner: true,
    vehicle: true,
    driver: true,
    returnVehicle: true,
    returnDriver: true,
  } as const;

  private async resolveShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);
    return shipment;
  }

  async findAll(params: FindAllParams) {
    const { shipmentId, status, containerNumber, partnerId, page, limit, scope } = params;
    const where: Prisma.BookingWhereInput = {
      deletedAt: null,
      ...(shipmentId ? { shipmentId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(containerNumber ? { containerNumber: { contains: containerNumber } } : {}),
      ...(partnerId ? { partnerId } : {}),
      ...((scope ?? {}) as Prisma.BookingWhereInput),
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

  /**
   * `id` accepts either the primary key or the human-readable `BKG-####`
   * reference, same convention as Shipments.
   *
   * `scope` is the portal caller's own-company filter: another company's
   * booking is reported as not found rather than as forbidden, so the id space
   * itself stays unenumerable.
   */
  async findOne(id: string, scope: Record<string, unknown> | null = null) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null, ...(scope as Prisma.BookingWhereInput) },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${id}" not found`);
    return booking;
  }

  async findForShipment(shipmentId: string, scope: Record<string, unknown> | null = null) {
    const shipment = await this.resolveShipment(shipmentId);
    return this.prisma.booking.findMany({
      where: { shipmentId: shipment.id, deletedAt: null, ...(scope as Prisma.BookingWhereInput) },
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
      /* The shipment's own entered price, shared evenly across its bookings —
         partner price lists are gone (2026-08-31) and there is no per-carrier
         rate left to resolve. A shipment created unpriced leaves its bookings
         uncosted, same as an unresolvable rate used to. */
      const rateFdj =
        item.partnerId && shipment.clientRateMinorUnits != null && dto.bookings.length > 0
          ? BigInt(shipment.clientRateMinorUnits) / BigInt(dto.bookings.length)
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

    // New bookings start at Pending, so adding them to a shipment that had
    // already moved pulls it back — correct: the job is only as far along as
    // its least advanced container.
    await syncShipmentFromBookings(this.prisma, shipment.id);

    return created;
  }

  async update(id: string, dto: UpdateBookingDto, user?: AuthenticatedUser) {
    const existing = await this.findOne(id);

    const wroteDebrief =
      dto.driverRating !== undefined ||
      dto.driverRatingReliability !== undefined ||
      dto.driverRatingPunctuality !== undefined ||
      dto.driverRatingProfessionalism !== undefined ||
      dto.driverNote !== undefined;

    /* And the return driver's, signed separately. The two debriefs are about
       two different people's trips and are often given by two different
       operators, so one stamp covering both would put whoever closed the
       container's name on a verdict about a driver they never saw. */
    const wroteReturnDebrief =
      dto.returnDriverRating !== undefined ||
      dto.returnDriverRatingReliability !== undefined ||
      dto.returnDriverRatingPunctuality !== undefined ||
      dto.returnDriverRatingProfessionalism !== undefined ||
      dto.returnDriverNote !== undefined;

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
    /* The return leg's crew, checked the same way. Nothing here asserts they
       belong to this booking's transporter: the check the delivery pair gets is
       the check these get, and a carrier that subcontracts the empty leg is a
       real arrangement the model does not need to have an opinion about. */
    if (dto.returnVehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.returnVehicleId, deletedAt: null } });
      if (!vehicle) throw new NotFoundException(`Vehicle with ID "${dto.returnVehicleId}" not found`);
    }
    if (dto.returnDriverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: dto.returnDriverId, deletedAt: null } });
      if (!driver) throw new NotFoundException(`Driver with ID "${dto.returnDriverId}" not found`);
    }

    // Reassigning the transporter (or just correcting the vehicle type) means
    // Reassigning a booking no longer reprices it: the price is the shipment's
    // entered figure, not the carrier's rate card, so moving the work to a
    // different transporter does not change what the job is worth. The cost
    // follows the shipment, and only an edit to the shipment's own price
    // changes it. (Before 2026-08-31 this resolved the new partner's pricing
    // tier — that table is gone.)
    const newPartnerId = dto.partnerId ?? existing.partnerId;
    const transporterCostMinorUnits = undefined;

    /* A truck and a driver belong to a transporter. Moving the booking to a
     * different one leaves them pointing at somebody else's fleet, so unless
     * the same call names replacements they are cleared — the alternative is a
     * booking that claims Al-Baraka's driver is running Gulf Horn's job. */
    const switchedPartner = Boolean(dto.partnerId && dto.partnerId !== existing.partnerId);
    const clearFleet = switchedPartner && dto.vehicleId === undefined && dto.driverId === undefined;

    const nextVehicleId = clearFleet ? null : (dto.vehicleId ?? existing.vehicleId);
    const nextDriverId = clearFleet ? null : (dto.driverId ?? existing.driverId);

    /* Assigning a truck and a driver *is* reaching those rungs — the status
     * follows the facts rather than waiting to be told about them. Raised in
     * the same write, so a booking is never briefly out of step with its own
     * record, and stamped on the timeline like any other status change so the
     * mission report still shows when it happened. */
    const earned = statusFromAssignments(existing.status, {
      hasVehicle: Boolean(nextVehicleId),
      hasDriver: Boolean(nextDriverId),
    });

    /* And the same rule in reverse. Every rung above Pending asserts a truck —
     * "At Pickup" with no vehicle is the same lie as "Driver Assigned" with no
     * driver, just further along. Losing the fleet therefore returns the
     * booking to Pending, which is also the state that asks for what the
     * dispatcher is about to do anyway: pick the new transporter's truck and
     * driver. A closed or cancelled job is left alone. */
    const dropped =
      clearFleet && !['Completed', 'Cancelled', 'Failed', 'Pending'].includes(existing.status)
        ? 'Pending'
        : null;
    const restated = earned ?? dropped;

    const updated = await this.prisma.booking.update({
      where: { id: existing.id },
      data: {
        partnerId: dto.partnerId,
        vehicleId: clearFleet ? null : dto.vehicleId,
        driverId: clearFleet ? null : dto.driverId,
        ...(restated
          ? {
              status: restated,
              timeline: {
                create: {
                  key: timelineKeyForStatus(restated),
                  title: `Status changed to ${restated}`,
                  description: `Booking marked as ${restated}`,
                  timestamp: new Date(),
                  status: 'completed',
                },
              },
            }
          : {}),
        transporterCostMinorUnits,
        transporterCostCurrency: transporterCostMinorUnits === undefined ? undefined : transporterCostMinorUnits === null ? null : 'DJF',
        transporterCostFxRate: transporterCostMinorUnits === undefined ? undefined : transporterCostMinorUnits === null ? null : 1.0,
        transporterCostBaseAmountMinorUnits: transporterCostMinorUnits,
        /* The operator's own read of the delivery. `undefined` when absent, so
           re-saving a booking for any other reason never wipes a note that was
           written when it was delivered. */
        driverRating: dto.driverRating,
        driverRatingReliability: dto.driverRatingReliability,
        driverRatingPunctuality: dto.driverRatingPunctuality,
        driverRatingProfessionalism: dto.driverRatingProfessionalism,
        driverNote: dto.driverNote,
        /* Stamped from the token, never from the body: a debrief is somebody's
           opinion with their name on it, so the name has to be one the client
           cannot choose. Only written when the call actually carries a debrief,
           so an unrelated edit never re-signs an existing one. */
        ...(wroteDebrief && user
          ? {
              driverRatedById: user.id,
              driverRatedByName: `${user.firstName} ${user.lastName}`.trim() || user.email,
              driverRatedAt: new Date(),
            }
          : {}),
        /* Who is taking the empty back. Cleared with the rest of the fleet
           when the booking moves to another transporter — the same rule and the
           same reason: a driver from the old carrier cannot run the new one's
           return either. */
        returnVehicleId: clearFleet ? null : dto.returnVehicleId,
        returnDriverId: clearFleet ? null : dto.returnDriverId,
        /* The return driver's debrief. */
        returnDriverRating: dto.returnDriverRating,
        returnDriverRatingReliability: dto.returnDriverRatingReliability,
        returnDriverRatingPunctuality: dto.returnDriverRatingPunctuality,
        returnDriverRatingProfessionalism: dto.returnDriverRatingProfessionalism,
        returnDriverNote: dto.returnDriverNote,
        ...(wroteReturnDebrief && user
          ? {
              returnDriverRatedById: user.id,
              returnDriverRatedByName: `${user.firstName} ${user.lastName}`.trim() || user.email,
              returnDriverRatedAt: new Date(),
            }
          : {}),
        containerNumber: dto.containerNumber,
        shippingLine: dto.shippingLine,
        containerReturnDepot: dto.containerReturnDepot,
        containerReturnDeadline: dto.containerReturnDeadline ? new Date(dto.containerReturnDeadline) : undefined,
        containerReturnFreeDays: dto.containerReturnFreeDays,
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });

    /* A booking that moved rung takes its shipment's derived status with it,
     * exactly as a real status write would. */
    if (restated) {
      await syncShipmentFromBookings(this.prisma, updated.shipmentId);
      await this.emptyReturns.syncCycleStatusForBooking(updated.id, restated);
    }

    return updated;
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
    if ((dto.status === 'Heading to Pickup' || dto.status === 'En Route') && !existing.vehicleId) {
      throw new BadRequestException(`A booking cannot move to "${dto.status}" without an assigned vehicle`);
    }
    // Belt-and-braces: a booking that reached "En Route" before this rule
    // existed could still be missing a vehicle by the time it's completed.
    /* When it happened, not when it was typed. Every rung asks for this now:
     * a status is a report of the world, and the office is always behind the
     * yard. Read up here because the empty-return settle below is stamped
     * with the same reported moment. */
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    if (dto.status === 'Completed' && !existing.vehicleId) {
      throw new BadRequestException('A booking cannot be completed without an assigned vehicle');
    }

    /* ── THE DELIVERY IS PROVEN, OR IT DID NOT HAPPEN ──
     *
     * `Arrived` is the rung where the cargo reaches the consignee, and it is
     * the last one anybody may claim on their own word. Everything downstream
     * hangs off it — the box becomes an empty, detention starts, the payout is
     * released — so a delivery nobody can evidence would put all three in
     * motion on an assertion.
     *
     * Gated at `Arrived` rather than at `POD Submitted`, which is where it sat
     * before 2026-08-26: the operator marking the drop is the person holding
     * the signed note, and asking for it two rungs later means asking somebody
     * else, later, for paper they never had. The frontend puts the uploader in
     * the same dialog that records the moment, so the file and the timestamp
     * are one action.
     *
     * Only this rung is gated. A booking already past it — every row delivered
     * before this rule existed — still moves freely; the guard is about what
     * is being claimed now, not a re-audit of the book. */
    if (dto.status === 'Arrived' && !(await hasProofOfDelivery(this.prisma, existing.id))) {
      throw new BadRequestException(
        `Booking "${existing.reference}" cannot be marked delivered without its proof of delivery. ` +
          'Attach the signed delivery note and record the drop again.',
      );
    }

    /* ── AND SO IS THE RETURN ──
     *
     * The same rule at the other end. "Empty Returned" says the depot took the
     * box back, which is the fact detention stops on and the job closes on, so
     * it needs the depot's own receipt behind it.
     *
     * Before `recordReturnedAt` below, deliberately: that call writes the
     * cycle's `returnedAt`, and a refused completion that had already stamped
     * the cycle would leave the two records disagreeing about whether the
     * container is home.
     *
     * A box with no container number has no return to prove, and an empty
     * matched to an outbound load never goes back to a depot at all — it is
     * reloaded where it stands and closed by the Empty Returns module, which
     * does not come through here. */
    if (dto.status === 'Completed' && existing.containerNumber && !(await hasProofOfReturn(this.prisma, existing.id))) {
      throw new BadRequestException(
        `Booking "${existing.reference}" cannot be completed without its proof of return. ` +
          'Attach the depot receipt for the empty container and record the return again.',
      );
    }

    /* Marking a booking "Empty Returned" IS the report that the box is home.
     * The dispatcher on this booking is the person who watches it arrive, so
     * this writes the cycle's `returnedAt` rather than making them go and find
     * the Empty Returns module to say the same thing. `isEmptyReturnSettled`
     * below then passes on its own terms — the guard is satisfied, not
     * bypassed, and the two records agree on the moment. */
    if (dto.status === 'Completed' && existing.containerNumber) {
      await this.emptyReturns.recordReturnedAt(existing.id, occurredAt);
    }
    /* A bulk or machinery load has no box, so it has no "empty ready" moment
     * to record. The ladder skips the rung for it (`Completed` stays reachable
     * from any state), and claiming it here would put a container that does
     * not exist into Empty Return's pool. */
    if (dto.status === 'Empty Ready' && !existing.containerNumber) {
      throw new BadRequestException(
        `Booking "${existing.reference}" carries no container, so it has no empty return to start.`,
      );
    }
    // The container cycle is part of the job. A box still at the consignee's
    // yard — or not yet matched to a truck taking it back — is outstanding
    // work, and detention accrues against it daily, so the booking carrying
    // it is not finished. It is completed for us by the Empty Returns module
    // the moment the box lands back at the depot (`completeOnEmptyReturn`),
    // which is why nothing here needs to poll or be re-clicked.
    if (dto.status === 'Completed' && !(await isEmptyReturnSettled(this.prisma, existing))) {
      throw new BadRequestException(
        `Booking "${existing.reference}" cannot be completed while its container is still out. ` +
          'It closes automatically once the empty return is confirmed.',
      );
    }


    const booking = await this.prisma.booking.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'Completed' ? occurredAt : undefined,
        /* The moment the whole return side counts from — matching offers the
         * box from here, and detention runs from here. Stamped once: walking
         * back down the ladder and up it again must not restart the clock. */
        emptyReadyAt:
          dto.status === 'Empty Ready' && !existing.emptyReadyAt ? occurredAt : undefined,
        timeline: {
          create: {
            key: timelineKeyForStatus(dto.status),
            title: `Status changed to ${dto.status}`,
            description: `Booking marked as ${dto.status}`,
            timestamp: occurredAt,
            status: 'completed',
          },
        },
      },
      include: { timeline: { orderBy: { createdAt: 'asc' } }, ...this.bookingDetailInclude },
    });

    /* A box matched before it was emptied already has a cycle carrying its own
     * copy of this instant — keep the two saying the same thing. */
    if (dto.status === 'Empty Ready' && !existing.emptyReadyAt) {
      await this.prisma.emptyReturnCycle.updateMany({
        where: { bookingId: booking.id, emptyReadyAt: null },
        data: { emptyReadyAt: occurredAt },
      });
    }

    // The one line that replaces the whole manual milestone clicker: if this
    // booking is somebody's matched outbound load, its cycle now reflects
    // reality instead of waiting for a button to be pressed.
    await this.emptyReturns.syncCycleStatusForBooking(booking.id, booking.status);

    // Same idea one level up: the shipment this booking belongs to is a job
    // over its containers, so its status is re-read from them here rather
    // than moved by a second, independent button.
    await syncShipmentFromBookings(this.prisma, booking.shipmentId);

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
    const booking = await this.prisma.booking.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    // Removing the container that was holding the job back can complete it.
    await syncShipmentFromBookings(this.prisma, booking.shipmentId);
    return booking;
  }
}
