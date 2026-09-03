import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { DELIVERED_STATUSES } from '../empty-returns/empty-return-status.util';
import {
  ARRIVAL_KEY,
  EMPTY_COLLECTED_KEY,
  PICKUP_EVIDENCE_KEYS,
  avoidedMetres,
  avoidedProvider,
  classifyContinuation,
  earliestTimestamp,
  modelOf,
  pickCounted,
  type ImpactModel,
  type ImpactSource,
  type ImpactStatus,
} from './carbon-impact.util';

/**
 * Fleetin Impact — the evidence that a repositioning was eliminated, kept
 * on the match that eliminated it.
 *
 * Reads bookings, their rungs and their legs; measures two roads through
 * the same permanent distance cache the shipment wizard uses; writes the
 * verdict onto `EmptyReturnCycle`. It never touches a booking's own carbon
 * columns — what was driven was driven, and this is the separate account of
 * what was not. See `carbon-impact.util.ts` for the model.
 *
 * ## When it runs
 *
 * On the rungs that make the answer knowable and on nothing else:
 *
 *   - the pairing is confirmed         → `matched`, the partner named
 *   - the empty is collected           → still `matched`, half the evidence
 *   - the next load is delivered       → the verdict: `realized` or not
 *   - an operator says what happened   → their word, never overruled after
 *
 * plus `rebuildAll` for the book as it stood before this existed. Each pass
 * is idempotent: the same facts give the same row.
 */
