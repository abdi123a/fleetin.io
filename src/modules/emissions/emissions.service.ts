import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';

/**
 * Carbon, from the truck to the dashboard.
 *
 * ## The one rule
 *
 * A booking's emissions are computed **once**, from the factor its truck had
 * at the time, and are never re-derived from the vehicle's present factor.
 * Everything else here is in service of that:
 *
 *   - `snapshotFactor` copies `Vehicle.co2PerKm` onto the booking, and is
 *     called only when the assignment actually changes.
 *   - `recompute` multiplies the *stored* snapshot by the *stored* distance.
 *     It never reads the vehicle.
 *
 * Correcting a truck's model year next March must not move last quarter's
 * number, because that number has been reported to a shipper.
 *
 * ## Carbon accrues; it is not forecast
 *
 * A container run is not one hop. The real movement is
 *
 *     Garage → Port → Free Zone → Port → Free Zone
 *
 * and — this is the rule the whole module turns on — **a leg is counted only
 * once it has actually been driven.** Not when the booking is created, not
 * when a truck is assigned, not from the lane the job was quoted on. A trip
 * that has not happened has emitted nothing, and a figure that says otherwise
 * is a forecast wearing a measurement's clothes.
 *
 * So the legs arrive as the ladder reaches the rungs that prove them:
 *
 * | Rung reached      | What became true              | Leg added      |
 * |-------------------|-------------------------------|----------------|
 * | `Arrived`         | the box reached the consignee | `loaded`       |
 * | `Empty Picked Up` | a truck has the empty         | `empty_return` |
 *
 * Below `Arrived` a booking has **no** carbon figure at all — not zero, which
 * would read as "measured and found to be nothing", but nothing. The number
 * grows through the job, one movement at a time, and the last leg lands when
 * the box is home.
 *
 * Each leg is measured between two catalogue locations through
 * `LocationsService.distanceBetween` — the same Google Routes call and the
 * same permanent per-lane cache the shipment wizard uses, so a leg down a lane
 * anybody has driven before costs nothing.
 *
 * A movement Fleetin does not record — a positioning run from the yard, a
 * second collection — is entered by whoever watched it, through
 * `replaceRoute`. What is never done is inventing one: a booking whose depot
 * cannot be resolved to a real place keeps the legs that are real and says so
 * in `notes`.
 */
