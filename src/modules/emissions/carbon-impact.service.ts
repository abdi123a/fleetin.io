import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsService } from '../locations/locations.service';
import { DELIVERED_STATUSES } from '../empty-returns/empty-return-status.util';
import {
  ARRIVAL_KEY,
  EMPTY_COLLECTED_KEY,
  PICKUP_EVIDENCE_KEYS,
  avoidedProvider,
  classifyContinuation,
  earliestTimestamp,
  pickCounted,
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

    const partner = next.partner ?? empty.partner;
    const garageId = partner?.garageLocationId ?? null;
    const garage = garageId ? await this.prisma.location.findUnique({ where: { id: garageId }, select: { id: true, name: true } }) : null;

    /* Case 3, on record: a positioning leg through the garage after the empty
       leg, or one out of the garage before the next load. Operators enter
       these through `replaceRoute`; nothing derives them. */
    const lastEmptyLeg = empty.routeLegs
      .filter((leg) => leg.purpose === 'empty_return')
      .reduce((max, leg) => Math.max(max, leg.sequence), 0);
    const garageStopRecorded =
      Boolean(garageId) &&
      (empty.routeLegs.some(
        (leg) =>
          leg.purpose === 'positioning' &&
          leg.destinationLocationId === garageId &&
          leg.sequence > lastEmptyLeg,
      ) ||
        next.routeLegs.some(
          (leg) => leg.purpose === 'positioning' && leg.originLocationId === garageId,
        ));

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
      emptyVehicleId: empty.returnVehicleId ?? empty.vehicleId,
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

    if (decision) {
      /* A person can say the truck continued when the rungs could not see
         it; nobody can make two carriers into one truck's trip. */
      if (decision.realized && (!next.partnerId || empty.partnerId !== next.partnerId)) {
        throw new ConflictException(
          `Cycle "${cycle.reference}" pairs two different transporters — a continuation needs one`,
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

    /* The truck is only ever the one both legs name — an operator's word
       confirms the continuation, not which lorry made it. */
    const vehicleId =
      status === 'realized' && empty.returnVehicleId !== undefined
        ? sameTruck(empty.returnVehicleId ?? empty.vehicleId, next.vehicleId)
        : null;
    const vehicle = vehicleId ? (next.vehicle?.id === vehicleId ? next.vehicle : null) : null;

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

    /* ── The two roads that were not driven ── */
    const from = empty.shipment?.deliveryLocationId
      ? { id: empty.shipment.deliveryLocationId, name: empty.shipment.deliveryLocationName }
      : null;
    const to = next.shipment?.pickupLocationId
      ? { id: next.shipment.pickupLocationId, name: next.shipment.pickupLocationName }
      : null;

    let measured: Measured | null = null;
    if (status === 'realized') {
      if (!garage) {
        notes.push(
          `No garage recorded for ${partner?.companyLegalName ?? 'the transporter'} — distance not measured`,
        );
      } else if (!from || !to) {
        notes.push('A shipment end is not a catalogue location — distance not measured');
      } else {
        try {
          const toGarage = await this.measure(from.id, garage.id);
          const fromGarage = await this.measure(garage.id, to.id);
          measured = {
            toGarageMeters: toGarage.distanceMeters,
            fromGarageMeters: fromGarage.distanceMeters,
            provider: avoidedProvider(toGarage.provider, fromGarage.provider),
          };
        } catch (error) {
          notes.push('The garage round trip could not be measured');
          this.logger.warn(
            `Could not measure the avoided trip for cycle ${cycle.reference}: ${String(error)}`,
          );
        }
      }
    }

    const avoidedKm =
      measured === null ? null : round2((measured.toGarageMeters + measured.fromGarageMeters) / 1000);
    /* The factor the continuation ran under: the next load's own snapshot,
       which is the same truck's factor as it stood when it was assigned. */
    const factor =
      avoidedKm !== null && vehicleId
        ? (numberOrNull(next.co2FactorUsed) ?? numberOrNull(vehicle?.co2PerKm))
        : null;
    const avoidedCo2 = avoidedKm !== null && factor !== null ? round2(avoidedKm * factor) : null;

    await this.prisma.emptyReturnCycle.update({
      where: { id: cycle.id },
      data: {
        impactStatus: status,
        impactEvaluatedAt: new Date(),
        impactSource: source,
        impactDecidedBy: decidedBy,
        impactNote: notes.length ? notes.join(' · ').slice(0, 255) : null,
        impactRealizedAt: realizedAt,
        impactContinuationMinutes: continuationMinutes,
        impactPartnerId: partner?.id ?? null,
        impactPartnerName: partner?.companyLegalName ?? null,
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
        avoidedDistanceKm: avoidedKm,
        avoidedDistanceProvider: measured?.provider ?? null,
        avoidedCo2FactorUsed: factor,
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
      ...(transporterId ? { impactPartnerId: transporterId } : {}),
      ...(scopedPartner ? { impactPartnerId: scopedPartner } : {}),
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
  transporter: { id: string; name: string } | null;
  vehicle: { id: string; plate: string } | null;
  empty: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  nextLoad: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  from: ImpactPlace | null;
  garage: ImpactPlace | null;
  to: ImpactPlace | null;
  avoided: {
    toGarageKm: number;
    fromGarageKm: number;
    distanceKm: number;
    /** `google` is a road; `haversine` is the straight line, and says so. */
    provider: string;
    co2FactorUsed: number | null;
    co2Kg: number | null;
  } | null;
}

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
      shipment: { select: { deliveryLocationId: true, deliveryLocationName: true } },
      partner: { select: { id: true, companyLegalName: true, garageLocationId: true } },
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
    source: (c.impactSource as ImpactSource | null) ?? null,
    decidedBy: c.impactDecidedBy,
    note: c.impactNote,
    evaluatedAt: c.impactEvaluatedAt,
    matchedAt: c.matchedAt ?? c.createdAt,
    realizedAt: c.impactRealizedAt,
    continuationMinutes: c.impactContinuationMinutes,
    countedAt: c.impactCountedAt,
    countedOn: null,
    continuable: Boolean(c.booking.partnerId) && c.booking.partnerId === (next?.partnerId ?? null),
    transporter:
      c.impactPartnerId && c.impactPartnerName ? { id: c.impactPartnerId, name: c.impactPartnerName } : null,
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
            distanceKm: km,
            provider: c.avoidedDistanceProvider ?? 'google',
            co2FactorUsed: numberOrNull(c.avoidedCo2FactorUsed),
            co2Kg: numberOrNull(c.avoidedCo2Kg),
          },
  };
}

/** Everything the evaluation writes, unsaid. */
const CLEARED = {
  impactStatus: null,
  impactEvaluatedAt: null,
  impactSource: null,
  impactDecidedBy: null,
  impactNote: null,
  impactRealizedAt: null,
  impactContinuationMinutes: null,
  impactPartnerId: null,
  impactPartnerName: null,
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
  avoidedDistanceKm: null,
  avoidedDistanceProvider: null,
  avoidedCo2FactorUsed: null,
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

function sameTruck(a: string | null, b: string | null): string | null {
  return a && b && a === b ? a : null;
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