@Injectable()
export class CarbonImpactService {
  private readonly logger = new Logger(CarbonImpactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  /* ── Judging one match ────────────────────────────────────────────────── */

  /**
   * Evaluate one cycle from what is on record, and write the result.
   *
   * `decision` is an operator's word. It sets the status and is remembered:
   * later automatic passes re-measure the distances but keep the person's
   * verdict, because "the truck went home" is a fact they saw and the rungs
   * did not.
   */
  async evaluateCycle(cycleId: string, decision?: OperatorDecision): Promise<CycleImpactView | null> {
    const cycle = await this.prisma.emptyReturnCycle.findFirst({
      where: { OR: [{ id: cycleId }, { reference: cycleId }] },
      include: CYCLE_INCLUDE,
    });
    if (!cycle) throw new NotFoundException(`Cycle with ID "${cycleId}" not found`);

    const empty = cycle.booking;
    const next = cycle.nextBooking;

    /* A standalone return has no continuation to judge. Any impact left on it
       by an earlier pairing that was since cancelled is cleared. */
    if (!next) {
      if (cycle.impactStatus) {
        await this.prisma.emptyReturnCycle.update({ where: { id: cycle.id }, data: CLEARED });
      }
      return null;
    }

    /* Two carriers, possibly one: A owns the empty and its return, B runs the
       next load. On a continuation they are the same company and the same
       garage. */
    const emptyPartner = empty.partner;
    const nextPartner = next.partner;
    const garageAId = emptyPartner?.garageLocationId ?? null;
    const garageBId = nextPartner?.garageLocationId ?? null;
    const [garageA, garageB] = await Promise.all([
      garageAId ? this.prisma.location.findUnique({ where: { id: garageAId }, select: { id: true, name: true } }) : null,
      garageBId ? this.prisma.location.findUnique({ where: { id: garageBId }, select: { id: true, name: true } }) : null,
    ]);

    /* Case 3, on record: a positioning leg through A's garage after the empty
       leg, or one out of B's garage before the next load. Operators enter
       these through `replaceRoute`; nothing derives them. */
    const lastEmptyLeg = empty.routeLegs
      .filter((leg) => leg.purpose === 'empty_return')
      .reduce((max, leg) => Math.max(max, leg.sequence), 0);
    const garageStopRecorded =
      (Boolean(garageAId) &&
        empty.routeLegs.some(
          (leg) =>
            leg.purpose === 'positioning' &&
            leg.destinationLocationId === garageAId &&
            leg.sequence > lastEmptyLeg,
        )) ||
      (Boolean(garageBId) &&
        next.routeLegs.some((leg) => leg.purpose === 'positioning' && leg.originLocationId === garageBId));

    const emptyCollectedAt = earliestTimestamp(empty.timeline, [EMPTY_COLLECTED_KEY]);

    /* The pickup rungs are the continuation moment. A load walked straight to
       "Arrived" has none; its arrival is then the latest the pickup can have
       been, which errs towards refusing a saving rather than granting one. */
    let nextCollectedAt = earliestTimestamp(next.timeline, PICKUP_EVIDENCE_KEYS);
    let pickupNote: string | null = null;
    if (nextCollectedAt === null) {
      nextCollectedAt = earliestTimestamp(next.timeline, [ARRIVAL_KEY]);
      if (nextCollectedAt !== null) pickupNote = 'Pickup time taken from the arrival rung';
    }

    const nextDelivered = DELIVERED_STATUSES.includes(next.status) || cycle.returnedAt !== null;

    const verdict = classifyContinuation({
      emptyPartnerId: empty.partnerId,
      nextPartnerId: next.partnerId,
      /* Only a truck somebody actually recorded as fetching the empty. The
         delivery truck on the empty's booking is not that — it is who
         delivered the load days earlier. */
      emptyVehicleId: empty.returnVehicleId,
      nextVehicleId: next.vehicleId,
      emptyCollectedAt,
      nextCollectedAt,
      nextDelivered,
      garageStopRecorded,
    });

    let status: ImpactStatus = verdict.status;
    let source: ImpactSource = 'automatic';
    let decidedBy: string | null = null;
    const notes: string[] = [];
    /* Which saving this is does not depend on who decided it. */
    const model: ImpactModel | null = verdict.model ?? modelOf(empty.partnerId, next.partnerId);

    if (decision) {
      /* A person can say the truck came through when the rungs could not see
         it; the kind of saving still follows from the two carriers. */
      if (decision.realized && (!next.partnerId || !empty.partnerId)) {
        throw new ConflictException(
          `Cycle "${cycle.reference}" has a booking with no transporter — nothing to credit the saving to`,
        );
      }
      status = decision.realized ? 'realized' : 'not_realized';
      source = 'operator';
      decidedBy = decision.by;
      notes.push(
        decision.note?.trim() ||
          (decision.realized
            ? 'Continuation confirmed by operator'
            : 'Truck returned to the garage — confirmed by operator'),
      );
    } else if (cycle.impactSource === 'operator' && isImpactStatus(cycle.impactStatus)) {
      status = cycle.impactStatus;
      source = 'operator';
      decidedBy = cycle.impactDecidedBy;
      if (cycle.impactNote) notes.push(cycle.impactNote.split(' · ')[0]);
    } else {
      if (verdict.note) notes.push(verdict.note);
      if (pickupNote) notes.push(pickupNote);
    }

    /* The truck that made the continuation is the next load's — the one that
       gated in at the port. An operator's word confirms the continuation, not
       which lorry made it, so the same rule prices both. */
    const vehicleId = status === 'realized' ? (next.vehicleId ?? null) : null;
    const vehicle = vehicleId && next.vehicle?.id === vehicleId ? next.vehicle : null;

    const realizedAt =
      status === 'realized'
        ? new Date(verdict.realizedAt ?? nextCollectedAt ?? cycle.returnedAt?.getTime() ?? Date.now())
        : null;
    const continuationMinutes =
      status === 'realized'
        ? (verdict.continuationMinutes ??
          (emptyCollectedAt !== null && nextCollectedAt !== null
            ? Math.round((nextCollectedAt - emptyCollectedAt) / 60_000)
            : null))
        : null;

    /* ── The roads that were not driven ── */
    const from = empty.shipment?.deliveryLocationId
      ? { id: empty.shipment.deliveryLocationId, name: empty.shipment.deliveryLocationName }
      : null;
    const to = next.shipment?.pickupLocationId
      ? { id: next.shipment.pickupLocationId, name: next.shipment.pickupLocationName }
      : null;
    /* The garage the record names: A's — the carrier whose driving was saved. */
    const garage = garageA;

    let measured: Measured | null = null;
    if (status === 'realized' && model) {
      if (!garageA) {
        notes.push(
          `No garage recorded for ${emptyPartner?.companyLegalName ?? 'the empty’s transporter'} — distance not measured`,
        );
      } else if (model === 'handover' && !garageB) {
        notes.push(
          `No garage recorded for ${nextPartner?.companyLegalName ?? 'the next load’s transporter'} — distance not measured`,
        );
      } else if (!from || !to) {
        notes.push('A shipment end is not a catalogue location — distance not measured');
      } else {
        try {
          if (model === 'continuation') {
            /* One truck at the free zone: home and back out, not driven. */
            const toGarage = await this.measure(from.id, garageA.id);
            const fromGarage = await this.measure(garageA.id, to.id);
            measured = {
              toGarageMeters: toGarage.distanceMeters,
              fromGarageMeters: fromGarage.distanceMeters,
              detourMeters: null,
              provider: avoidedProvider(toGarage.provider, fromGarage.provider),
            };
          } else {
            /* A never came out for its box; B came through the free zone. */
            const aOut = await this.measure(garageA.id, from.id);
            const aHome = await this.measure(to.id, garageA.id);
            const bViaZone = await this.measure(garageB!.id, from.id);
            const bDirect = await this.measure(garageB!.id, to.id);
            measured = {
              toGarageMeters: aHome.distanceMeters,
              fromGarageMeters: aOut.distanceMeters,
              detourMeters: bViaZone.distanceMeters - bDirect.distanceMeters,
              provider: [aOut, aHome, bViaZone, bDirect].some((leg) => leg.provider === 'haversine')
                ? 'haversine'
                : 'google',
            };
          }
        } catch (error) {
          notes.push('The garage trip could not be measured');
          this.logger.warn(
            `Could not measure the avoided trip for cycle ${cycle.reference}: ${String(error)}`,
          );
        }
      }
    }

    const avoidedKm =
      measured === null || model === null
        ? null
        : round2(
            avoidedMetres({
              model,
              toGarage: measured.toGarageMeters,
              fromGarage: measured.fromGarageMeters,
              detour: measured.detourMeters,
            }) / 1000,
          );

    /* Whose factor prices it. A continuation is the next load's truck — the
       one that gated in. A handover is the trip A would have made, and the
       truck A would have sent is, by this app's own convention, the crew that
       delivered the box (`returnVehicleId` null means "same crew"); failing
       a factor on it, A's fleet average — a transporter-level figure, which
       is the level the user said this is judged at. */
    let factor: number | null = null;
    let factorBasis: FactorBasis | null = null;
    if (avoidedKm !== null) {
      if (model === 'continuation') {
        factor = vehicleId ? (numberOrNull(next.co2FactorUsed) ?? numberOrNull(vehicle?.co2PerKm)) : null;
        factorBasis = factor === null ? null : 'next_load_truck';
      } else {
        factor = numberOrNull(empty.co2FactorUsed) ?? numberOrNull(empty.vehicle?.co2PerKm);
        factorBasis = factor === null ? null : 'delivery_truck';
        if (factor === null && emptyPartner) {
          factor = await this.fleetAverageFactor(emptyPartner.id);
          factorBasis = factor === null ? null : 'fleet_average';
        }
        if (factor === null) notes.push('No factor on the empty’s crew or fleet — carbon not priced');
      }
    }
    const avoidedCo2 = avoidedKm !== null && factor !== null ? round2(avoidedKm * factor) : null;

    await this.prisma.emptyReturnCycle.update({
      where: { id: cycle.id },
      data: {
        impactStatus: status,
        impactModel: status === 'realized' ? model : null,
        impactEvaluatedAt: new Date(),
        impactSource: source,
        impactDecidedBy: decidedBy,
        impactNote: notes.length ? notes.join(' · ').slice(0, 255) : null,
        impactRealizedAt: realizedAt,
        impactContinuationMinutes: continuationMinutes,
        impactPartnerId: emptyPartner?.id ?? null,
        impactPartnerName: emptyPartner?.companyLegalName ?? null,
        impactNextPartnerId: nextPartner?.id ?? null,
        impactNextPartnerName: nextPartner?.companyLegalName ?? null,
        impactVehicleId: vehicleId,
        impactVehiclePlate: vehicle?.plateNumber ?? null,
        impactFromLocationId: from?.id ?? null,
        impactFromName: from?.name ?? null,
        impactGarageLocationId: garage?.id ?? null,
        impactGarageName: garage?.name ?? null,
        impactToLocationId: to?.id ?? null,
        impactToName: to?.name ?? null,
        avoidedToGarageMeters: measured?.toGarageMeters ?? null,
        avoidedFromGarageMeters: measured?.fromGarageMeters ?? null,
        avoidedDetourMeters: measured?.detourMeters ?? null,
        avoidedDistanceKm: avoidedKm,
        avoidedDistanceProvider: measured?.provider ?? null,
        avoidedCo2FactorUsed: factor,
        avoidedFactorBasis: factorBasis,
        avoidedCo2Kg: avoidedCo2,
      },
    });

    await this.settleCounting(next.id);

    const [view] = await this.views({ id: cycle.id });
    return view ?? null;
  }

  /** Every cycle this booking sits on either end of. Failures are logged, never thrown into a status write. */
  async evaluateForBooking(bookingId: string): Promise<void> {
    const cycles = await this.prisma.emptyReturnCycle.findMany({
      where: { nextBookingId: { not: null }, OR: [{ bookingId }, { nextBookingId: bookingId }] },
      select: { id: true, reference: true },
    });
    for (const cycle of cycles) {
      try {
        await this.evaluateCycle(cycle.id);
      } catch (error) {
        this.logger.warn(`Impact evaluation failed for ${cycle.reference}: ${String(error)}`);
      }
    }
  }

  /** The whole book, for the cycles that existed before this did. */
  async rebuildAll(): Promise<RebuildResult> {
    const cycles = await this.prisma.emptyReturnCycle.findMany({
      where: { nextBookingId: { not: null } },
      select: { id: true, reference: true },
      orderBy: { createdAt: 'asc' },
    });
    const result: RebuildResult = { evaluated: 0, matched: 0, realized: 0, counted: 0, notRealized: 0, failed: 0 };
    for (const cycle of cycles) {
      try {
        const view = await this.evaluateCycle(cycle.id);
        result.evaluated += 1;
        if (!view) continue;
        if (view.status === 'matched') result.matched += 1;
        if (view.status === 'realized') result.realized += 1;
        if (view.status === 'not_realized') result.notRealized += 1;
        if (view.countedAt) result.counted += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.warn(`Impact rebuild failed for ${cycle.reference}: ${String(error)}`);
      }
    }
    return result;
  }

  /**
   * One count per continuation trip.
   *
   * Several empties can ride out under one load (`Booking.emptySlots`); the
   * truck still made one trip and eliminated one garage round trip. The
   * earliest realized pairing on the load carries the count, the rest are
   * realized but not counted, and anything no longer realized loses a count
   * it may once have had.
   */
  private async settleCounting(nextBookingId: string): Promise<void> {
    const realized = await this.prisma.emptyReturnCycle.findMany({
      where: { nextBookingId, impactStatus: 'realized' },
      select: { id: true, createdAt: true, impactCountedAt: true },
    });
    const winner = pickCounted(realized);
    for (const cycle of realized) {
      const shouldCount = winner?.id === cycle.id;
      if (shouldCount && !cycle.impactCountedAt) {
        await this.prisma.emptyReturnCycle.update({ where: { id: cycle.id }, data: { impactCountedAt: new Date() } });
      } else if (!shouldCount && cycle.impactCountedAt) {
        await this.prisma.emptyReturnCycle.update({ where: { id: cycle.id }, data: { impactCountedAt: null } });
      }
    }
    await this.prisma.emptyReturnCycle.updateMany({
      where: { nextBookingId, impactStatus: { not: 'realized' }, impactCountedAt: { not: null } },
      data: { impactCountedAt: null },
    });
  }

  /* ── Reading it back ──────────────────────────────────────────────────── */

  /** The Fleetin Impact block of the dashboard, over the same filters as the carbon. */
  async summary(filters: ImpactFilters): Promise<ImpactSummary> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.emptyReturnCycle.findMany({
      where,
      take: MAX_ROWS + 1,
      orderBy: [{ impactRealizedAt: 'desc' }, { createdAt: 'desc' }],
      include: VIEW_INCLUDE,
    });
    const truncated = rows.length > MAX_ROWS;
    const cycles = truncated ? rows.slice(0, MAX_ROWS) : rows;

    let co2AvoidedKg = 0;
    let distanceAvoidedKm = 0;
    let realizedMatches = 0;
    let pricedMatches = 0;
    let unmeasured = 0;
    let straightLine = 0;
    let matchedPending = 0;
    let notRealized = 0;
    const byMonth = new Map<string, { co2AvoidedKg: number; distanceAvoidedKm: number; matches: number }>();

    for (const c of cycles) {
      if (c.impactStatus === 'matched') matchedPending += 1;
      if (c.impactStatus === 'not_realized') notRealized += 1;
      if (!c.impactCountedAt) continue;

      realizedMatches += 1;
      const km = numberOrNull(c.avoidedDistanceKm);
      const kg = numberOrNull(c.avoidedCo2Kg);
      if (km === null) unmeasured += 1;
      else {
        distanceAvoidedKm += km;
        if (c.avoidedDistanceProvider === 'haversine') straightLine += 1;
      }
      if (kg !== null) {
        co2AvoidedKg += kg;
        pricedMatches += 1;
      }
      const month = monthKey(c.impactRealizedAt ?? c.createdAt);
      const bucket = byMonth.get(month) ?? { co2AvoidedKg: 0, distanceAvoidedKm: 0, matches: 0 };
      bucket.co2AvoidedKg += kg ?? 0;
      bucket.distanceAvoidedKm += km ?? 0;
      bucket.matches += 1;
      byMonth.set(month, bucket);
    }

    const continuations = await this.withCountedOn(cycles.slice(0, MAX_LISTED).map((c) => toView(c, null)));

    return {
      co2AvoidedKg: round2(co2AvoidedKg),
      distanceAvoidedKm: round2(distanceAvoidedKm),
      realizedMatches,
      pricedMatches,
      unmeasured,
      straightLine,
      matchedPending,
      notRealized,
      /* Filled by the controller, which also holds the actual kilometres. */
      avoidanceRate: null,
      series: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, bucket]) => ({
          month,
          co2AvoidedKg: round2(bucket.co2AvoidedKg),
          distanceAvoidedKm: round2(bucket.distanceAvoidedKm),
          matches: bucket.matches,
        })),
      continuations,
      continuationsOf: cycles.length,
      truncated,
    };
  }

  /** Every continuation this booking is one end of, with which end it is. */
  async forBooking(bookingId: string): Promise<CycleImpactView[]> {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
      select: { id: true },
    });
    if (!booking) return [];
    const rows = await this.prisma.emptyReturnCycle.findMany({
      where: {
        nextBookingId: { not: null },
        impactStatus: { not: null },
        OR: [{ bookingId: booking.id }, { nextBookingId: booking.id }],
      },
      include: VIEW_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return this.withCountedOn(
      rows.map((c) => toView(c, c.bookingId === booking.id ? 'empty' : 'next_load')),
    );
  }

  /** A shipment's share: every continuation one of its containers is an end of. */
  async forShipment(shipmentId: string): Promise<ShipmentImpact> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { OR: [{ id: shipmentId }, { reference: shipmentId }], deletedAt: null },
      select: { id: true },
    });
    if (!shipment) throw new NotFoundException(`Shipment with ID "${shipmentId}" not found`);

    const rows = await this.prisma.emptyReturnCycle.findMany({
      where: {
        nextBookingId: { not: null },
        impactStatus: { not: null },
        OR: [{ booking: { shipmentId: shipment.id } }, { nextBooking: { shipmentId: shipment.id } }],
      },
      include: VIEW_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });

    let co2AvoidedKg = 0;
    let distanceAvoidedKm = 0;
    let realizedMatches = 0;
    let pricedMatches = 0;
    let unmeasured = 0;
    for (const c of rows) {
      if (!c.impactCountedAt) continue;
      realizedMatches += 1;
      const km = numberOrNull(c.avoidedDistanceKm);
      if (km === null) unmeasured += 1;
      else distanceAvoidedKm += km;
      const kg = numberOrNull(c.avoidedCo2Kg);
      if (kg !== null) {
        co2AvoidedKg += kg;
        pricedMatches += 1;
      }
    }

    return {
      shipmentId: shipment.id,
      co2AvoidedKg: round2(co2AvoidedKg),
      distanceAvoidedKm: round2(distanceAvoidedKm),
      realizedMatches,
      /* A carbon total over continuations none of which could be priced is
         not zero, it is unknown — the report prints "not priced" off this. */
      pricedMatches,
      unmeasured,
      continuations: await this.withCountedOn(
        rows.map((c) => toView(c, c.booking.shipmentId === shipment.id ? 'empty' : 'next_load')),
      ),
    };
  }

  private async views(where: Prisma.EmptyReturnCycleWhereInput): Promise<CycleImpactView[]> {
    const rows = await this.prisma.emptyReturnCycle.findMany({ where, include: VIEW_INCLUDE });
    return this.withCountedOn(rows.map((c) => toView(c, null)));
  }

  /**
   * A realized-but-uncounted row names the sibling that carries the count,
   * so a reader is told "counted on CYC-00041" rather than left to wonder why
   * a realized saving shows no figure.
   */
  private async withCountedOn(views: CycleImpactView[]): Promise<CycleImpactView[]> {
    const pending = views.filter((v) => v.status === 'realized' && !v.countedAt);
    if (pending.length === 0) return views;
    const siblings = await this.prisma.emptyReturnCycle.findMany({
      where: {
        nextBookingId: { in: [...new Set(pending.map((v) => v.nextLoad.bookingId))] },
        impactCountedAt: { not: null },
      },
      select: { nextBookingId: true, reference: true },
    });
    const byLoad = new Map(siblings.map((s) => [s.nextBookingId as string, s.reference]));
    return views.map((v) =>
      v.status === 'realized' && !v.countedAt
        ? { ...v, countedOn: byLoad.get(v.nextLoad.bookingId) ?? null }
        : v,
    );
  }

  /** The mean factor of a carrier's fleet — the transporter-level figure for a truck that was never named. */
  private async fleetAverageFactor(partnerId: string): Promise<number | null> {
    const fleet = await this.prisma.vehicle.aggregate({
      where: { partnerId, deletedAt: null, co2PerKm: { not: null } },
      _avg: { co2PerKm: true },
    });
    const avg = numberOrNull(fleet._avg.co2PerKm);
    return avg === null ? null : Math.round(avg * 1000) / 1000;
  }

  /** A leg of the avoided trip. The same place twice is a zero-length road, not an error. */
  private async measure(originId: string, destinationId: string): Promise<{ distanceMeters: number; provider: string }> {
    if (originId === destinationId) return { distanceMeters: 0, provider: 'google' };
    const result = await this.locations.distanceBetween(originId, destinationId);
    return { distanceMeters: result.distanceMeters, provider: result.provider };
  }

  private buildWhere(filters: ImpactFilters): Prisma.EmptyReturnCycleWhereInput {
    const { dateFrom, dateTo, transporterId, vehicleId, truckType, shipmentId, bookingId, scope } = filters;

    const dateFilter: Prisma.EmptyReturnCycleWhereInput[] = [];
    if (dateFrom || dateTo) {
      const range = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: endOfDay(dateTo) } : {}),
      };
      /* A realized saving belongs to the day it was realized; a pending or
         refused match to the day it was made. */
      dateFilter.push({
        OR: [{ impactRealizedAt: range }, { AND: [{ impactRealizedAt: null }, { createdAt: range }] }],
      });
    }

    const byRef = (value: string) => ({ OR: [{ id: value }, { reference: value }] });
    const scopedPartner = scope && typeof scope.partnerId === 'string' ? scope.partnerId : null;

    return {
      nextBookingId: { not: null },
      impactStatus: { not: null },
      /* A saving belongs to both carriers of a handover: the one whose trip
         was not driven and the one whose truck came through. Either filter
         finds it. */
      ...(transporterId
        ? { OR: [{ impactPartnerId: transporterId }, { impactNextPartnerId: transporterId }] }
        : {}),
      ...(scopedPartner
        ? { OR: [{ impactPartnerId: scopedPartner }, { impactNextPartnerId: scopedPartner }] }
        : {}),
      ...(vehicleId ? { impactVehicleId: vehicleId } : {}),
      ...(truckType ? { nextBooking: { vehicle: { truckType } } } : {}),
      ...(shipmentId
        ? {
            OR: [
              { booking: { shipment: byRef(shipmentId) } },
              { nextBooking: { shipment: byRef(shipmentId) } },
            ],
          }
        : {}),
      ...(bookingId ? { OR: [{ booking: byRef(bookingId) }, { nextBooking: byRef(bookingId) }] } : {}),
      ...(dateFilter.length ? { AND: dateFilter } : {}),
    };
  }
}

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface OperatorDecision {
  realized: boolean;
  note?: string | null;
  /** Who said so — stamped from the token, never accepted from the client. */
  by: string;
}