@Injectable()
export class EmissionsService {
  private readonly logger = new Logger(EmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  /* ── Writing one booking's carbon ────────────────────────────────────── */

  /**
   * Copy the assigned truck's factor onto the booking and re-price it.
   *
   * Called from `BookingsService` when — and only when — the vehicle on a
   * booking changes. A different truck is a different factor; the same truck
   * later re-rated is not.
   *
   * Clearing the vehicle clears the snapshot and the emissions with it: a
   * booking nobody is dispatched to make has not emitted anything, and leaving
   * the old figure behind would keep charging a fleet for a trip it is no
   * longer down to run.
   */
  async snapshotFactor(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, vehicleId: true },
    });
    if (!booking) return;

    if (!booking.vehicleId) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          co2FactorUsed: null,
          co2EmissionsKg: null,
          co2ComputedAt: null,
        },
      });
      return;
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: booking.vehicleId },
      select: { co2PerKm: true },
    });

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { co2FactorUsed: vehicle?.co2PerKm ?? null },
    });

    await this.recompute(booking.id);
  }

  /**
   * distance driven × snapshotted factor → emissions. Reads no vehicle.
   *
   * The distance is the sum of the legs, and **only** the legs. There is no
   * fallback to the shipment's quoted lane: that number describes a journey
   * somebody planned, and this column describes one a truck made. A booking
   * with no completed movement gets `null` across all three columns — the
   * screens then draw nothing, which is the truthful answer, rather than a
   * zero that reads as a measurement.
   */
  async recompute(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        co2FactorUsed: true,
        shipmentId: true,
        routeLegs: { select: { distanceMeters: true } },
      },
    });
    if (!booking) return;

    const legMetres = booking.routeLegs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
    const distanceKm = legMetres > 0 ? round2(legMetres / 1000) : null;

    const factor = booking.co2FactorUsed === null ? null : Number(booking.co2FactorUsed);
    const emissions = factor === null || distanceKm === null ? null : round2(distanceKm * factor);

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        actualDistanceKm: distanceKm,
        co2DistanceSource: distanceKm === null ? null : 'legs',
        co2EmissionsKg: emissions,
        co2ComputedAt: emissions === null ? null : new Date(),
      },
    });

    /* The shipment carries the sum of its containers, so the shipments list
       can print a job's carbon without loading every booking under it. Rolled
       up here, from the booking write that changed it — one writer, and the
       total can never disagree with the cards it is a total of. */
    await this.rollUpShipment(booking.shipmentId);
  }

  /**
   * A shipment's carbon and truck-kilometres: the sum of its bookings.
   *
   * Distance is the sum of the *trucks'* roads, not the length of the lane.
   * Five containers down a 27 km corridor is 135 truck-kilometres, and that is
   * what produced the carbon.
   */
  async rollUpShipment(shipmentId: string): Promise<void> {
    const totals = await this.prisma.booking.aggregate({
      where: { shipmentId, deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } },
      _sum: { co2EmissionsKg: true, actualDistanceKm: true },
    });

    const co2 = totals._sum.co2EmissionsKg;
    const km = totals._sum.actualDistanceKm;

    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        /* Null, not zero, while nothing has moved — the same distinction the
           booking columns make, carried up so a list row can stay silent
           rather than claim a shipment emitted nothing. */
        co2EmissionsKg: co2 === null ? null : round2(Number(co2)),
        co2DistanceKm: km === null ? null : round2(Number(km)),
      },
    });
  }

  /* ── The route ───────────────────────────────────────────────────────── */

  async routeFor(bookingId: string) {
    const booking = await this.resolveBooking(bookingId);
    const legs = await this.prisma.bookingRouteLeg.findMany({
      where: { bookingId: booking.id },
      orderBy: { sequence: 'asc' },
    });
    return {
      bookingId: booking.id,
      reference: booking.reference,
      legs,
      totalDistanceKm: round2(legs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000),
      actualDistanceKm: numberOrNull(booking.actualDistanceKm),
      co2FactorUsed: numberOrNull(booking.co2FactorUsed),
      co2EmissionsKg: numberOrNull(booking.co2EmissionsKg),
      co2DistanceSource: booking.co2DistanceSource,
    };
  }

  /**
   * Re-derive this booking's movement from what has actually happened, and
   * measure it.
   *
   * Two legs are derivable, and each waits for the rung that proves it:
   *
   *   1. **loaded** — pickup to delivery, once the booking has reached
   *      `Arrived`. That is the rung where the box is at the consignee, and
   *      it is the one gated on a proof of delivery, so it is the first
   *      moment anybody can say the drive was made rather than planned.
   *   2. **empty_return** — delivery back to the return depot, once the empty
   *      has been picked up. A box still sitting in a yard has not made that
   *      drive.
   *
   * A booking below `Arrived` therefore measures to nothing, and `recompute`
   * clears its columns. This is the point: carbon accrues through the job, one
   * completed movement at a time.
   *
   * A depot whose name is not in the catalogue is reported in `notes` and
   * skipped rather than guessed at.
   */
  async rebuildRoute(bookingId: string): Promise<{
    legs: number;
    distanceKm: number;
    notes: string[];
  }> {
    const booking = await this.resolveBooking(bookingId);
    const notes: string[] = [];

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: booking.shipmentId },
      select: {
        pickupLocationId: true,
        pickupLocationName: true,
        deliveryLocationId: true,
        deliveryLocationName: true,
      },
    });

    type Stop = { locationId: string | null; name: string };
    /** The drive, as an ordered list of places. Consecutive pairs become legs. */
    const stops: { stop: Stop; purpose: string }[] = [];

    /* Has the load actually been delivered? Nothing below this rung has
       driven anywhere worth counting, and a booking sitting at "Assigned" is
       a plan, not a journey. */
    if (!hasDelivered(booking.status)) {
      await this.replaceLegs(booking.id, []);
      await this.recompute(booking.id);
      return {
        legs: 0,
        distanceKm: 0,
        notes: [
          `This container has not been delivered yet, so no distance has been driven to measure. Its carbon is counted as the job moves — the delivery leg lands at "${DELIVERED_RUNG}".`,
        ],
      };
    }

    if (shipment?.pickupLocationId && shipment?.deliveryLocationId) {
      stops.push({
        stop: { locationId: shipment.pickupLocationId, name: shipment.pickupLocationName },
        purpose: 'loaded',
      });
      stops.push({
        stop: { locationId: shipment.deliveryLocationId, name: shipment.deliveryLocationName },
        purpose: 'loaded',
      });
    } else {
      notes.push(
        'This shipment is not linked to catalogue locations, so no leg could be measured. Link its pickup and delivery on the shipment first.',
      );
    }

    /* The empty going home. Only once it has actually been collected — see the
       method comment. `Completed` implies it. */
    const emptyCollected = hasCollectedEmpty(booking.status);
    if (emptyCollected && booking.containerReturnDepot && shipment?.deliveryLocationId) {
      const depot = await this.resolveDepot(booking.containerReturnDepot);
      if (depot) {
        stops.push({ stop: { locationId: depot.id, name: depot.name }, purpose: 'empty_return' });
      } else {
        notes.push(
          `Return depot "${booking.containerReturnDepot}" is not in the location catalogue, so the empty leg was not measured. Add it under Locations to include it.`,
        );
      }
    }

    const legs: Prisma.BookingRouteLegCreateManyInput[] = [];
    for (let i = 1; i < stops.length; i += 1) {
      const from = stops[i - 1].stop;
      const to = stops[i].stop;
      if (!from.locationId || !to.locationId || from.locationId === to.locationId) continue;

      try {
        const measured = await this.locations.distanceBetween(from.locationId, to.locationId);
        legs.push({
          bookingId: booking.id,
          sequence: legs.length + 1,
          originLocationId: from.locationId,
          destinationLocationId: to.locationId,
          originName: from.name,
          destinationName: to.name,
          distanceMeters: measured.distanceMeters,
          durationSeconds: measured.durationSeconds,
          provider: measured.provider,
          purpose: stops[i].purpose,
        });
      } catch (error) {
        /* A lane Google would not answer for is a gap in the route, not a
           reason to lose the legs around it.
           With no Maps key at all, `distanceBetween` does not throw — it
           returns the straight line between the two pins, and the leg is
           stored with `provider: 'haversine'` so every screen can say so.
           That is deliberately preferred to storing nothing: a marked
           crow-flight figure is usable and a blank is not. */
        notes.push(`Could not measure ${from.name} → ${to.name}.`);
        this.logger.warn(
          `Distance failed for booking ${booking.reference}: ${from.name} → ${to.name} — ${String(error)}`,
        );
      }
    }

    await this.replaceLegs(booking.id, legs);
    await this.recompute(booking.id);

    return {
      legs: legs.length,
      distanceKm: round2(legs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000),
      notes,
    };
  }

  /**
   * The route as somebody who watched it drive says it went.
   *
   * Takes an ordered list of stops and measures between each consecutive pair.
   * This is how a positioning leg from the transporter's yard, or a second
   * collection, gets into the total — Fleetin does not record where a truck
   * sleeps, so it cannot derive that leg, but it can price it once told.
   */
  async replaceRoute(
    bookingId: string,
    stops: { locationId: string; purpose?: string }[],
  ): Promise<{ legs: number; distanceKm: number; notes: string[] }> {
    const booking = await this.resolveBooking(bookingId);
    const notes: string[] = [];

    const rows = await this.prisma.location.findMany({
      where: { id: { in: stops.map((s) => s.locationId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(rows.map((r) => [r.id, r.name]));

    const legs: Prisma.BookingRouteLegCreateManyInput[] = [];
    for (let i = 1; i < stops.length; i += 1) {
      const from = stops[i - 1];
      const to = stops[i];
      if (from.locationId === to.locationId) continue;
      if (!nameById.has(from.locationId) || !nameById.has(to.locationId)) {
        notes.push('A stop in this route is not a known location and was skipped.');
        continue;
      }
      try {
        const measured = await this.locations.distanceBetween(from.locationId, to.locationId);
        legs.push({
          bookingId: booking.id,
          sequence: legs.length + 1,
          originLocationId: from.locationId,
          destinationLocationId: to.locationId,
          originName: nameById.get(from.locationId)!,
          destinationName: nameById.get(to.locationId)!,
          distanceMeters: measured.distanceMeters,
          durationSeconds: measured.durationSeconds,
          provider: measured.provider,
          purpose: to.purpose ?? 'manual',
        });
      } catch {
        notes.push(
          `Could not measure ${nameById.get(from.locationId)} → ${nameById.get(to.locationId)}.`,
        );
      }
    }

    await this.replaceLegs(booking.id, legs);
    await this.recompute(booking.id);

    return {
      legs: legs.length,
      distanceKm: round2(legs.reduce((sum, l) => sum + l.distanceMeters, 0) / 1000),
      notes,
    };
  }

  /** Legs are rewritten as a set, never appended to — see the model comment. */
  private async replaceLegs(bookingId: string, legs: Prisma.BookingRouteLegCreateManyInput[]) {
    await this.prisma.$transaction([
      this.prisma.bookingRouteLeg.deleteMany({ where: { bookingId } }),
      ...(legs.length ? [this.prisma.bookingRouteLeg.createMany({ data: legs })] : []),
    ]);
  }

  /**
   * The catalogue row an empty-return depot name refers to.
   *
   * Exact name first. The aliases below are the spellings the booking book
   * actually uses — an operator writes "SGTD Empty Yard" for the yard beside
   * the SGTD terminal — and they are written out one by one for the same
   * reason the locations migration wrote its own out: a fuzzy match gets some
   * of them and silently misses the rest, and a half-measured route is worse
   * than an unmeasured one because nothing tells you which half is missing.
   */
  private async resolveDepot(depotName: string) {
    const name = depotName.trim();

    const exact = await this.prisma.location.findFirst({
      where: { name, deletedAt: null },
      select: { id: true, name: true },
    });
    if (exact) return exact;

    const alias = DEPOT_ALIASES[name];
    if (!alias) return null;

    return this.prisma.location.findFirst({
      where: { name: alias, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  private async resolveBooking(idOrReference: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: idOrReference }, { reference: idOrReference }], deletedAt: null },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${idOrReference}" not found`);
    return booking;
  }

  /* ── Reading the fleet's carbon ──────────────────────────────────────── */

  /**
   * Everything the Emissions dashboard draws, in one call.
   *
   * One request rather than six: every panel is a different cut of the same
   * filtered set of bookings, and six endpoints would mean six passes over it
   * and six chances for the KPI row to disagree with the chart under it.
   *
   * Aggregated in TypeScript over a narrow `select`. At this book's size that
   * is a few hundred rows and well under a millisecond; `MAX_ROWS` is the
   * backstop, and when it bites the response says so rather than quietly
   * reporting a partial fleet as the whole one.
   */
  async dashboard(filters: EmissionsFilters) {
    const where = this.buildWhere(filters);

    const rows = await this.prisma.booking.findMany({
      where,
      take: MAX_ROWS + 1,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        status: true,
        actualDistanceKm: true,
        co2FactorUsed: true,
        co2EmissionsKg: true,
        co2DistanceSource: true,
        completedAt: true,
        scheduledPickupTime: true,
        createdAt: true,
        shipmentId: true,
        shipment: { select: { reference: true } },
        partner: { select: { id: true, companyLegalName: true } },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            truckType: true,
            fuelType: true,
            make: true,
            model: true,
          },
        },
      },
    });

    const truncated = rows.length > MAX_ROWS;
    const bookings = truncated ? rows.slice(0, MAX_ROWS) : rows;

    let totalCo2Kg = 0;
    let totalDistanceKm = 0;
    let measuredCount = 0;
    const shipmentIds = new Set<string>();

    const byVehicle = new Map<string, Bucket & { plateNumber: string; truckType: string; fuelType: string }>();
    const byTransporter = new Map<string, Bucket & { name: string }>();
    const byShipment = new Map<string, Bucket & { reference: string }>();
    const byMonth = new Map<string, Bucket>();
    const scatter: { bookingRef: string; distanceKm: number; co2Kg: number; truckType: string }[] = [];

    for (const b of bookings) {
      const co2 = numberOrNull(b.co2EmissionsKg) ?? 0;
      const km = numberOrNull(b.actualDistanceKm) ?? 0;

      totalCo2Kg += co2;
      totalDistanceKm += km;
      if (b.co2DistanceSource === 'legs') measuredCount += 1;
      shipmentIds.add(b.shipmentId);

      if (b.vehicle) {
        add(byVehicle, b.vehicle.id, co2, km, {
          plateNumber: b.vehicle.plateNumber,
          truckType: b.vehicle.truckType,
          fuelType: b.vehicle.fuelType,
        });
      }
      if (b.partner) {
        add(byTransporter, b.partner.id, co2, km, { name: b.partner.companyLegalName });
      }
      add(byShipment, b.shipmentId, co2, km, { reference: b.shipment?.reference ?? '—' });

      const when = b.completedAt ?? b.scheduledPickupTime ?? b.createdAt;
      add(byMonth, monthKey(when), co2, km, {});

      if (km > 0) {
        scatter.push({
          bookingRef: b.reference,
          distanceKm: round2(km),
          co2Kg: round2(co2),
          truckType: b.vehicle?.truckType ?? 'Unassigned',
        });
      }
    }

    return {
      kpis: {
        totalCo2Kg: round2(totalCo2Kg),
        totalDistanceKm: round2(totalDistanceKm),
        /* The fleet's realised rate — total over total, NOT the mean of each
           booking's factor. Averaging factors would weight a 4 km shunt the
           same as a 400 km run and report a number no truck ever achieved. */
        avgCo2PerKm: totalDistanceKm > 0 ? round3(totalCo2Kg / totalDistanceKm) : 0,
        bookingCount: bookings.length,
        shipmentCount: shipmentIds.size,
        /* How much of the above stands on a measured route rather than the
           shipment's quoted hop. A dashboard that does not say this is
           claiming more precision than it has. */
        measuredBookingCount: measuredCount,
      },
      series: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, bucket]) => ({
          month,
          co2Kg: round2(bucket.co2Kg),
          distanceKm: round2(bucket.distanceKm),
          bookings: bucket.bookings,
        })),
      byVehicle: rank(byVehicle, (id, v) => ({
        id,
        label: v.plateNumber,
        sublabel: `${v.truckType} · ${v.fuelType}`,
        co2Kg: round2(v.co2Kg),
        distanceKm: round2(v.distanceKm),
        bookings: v.bookings,
      })),
      byTransporter: rank(byTransporter, (id, v) => ({
        id,
        label: v.name,
        co2Kg: round2(v.co2Kg),
        distanceKm: round2(v.distanceKm),
        bookings: v.bookings,
      })),
      byShipment: rank(byShipment, (id, v) => ({
        id,
        label: v.reference,
        co2Kg: round2(v.co2Kg),
        distanceKm: round2(v.distanceKm),
        bookings: v.bookings,
      })),
      /* One dot per container run, SAMPLED. Unbounded, this was one point per
         booking in the filtered set: fine on a demo book, and tens of
         thousands of SVG nodes on a real one — enough to make the chart
         library fall over in the browser rather than draw anything. The
         sample is evenly spaced through the set rather than the first N, so
         the shape of the cloud survives, and `scatterOf` says how many runs
         it stands for so nothing reads as the whole book. */
      scatter: sample(scatter, MAX_SCATTER_POINTS),
      scatterOf: scatter.length,
      /* The true sizes, before `rank` capped each list — so a reader is told
         "top 200 of 4,812" instead of being shown 200 and left to assume that
         is all there is. */
      counts: {
        vehicles: byVehicle.size,
        transporters: byTransporter.size,
        shipments: byShipment.size,
      },
      truncated,
    };
  }

  /** The options each filter offers, taken from rows that actually exist. */
  async filterOptions() {
    const [partners, vehicles] = await Promise.all([
      this.prisma.partner.findMany({
        where: { deletedAt: null, bookings: { some: { deletedAt: null } } },
        select: { id: true, companyLegalName: true },
        orderBy: { companyLegalName: 'asc' },
      }),
      this.prisma.vehicle.findMany({
        where: { deletedAt: null },
        select: { id: true, plateNumber: true, truckType: true, fuelType: true, co2PerKm: true },
        orderBy: { plateNumber: 'asc' },
      }),
    ]);

    return {
      transporters: partners.map((p) => ({ id: p.id, name: p.companyLegalName })),
      vehicles: vehicles.map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        truckType: v.truckType,
        fuelType: v.fuelType,
        co2PerKm: numberOrNull(v.co2PerKm),
      })),
      truckTypes: [...new Set(vehicles.map((v) => v.truckType))].sort(),
    };
  }

  private buildWhere(filters: EmissionsFilters): Prisma.BookingWhereInput {
    const {
      dateFrom,
      dateTo,
      transporterId,
      vehicleId,
      truckType,
      shipmentId,
      bookingId,
      scope,
    } = filters;

    /* The date a trip *ran*, not the date its row was written. A booking
       created in March and delivered in April belongs to April's carbon, and
       `createdAt` is only the fallback for one that has neither. */
    const dateFilter: Prisma.BookingWhereInput[] = [];
    if (dateFrom || dateTo) {
      const range = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
      };
      dateFilter.push({
        OR: [
          { completedAt: range },
          { AND: [{ completedAt: null }, { scheduledPickupTime: range }] },
          { AND: [{ completedAt: null }, { scheduledPickupTime: null }, { createdAt: range }] },
        ],
      });
    }

    return {
      deletedAt: null,
      /* Cancelled and failed runs are excluded everywhere else a trip is
         counted (see `LIVE_BOOKINGS` in the vehicles service); a trip that
         never happened emitted nothing. */
      status: { notIn: ['Cancelled', 'Failed'] },
      ...(transporterId ? { partnerId: transporterId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(truckType ? { vehicle: { truckType } } : {}),
      ...(shipmentId ? { OR: [{ shipmentId }, { shipment: { reference: shipmentId } }] } : {}),
      ...(bookingId ? { OR: [{ id: bookingId }, { reference: bookingId }] } : {}),
      ...((scope ?? {}) as Prisma.BookingWhereInput),
      ...(dateFilter.length ? { AND: dateFilter } : {}),
    };
  }
}