export interface ImpactFilters {
  dateFrom?: string;
  dateTo?: string;
  transporterId?: string;
  vehicleId?: string;
  truckType?: string;
  shipmentId?: string;
  bookingId?: string;
  scope?: Record<string, unknown> | null;
}

export interface RebuildResult {
  evaluated: number;
  matched: number;
  realized: number;
  counted: number;
  notRealized: number;
  failed: number;
}

export interface ImpactPlace {
  locationId: string;
  name: string;
}

export interface CycleImpactView {
  cycleId: string;
  cycleReference: string;
  chainReference: string | null;
  /** Which end of the continuation the asking booking is, when one asked. */
  role: 'empty' | 'next_load' | null;
  status: ImpactStatus;
  /** Which saving it is — see `ImpactModel`. Null until realized. */
  model: ImpactModel | null;
  source: ImpactSource | null;
  decidedBy: string | null;
  note: string | null;
  evaluatedAt: Date | null;
  matchedAt: Date | null;
  realizedAt: Date | null;
  continuationMinutes: number | null;
  countedAt: Date | null;
  /** The sibling cycle that carries the count, when this one is realized but not counted. */
  countedOn: string | null;
  /** Whether a continuation is even possible — one transporter on both bookings. */
  continuable: boolean;
  /** The empty's carrier — whose driving was saved. */
  transporter: { id: string; name: string } | null;
  /** The next load's carrier. The same company on a continuation. */
  nextTransporter: { id: string; name: string } | null;
  vehicle: { id: string; plate: string } | null;
  empty: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  nextLoad: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  from: ImpactPlace | null;
  garage: ImpactPlace | null;
  to: ImpactPlace | null;
  avoided: {
    toGarageKm: number;
    fromGarageKm: number;
    /** Handover only: the next load's truck's extra kilometres to come through the free zone. */
    detourKm: number | null;
    distanceKm: number;
    /** `google` is a road; `haversine` is the straight line, and says so. */
    provider: string;
    co2FactorUsed: number | null;
    /** next_load_truck | delivery_truck | fleet_average — whose factor priced it. */
    factorBasis: string | null;
    co2Kg: number | null;
  } | null;
}

type FactorBasis = 'next_load_truck' | 'delivery_truck' | 'fleet_average';

export interface ImpactSeriesPoint {
  month: string;
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  matches: number;
}

export interface ImpactSummary {
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  /** Continuations that physically happened and carry the count. */
  realizedMatches: number;
  /** Of those, how many have a carbon figure — a truck was established. */
  pricedMatches: number;
  /** Realized, counted, but with no garage or catalogue end to measure from. */
  unmeasured: number;
  /** Counted savings whose road is a straight line rather than a measured one. */
  straightLine: number;
  matchedPending: number;
  notRealized: number;
  /** Percent, one decimal, or null when there is no defensible baseline. */
  avoidanceRate: number | null;
  series: ImpactSeriesPoint[];
  continuations: CycleImpactView[];
  continuationsOf: number;
  truncated: boolean;
}

export interface ShipmentImpact {
  shipmentId: string;
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  realizedMatches: number;
  /** Of those, how many carry a carbon figure — the truck was established. */
  pricedMatches: number;
  unmeasured: number;
  continuations: CycleImpactView[];
}

/* ── Internals ──────────────────────────────────────────────────────────── */

interface Measured {
  toGarageMeters: number;
  fromGarageMeters: number;
  detourMeters: number | null;
  provider: 'google' | 'haversine';
}