export interface EmissionsFilters {
  dateFrom?: string;
  dateTo?: string;
  transporterId?: string;
  vehicleId?: string;
  truckType?: string;
  shipmentId?: string;
  bookingId?: string;
  /** Portal callers see only their own company's runs — BR-10.5. */
  scope?: Record<string, unknown> | null;
}

/**
 * The rung at which the loaded drive has demonstrably been made.
 *
 * `Arrived` is where the box reaches the consignee, and it is the one rung
 * gated on a proof of delivery (`hasProofOfDelivery`) — so it is the first
 * point at which the journey is evidenced rather than asserted. Everything
 * above it implies it.
 */
export const DELIVERED_RUNG = 'Arrived';

/** Rungs at or above `Arrived`, in ladder order. */
const DELIVERED_OR_LATER = [
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Empty Ready',
  'Empty Picked Up',
  'Completed',
];

/** Rungs at which a truck demonstrably has the empty box on it. */
const EMPTY_COLLECTED_OR_LATER = ['Empty Picked Up', 'Completed'];

function hasDelivered(status: string): boolean {
  return DELIVERED_OR_LATER.includes(status);
}

function hasCollectedEmpty(status: string): boolean {
  return EMPTY_COLLECTED_OR_LATER.includes(status);
}

/**
 * The spellings the booking book uses for a depot, mapped to catalogue names.
 * See `resolveDepot`.
 */