const TIMELINE_SELECT = { select: { key: true, timestamp: true } } as const;
const LEG_SELECT = {
  select: { sequence: true, purpose: true, originLocationId: true, destinationLocationId: true },
} as const;

const CYCLE_INCLUDE = {
  booking: {
    select: {
      id: true,
      reference: true,
      status: true,
      partnerId: true,
      vehicleId: true,
      returnVehicleId: true,
      co2FactorUsed: true,
      shipment: { select: { deliveryLocationId: true, deliveryLocationName: true } },
      partner: { select: { id: true, companyLegalName: true, garageLocationId: true } },
      vehicle: { select: { id: true, plateNumber: true, co2PerKm: true } },
      timeline: TIMELINE_SELECT,
      routeLegs: LEG_SELECT,
    },
  },
  nextBooking: {
    select: {
      id: true,
      reference: true,
      status: true,
      partnerId: true,
      vehicleId: true,
      co2FactorUsed: true,
      shipment: { select: { pickupLocationId: true, pickupLocationName: true } },
      partner: { select: { id: true, companyLegalName: true, garageLocationId: true } },
      vehicle: { select: { id: true, plateNumber: true, co2PerKm: true } },
      timeline: TIMELINE_SELECT,
      routeLegs: LEG_SELECT,
    },
  },
} satisfies Prisma.EmptyReturnCycleInclude;

const VIEW_INCLUDE = {
  chain: { select: { reference: true } },
  booking: {
    select: {
      id: true,
      reference: true,
      containerNumber: true,
      shipmentId: true,
      partnerId: true,
      shipment: { select: { reference: true } },
    },
  },
  nextBooking: {
    select: {
      id: true,
      reference: true,
      containerNumber: true,
      shipmentId: true,
      partnerId: true,
      shipment: { select: { reference: true } },
    },
  },
} satisfies Prisma.EmptyReturnCycleInclude;

type ViewRow = Prisma.EmptyReturnCycleGetPayload<{ include: typeof VIEW_INCLUDE }>;

function toView(c: ViewRow, role: CycleImpactView['role']): CycleImpactView {
  const next = c.nextBooking;
  const km = numberOrNull(c.avoidedDistanceKm);
  return {
    cycleId: c.id,
    cycleReference: c.reference,
    chainReference: c.chain?.reference ?? null,
    role,
    status: isImpactStatus(c.impactStatus) ? c.impactStatus : 'matched',
    model: c.impactModel === 'continuation' || c.impactModel === 'handover' ? c.impactModel : null,
    source: (c.impactSource as ImpactSource | null) ?? null,
    decidedBy: c.impactDecidedBy,
    note: c.impactNote,
    evaluatedAt: c.impactEvaluatedAt,
    matchedAt: c.matchedAt ?? c.createdAt,
    realizedAt: c.impactRealizedAt,
    continuationMinutes: c.impactContinuationMinutes,
    countedAt: c.impactCountedAt,
    countedOn: null,
    continuable: Boolean(c.booking.partnerId) && Boolean(next?.partnerId),
    transporter:
      c.impactPartnerId && c.impactPartnerName ? { id: c.impactPartnerId, name: c.impactPartnerName } : null,
    nextTransporter:
      c.impactNextPartnerId && c.impactNextPartnerName
        ? { id: c.impactNextPartnerId, name: c.impactNextPartnerName }
        : null,
    vehicle: c.impactVehicleId && c.impactVehiclePlate ? { id: c.impactVehicleId, plate: c.impactVehiclePlate } : null,
    empty: {
      bookingId: c.booking.id,
      reference: c.booking.reference,
      container: c.booking.containerNumber,
      shipmentReference: c.booking.shipment?.reference ?? null,
    },
    nextLoad: {
      bookingId: next?.id ?? (c.nextBookingId as string),
      reference: next?.reference ?? '—',
      container: next?.containerNumber ?? null,
      shipmentReference: next?.shipment?.reference ?? null,
    },
    from: place(c.impactFromLocationId, c.impactFromName),
    garage: place(c.impactGarageLocationId, c.impactGarageName),
    to: place(c.impactToLocationId, c.impactToName),
    avoided:
      km === null
        ? null
        : {
            toGarageKm: round2((c.avoidedToGarageMeters ?? 0) / 1000),
            fromGarageKm: round2((c.avoidedFromGarageMeters ?? 0) / 1000),
            detourKm: c.avoidedDetourMeters === null ? null : round2(c.avoidedDetourMeters / 1000),
            distanceKm: km,
            provider: c.avoidedDistanceProvider ?? 'google',
            co2FactorUsed: numberOrNull(c.avoidedCo2FactorUsed),
            factorBasis: c.avoidedFactorBasis,
            co2Kg: numberOrNull(c.avoidedCo2Kg),
          },
  };
}