const DEPOT_ALIASES: Record<string, string> = {
  'PK12 Empty Park': 'PK12 Dry Port',
  'SGTD Empty Yard': 'Doraleh Container Terminal (SGTD)',
  'Damerjog Container Depot': 'Damerjog Industrial Park',
};

/**
 * How many bookings one dashboard call will aggregate. Generous — the whole
 * book is a fraction of it today — and the response flags when it bites.
 */
const MAX_ROWS = 20000;

/** Rows per ranking in one response. The dashboard pages through these. */
const MAX_RANKED_ROWS = 200;

/** Dots the scatter will draw. Beyond this the chart is a smear, not a chart. */
const MAX_SCATTER_POINTS = 1500;

interface Bucket {
  co2Kg: number;
  distanceKm: number;
  bookings: number;
}

function add<T extends Bucket>(
  map: Map<string, T>,
  key: string,
  co2Kg: number,
  distanceKm: number,
  extra: Omit<T, keyof Bucket>,
) {
  const existing = map.get(key);
  if (existing) {
    existing.co2Kg += co2Kg;
    existing.distanceKm += distanceKm;
    existing.bookings += 1;
    return;
  }
  map.set(key, { co2Kg, distanceKm, bookings: 1, ...extra } as T);
}

/**
 * The ranked list, biggest first and **bounded**.
 *
 * A fleet of five thousand trucks would otherwise put five thousand rows into
 * every dashboard response, to draw eight of them. The cap is generous enough
 * that the pager still has plenty to walk through, and `counts` above reports
 * the real size so the cap is stated rather than hidden.
 */
function rank<T extends Bucket, R extends { co2Kg: number }>(
  map: Map<string, T>,
  shape: (id: string, value: T) => R,
): R[] {
  return [...map.entries()]
    .map(([id, value]) => shape(id, value))
    .sort((a, b) => b.co2Kg - a.co2Kg)
    .slice(0, MAX_RANKED_ROWS);
}

/** An evenly spaced sample, preserving first and last. */
function sample<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const step = rows.length / limit;
  const out: T[] = [];
  for (let i = 0; i < limit; i += 1) out.push(rows[Math.floor(i * step)]);
  return out;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function numberOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