/** Everything the evaluation writes, unsaid. */
const CLEARED = {
  impactStatus: null,
  impactModel: null,
  impactEvaluatedAt: null,
  impactSource: null,
  impactDecidedBy: null,
  impactNote: null,
  impactRealizedAt: null,
  impactContinuationMinutes: null,
  impactPartnerId: null,
  impactPartnerName: null,
  impactNextPartnerId: null,
  impactNextPartnerName: null,
  impactVehicleId: null,
  impactVehiclePlate: null,
  impactFromLocationId: null,
  impactFromName: null,
  impactGarageLocationId: null,
  impactGarageName: null,
  impactToLocationId: null,
  impactToName: null,
  avoidedToGarageMeters: null,
  avoidedFromGarageMeters: null,
  avoidedDetourMeters: null,
  avoidedDistanceKm: null,
  avoidedDistanceProvider: null,
  avoidedCo2FactorUsed: null,
  avoidedFactorBasis: null,
  avoidedCo2Kg: null,
  impactCountedAt: null,
} satisfies Prisma.EmptyReturnCycleUpdateInput;

/** Rows one summary call will read; the response says when it bites. */
const MAX_ROWS = 20000;
/** Continuations listed in one response. The dashboard pages through these. */
const MAX_LISTED = 200;

function place(id: string | null, name: string | null): ImpactPlace | null {
  return id && name ? { locationId: id, name } : null;
}

function isImpactStatus(value: string | null | undefined): value is ImpactStatus {
  return value === 'matched' || value === 'realized' || value === 'not_realized';
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function numberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
