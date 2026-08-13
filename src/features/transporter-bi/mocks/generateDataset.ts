import {
  BACKHAUL_MATCH_BASE,
  BACKHAUL_CARGO,
  BACKHAUL_CUSTOMERS,
  CARGO_BY_CUSTOMER,
  DECLINE_REASONS,
  INCIDENT_TYPES,
  MOCK_CUSTOMERS,
  MOCK_DRIVERS,
  MOCK_ROUTES,
  MOCK_TRANSPORTER,
  MOCK_VEHICLES,
  NETWORK_PEER_SEEDS,
  OPPORTUNITY_BANDS,
  ROUTE_DEMAND,
} from './world';
import { Rng } from './random';
import { CO2_KG_PER_KM_EMPTY, PAYMENT_TERMS_DAYS, SETTLEMENT_WEEKDAY } from '../config';
import type {
  BackhaulOpportunity,
  ContainerType,
  DelayCause,
  DelaySegment,
  FleetDay,
  FleetState,
  LoadOffer,
  NetworkBenchmark,
  NetworkPeer,
  TransporterRoute,
  TransporterDataset,
  Trip,
  TripStatus,
  WaitingSegment,
} from '../contracts';

/**
 * Simulates one transporter's book of work.
 *
 * The rule inherited from the shipper mocks: **simulate primitives, never
 * write down answers.** Nothing here stores an on-time rate or a utilisation
 * figure — vehicles run cycles (offer → load → transit → deliver → return),
 * frictions and delays land on them, and every number the portal shows is
 * derived downstream exactly as it will be from the production API.
 *
 * Deterministic per transporter id and day: the same seed always yields the
 * same fleet history, so reloads and screenshots are stable.
 */

export interface GenerateOptions {
  transporterId: string;
  asOf: Date;
  historyDays?: number;
}

const HOUR = 3_600_000;

/** Cyclic array access without non-null assertions; throws only on empty input. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error('at(): empty array');
  return item;
}
const DAY = 24 * HOUR;

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * HOUR);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** Next weekly settlement run on or after the given instant. */
function nextSettlementDate(after: Date): string {
  const date = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate()));
  while (date.getUTCDay() !== SETTLEMENT_WEEKDAY) date.setUTCDate(date.getUTCDate() + 1);
  return dayOf(date);
}

/** Routes that cross the Galafi border into Ethiopia. */
const CROSS_BORDER = new Set(['RTE-01', 'RTE-02', 'RTE-03', 'RTE-04', 'RTE-06', 'RTE-07']);

const CONTAINER_BY_TRUCK: Record<string, ReadonlyArray<readonly [ContainerType, number]>> = {
  container: [
    ['dry_40', 0.45],
    ['hc_40', 0.25],
    ['dry_20', 0.3],
  ],
  flatbed: [['flatbed', 1]],
  reefer: [['reefer_40', 1]],
};

const DELAY_CAUSE_WEIGHTS: ReadonlyArray<readonly [DelayCause, number]> = [
  ['customs_clearance', 0.26],
  ['port_congestion', 0.22],
  ['loading_slot', 0.13],
  ['unloading_slot', 0.11],
  ['mechanical', 0.1],
  ['documentation', 0.08],
  ['traffic', 0.06],
  ['weather', 0.04],
];

export function generateDataset({
  transporterId,
  asOf,
  historyDays = 180,
}: GenerateOptions): TransporterDataset {
  const rng = new Rng(`${transporterId}:${historyDays}:v1`);
  const historyStart = addDays(asOf, -historyDays);

  const trips: Trip[] = [];
  const offers: LoadOffer[] = [];
  const fleetStateByVehicle = new Map<string, Map<string, FleetState>>();

  // Stable driver pairing: each vehicle has two usual drivers, so the driver
  // ranking reflects people who actually live on particular trucks and lanes.
  const driverPools = MOCK_VEHICLES.map((vehicle, index) => {
    const primary = at(MOCK_DRIVERS, index);
    const relief = at(MOCK_DRIVERS, index + 11);
    return { vehicleId: vehicle.id, drivers: [primary, relief] as const };
  });

  const routeById = new Map(MOCK_ROUTES.map((route) => [route.id, route]));
  const routeOf = (id: string): TransporterRoute => {
    const route = routeById.get(id);
    if (!route) throw new Error(`Unknown route ${id}`);
    return route;
  };
  let tripSeq = 0;
  let invoiceSeq = 0;

  const markFleet = (vehicleId: string, from: Date, until: Date, state: FleetState) => {
    const byDay = fleetStateByVehicle.get(vehicleId) ?? new Map<string, FleetState>();
    fleetStateByVehicle.set(vehicleId, byDay);
    for (let cursor = new Date(from); cursor <= until; cursor = addDays(cursor, 1)) {
      if (cursor > asOf) break;
      if (cursor < historyStart) continue;
      const key = dayOf(cursor);
      // Active wins over maintenance wins over idle when a day straddles.
      const existing = byDay.get(key);
      if (existing === 'active') continue;
      if (existing === 'maintenance' && state === 'idle') continue;
      byDay.set(key, state);
    }
  };

  for (const [vehicleIndex, vehicle] of MOCK_VEHICLES.entries()) {
    const pool = at(driverPools, vehicleIndex);
    let cursor = addDays(historyStart, rng.float(0, 5));

    // Two extra days of lookahead so "scheduled" trips exist at asOf.
    while (cursor < addDays(asOf, 2)) {
      // Occasional workshop stay.
      if (rng.bool(0.055)) {
        const days = rng.int(1, 4);
        const until = addDays(cursor, days);
        markFleet(vehicle.id, cursor, until, 'maintenance');
        cursor = until;
      }

      const idleDays = rng.weighted([
        [0, 0.3],
        [1, 0.34],
        [2, 0.19],
        [3, 0.11],
        [4, 0.06],
      ]);
      cursor = addDays(cursor, idleDays + rng.float(0, 0.5));
      if (cursor >= addDays(asOf, 2)) break;

      const routeId = rng.weighted(ROUTE_DEMAND);
      const route = routeOf(routeId);
      const driver = rng.bool(0.72) ? pool.drivers[0] : pool.drivers[1];
      const customer = rng.pick(MOCK_CUSTOMERS);
      const containerType = rng.weighted(
        CONTAINER_BY_TRUCK[vehicle.truckType] ?? [['dry_40', 1] as const],
      );
      const cargo = rng.pick(CARGO_BY_CUSTOMER[customer.id] ?? ['General cargo']);

      const offeredAt = addHours(cursor, -rng.float(18, 72));
      const acceptedAt = addHours(offeredAt, rng.float(1, 16));
      const startedAt = new Date(cursor);

      // Pre-departure friction: loading slot plus port dwell when we lift at a port.
      const loadingWaitHours = rng.float(2, 7);
      const portWaitHours = route.originName.includes('Port') ? rng.float(1, 5.5) : 0;
      const departedAt = addHours(startedAt, loadingWaitHours + portWaitHours + rng.float(0.5, 2));

      const borderWaitHours = CROSS_BORDER.has(routeId) ? rng.float(1, 6) : 0;
      const unloadWaitHours = rng.float(1.5, 6.5);

      // Delays are the exception on top of routine friction, long-tailed.
      const delays: DelaySegment[] = [];
      if (rng.bool(0.26)) {
        const causeCount = rng.bool(0.24) ? 2 : 1;
        for (let index = 0; index < causeCount; index++) {
          delays.push({
            cause: rng.weighted(DELAY_CAUSE_WEIGHTS),
            minutes: Math.round(rng.logNormal(200, 0.8)),
          });
        }
      }
      const delayHours = delays.reduce((sum, seg) => sum + seg.minutes, 0) / 60;

      const transitHours = route.nominalTransitHours * rng.logNormal(1, 0.15);
      const arrivedAt = addHours(departedAt, transitHours + borderWaitHours + delayHours * 0.6);
      const deliveredAt = addHours(arrivedAt, unloadWaitHours + delayHours * 0.4);

      const friction = (CROSS_BORDER.has(routeId) ? 3.2 : 0) + 3.8;
      const plannedDeliveryAt = addHours(
        departedAt,
        (route.nominalTransitHours + friction) * 1.1 + 2,
      );

      const waiting: WaitingSegment[] = [
        { location: 'loading_site', hours: round1(loadingWaitHours) },
        { location: 'unloading_site', hours: round1(unloadWaitHours) },
      ];
      if (portWaitHours > 0) waiting.push({ location: 'port', hours: round1(portWaitHours) });
      if (borderWaitHours > 0) waiting.push({ location: 'border', hours: round1(borderWaitHours) });

      const revenue = Math.round((route.distanceKm * route.ratePerKm * rng.float(0.96, 1.06)) / 10) * 10;

      // Return leg: matched backhaul or the drive home empty. Match odds climb
      // slowly through history — the matching programme is working.
      const historyProgress =
        (startedAt.getTime() - historyStart.getTime()) / (historyDays * DAY);
      const matchProbability =
        (BACKHAUL_MATCH_BASE[routeId] ?? 0.5) + 0.07 * Math.min(Math.max(historyProgress, 0), 1);
      const matched = rng.bool(matchProbability);

      const deadheadKm = matched ? Math.round(rng.float(12, 85)) : 0;
      const returnLoadedKm = matched ? Math.round(route.distanceKm * rng.float(0.9, 1)) : 0;
      const emptyKm = matched ? deadheadKm : Math.round(route.distanceKm * rng.float(0.92, 1));
      const backhaulRevenue = matched
        ? Math.round((returnLoadedKm * route.ratePerKm * rng.float(0.58, 0.75)) / 10) * 10
        : undefined;

      const returnHours =
        (matched ? deadheadKm + returnLoadedKm : emptyKm) / 52 +
        (matched ? rng.float(3, 9) : rng.float(1, 4));
      const returnEndAt = addHours(deliveredAt, returnHours + rng.float(2, 8));

      tripSeq += 1;
      const ref = `FL-${startedAt.getUTCFullYear()}-${4200 + tripSeq}`;
      const id = `TP-${String(tripSeq).padStart(4, '0')}`;

      // Rare cancellation after acceptance: the slot died before wheels moved.
      if (rng.bool(0.025)) {
        const trip: Trip = {
          id,
          ref,
          routeId,
          vehicleId: vehicle.id,
          driverId: driver.id,
          customerId: customer.id,
          containerType,
          cargo,
          status: 'cancelled',
          offeredAt: offeredAt.toISOString(),
          acceptedAt: acceptedAt.toISOString(),
          plannedDeliveryAt: plannedDeliveryAt.toISOString(),
          distanceKm: route.distanceKm,
          revenue,
          delays: [],
          waiting: [],
          backhaul: { status: 'empty', emptyKm: 0 },
        };
        if (acceptedAt <= asOf) {
          trips.push(trip);
          offers.push(offerFor(trip, rng));
        }
        cursor = addHours(cursor, rng.float(6, 24));
        continue;
      }

      const status = liveStatus(asOf, {
        startedAt,
        departedAt,
        arrivedAt,
        deliveredAt,
        returnEndAt,
      });
      if (status === undefined) {
        // Entirely in the future — past the lookahead we care about.
        cursor = returnEndAt;
        continue;
      }

      const isCompleted = status === 'completed';
      const isLiveOutbound = status === 'enroute';

      const trip: Trip = {
        id,
        ref,
        routeId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        customerId: customer.id,
        containerType,
        cargo,
        status,
        offeredAt: offeredAt.toISOString(),
        acceptedAt: acceptedAt.toISOString(),
        startedAt: status === 'scheduled' ? undefined : startedAt.toISOString(),
        departedAt:
          status === 'scheduled' || status === 'loading' ? undefined : departedAt.toISOString(),
        plannedDeliveryAt: plannedDeliveryAt.toISOString(),
        deliveredAt:
          status === 'completed' || status === 'returning' ? deliveredAt.toISOString() : undefined,
        progressPct: isLiveOutbound
          ? clamp(
              (asOf.getTime() - departedAt.getTime()) /
                (arrivedAt.getTime() - departedAt.getTime()),
              0.02,
              0.97,
            )
          : undefined,
        etaAt:
          isLiveOutbound || status === 'at_destination' ? deliveredAt.toISOString() : undefined,
        distanceKm: route.distanceKm,
        revenue,
        delays,
        waiting,
        driverRating: isCompleted ? tripRating(rng, driver.baseRating, delays, deliveredAt, plannedDeliveryAt) : undefined,
        incident: isCompleted && rng.bool(0.045) ? rng.pick(INCIDENT_TYPES) : undefined,
        backhaul: backhaulFor(status, matched, {
          deadheadKm,
          returnLoadedKm,
          emptyKm,
          backhaulRevenue,
          rng,
          tripSeq,
        }),
        payment: isCompleted
          ? paymentFor(rng, ++invoiceSeq, deliveredAt, revenue + (backhaulRevenue ?? 0), asOf)
          : undefined,
      };

      trips.push(trip);
      offers.push(offerFor(trip, rng));
      markFleet(vehicle.id, startedAt, status === 'completed' ? returnEndAt : asOf, 'active');

      cursor = returnEndAt;
    }
  }

  // Fill the unmarked days of the log as idle.
  const fleetLog: FleetDay[] = [];
  for (const vehicle of MOCK_VEHICLES) {
    const byDay = fleetStateByVehicle.get(vehicle.id) ?? new Map<string, FleetState>();
    for (let cursor = new Date(historyStart); cursor <= asOf; cursor = addDays(cursor, 1)) {
      const key = dayOf(cursor);
      fleetLog.push({ date: key, vehicleId: vehicle.id, state: byDay.get(key) ?? 'idle' });
    }
  }

  // Offers we said no to (plus a few that expired), spread over the window.
  const declinedCount = Math.round(trips.length * 0.115);
  const expiredCount = Math.round(trips.length * 0.035);
  for (let index = 0; index < declinedCount + expiredCount; index++) {
    const offeredAt = addHours(historyStart, rng.float(0, historyDays * 24));
    const routeId = rng.weighted(ROUTE_DEMAND);
    const route = routeOf(routeId);
    const customer = rng.pick(MOCK_CUSTOMERS);
    offers.push({
      id: `OFF-X${String(index + 1).padStart(3, '0')}`,
      offeredAt: offeredAt.toISOString(),
      routeId,
      customerId: customer.id,
      containerType: rng.pick(['dry_20', 'dry_40', 'hc_40'] as const),
      revenueEst: Math.round((route.distanceKm * route.ratePerKm * rng.float(0.9, 1.05)) / 10) * 10,
      outcome: index < declinedCount ? 'declined' : 'expired',
      declineReason: index < declinedCount ? rng.pick(DECLINE_REASONS) : undefined,
    });
  }
  offers.sort((a, b) => a.offeredAt.localeCompare(b.offeredAt));

  const opportunities = buildOpportunities(rng, trips, routeById, asOf);
  const network = buildNetwork(rng, trips, offers);

  trips.sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt));

  return {
    transporter: { ...MOCK_TRANSPORTER, id: transporterId },
    vehicles: MOCK_VEHICLES,
    drivers: MOCK_DRIVERS,
    routes: MOCK_ROUTES,
    customers: MOCK_CUSTOMERS,
    trips,
    offers,
    opportunities,
    fleetLog,
    network,
    generatedAt: asOf.toISOString(),
  };
}

/* ---------------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------------ */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function liveStatus(
  asOf: Date,
  phases: { startedAt: Date; departedAt: Date; arrivedAt: Date; deliveredAt: Date; returnEndAt: Date },
): TripStatus | undefined {
  if (asOf >= phases.returnEndAt) return 'completed';
  if (asOf >= phases.deliveredAt) return 'returning';
  if (asOf >= phases.arrivedAt) return 'at_destination';
  if (asOf >= phases.departedAt) return 'enroute';
  if (asOf >= phases.startedAt) return 'loading';
  // Scheduled only when it starts within the visible lookahead.
  if (phases.startedAt.getTime() - asOf.getTime() <= 2 * DAY) return 'scheduled';
  return undefined;
}

function tripRating(
  rng: Rng,
  baseRating: number,
  delays: DelaySegment[],
  deliveredAt: Date,
  plannedDeliveryAt: Date,
): number {
  const transporterFault = delays.some((segment) => segment.cause === 'mechanical');
  const late = deliveredAt.getTime() > plannedDeliveryAt.getTime() + 2 * HOUR;
  const raw =
    baseRating + rng.float(-0.45, 0.35) - (transporterFault ? 0.7 : 0) - (late ? 0.3 : 0);
  return clamp(Math.round(raw * 10) / 10, 2.5, 5);
}

function backhaulFor(
  status: TripStatus,
  matched: boolean,
  parts: {
    deadheadKm: number;
    returnLoadedKm: number;
    emptyKm: number;
    backhaulRevenue?: number;
    rng: Rng;
    tripSeq: number;
  },
): Trip['backhaul'] {
  const { deadheadKm, returnLoadedKm, emptyKm, backhaulRevenue, rng, tripSeq } = parts;

  // Outbound still moving: the return leg is an open question. A share are
  // already matched by the board; the rest are the live risk the alerts watch.
  if (status === 'scheduled' || status === 'loading' || status === 'enroute' || status === 'at_destination') {
    const preMatched = matched && rng.bool(0.45);
    return preMatched
      ? {
          status: 'matched',
          revenue: backhaulRevenue,
          loadedKm: returnLoadedKm,
          emptyKm: deadheadKm,
          matchedLoadRef: `BH-${2400 + tripSeq}`,
        }
      : { status: 'pending', emptyKm: 0 };
  }

  return matched
    ? {
        status: 'matched',
        revenue: backhaulRevenue,
        loadedKm: returnLoadedKm,
        emptyKm: deadheadKm,
        matchedLoadRef: `BH-${2400 + tripSeq}`,
      }
    : { status: 'empty', emptyKm };
}

function paymentFor(
  rng: Rng,
  invoiceSeq: number,
  deliveredAt: Date,
  amount: number,
  asOf: Date,
): Trip['payment'] {
  const invoicedAt = addHours(deliveredAt, rng.logNormal(60, 0.4));
  const dueAt = addDays(invoicedAt, PAYMENT_TERMS_DAYS);
  // A slow-payer segment gives the aging chart its long tail.
  const paidLagDays = rng.bool(0.1) ? rng.logNormal(62, 0.35) : rng.logNormal(24, 0.4);
  const paidAt = addDays(invoicedAt, paidLagDays);

  return {
    invoiceNo: `INV-${String(3400 + invoiceSeq)}`,
    invoicedAt: invoicedAt.toISOString(),
    amount,
    dueAt: dueAt.toISOString(),
    paidAt: paidAt <= asOf ? paidAt.toISOString() : undefined,
    expectedSettlementAt: nextSettlementDate(dueAt),
  };
}

function offerFor(trip: Trip, rng: Rng): LoadOffer {
  return {
    id: `OFF-${trip.id.slice(3)}`,
    offeredAt: trip.offeredAt,
    routeId: trip.routeId,
    customerId: trip.customerId,
    containerType: trip.containerType,
    revenueEst: Math.round((trip.revenue * rng.float(0.97, 1.03)) / 10) * 10,
    outcome: 'accepted',
    tripId: trip.id,
  };
}

/**
 * Return loads on the board right now. Every live outbound trip without a
 * return load gets one to three candidate matches near its destination, plus
 * a handful of open loads nobody matches — a board is never exactly the size
 * of your problem.
 */
function buildOpportunities(
  rng: Rng,
  trips: Trip[],
  routeById: Map<string, TransporterRoute>,
  asOf: Date,
): BackhaulOpportunity[] {
  const routeOf = (id: string): TransporterRoute => {
    const route = routeById.get(id);
    if (!route) throw new Error(`Unknown route ${id}`);
    return route;
  };
  const opportunities: BackhaulOpportunity[] = [];
  let seq = 0;

  const pending = trips.filter(
    (trip) =>
      (trip.status === 'enroute' || trip.status === 'at_destination') &&
      trip.backhaul.status === 'pending',
  );

  const push = (candidate: Omit<BackhaulOpportunity, 'id' | 'postedAt' | 'status'>) => {
    seq += 1;
    opportunities.push({
      ...candidate,
      id: `BHO-${String(seq).padStart(2, '0')}`,
      postedAt: addHours(asOf, -rng.float(2, 30)).toISOString(),
      status: 'available',
    });
  };

  for (const trip of pending) {
    const route = routeOf(trip.routeId);
    const count = rng.int(1, 3);
    for (let index = 0; index < count; index++) {
      const deadheadKm = Math.round(rng.float(10, 90));
      const distanceKm = Math.round(route.distanceKm * rng.float(0.85, 1));
      const eta = trip.etaAt ? new Date(trip.etaAt) : addHours(asOf, rng.float(4, 20));
      const windowStart = addHours(eta, rng.float(2, 10));
      const windowEnd = addHours(windowStart, rng.float(8, 26));
      const rateQuality = rng.float(0.58, 0.78);
      const emptyKmAvoided = Math.max(distanceKm - deadheadKm, 0);

      push({
        originName: `${route.destinationName.split(' ')[0]} loading point`,
        originLat: route.destinationLat + rng.float(-0.12, 0.12),
        originLng: route.destinationLng + rng.float(-0.12, 0.12),
        destinationName: route.originName,
        destinationLat: route.originLat,
        destinationLng: route.originLng,
        customerName: rng.pick(BACKHAUL_CUSTOMERS),
        cargo: rng.pick(BACKHAUL_CARGO),
        containerType: trip.containerType,
        pickupWindowStart: windowStart.toISOString(),
        pickupWindowEnd: windowEnd.toISOString(),
        revenue: Math.round((distanceKm * route.ratePerKm * rateQuality) / 10) * 10,
        distanceKm,
        deadheadKm,
        matchedTripId: trip.id,
        matchScore: clamp(
          0.5 * (1 - deadheadKm / 140) + 0.3 * rateQuality + rng.float(0.05, 0.25),
          0.35,
          0.97,
        ),
        emptyKmAvoided,
        co2SavedKg: Math.round(emptyKmAvoided * CO2_KG_PER_KM_EMPTY),
      });
    }
  }

  // Open loads with no matched vehicle — visible, unclaimed demand.
  const hubs = ['RTE-01', 'RTE-03', 'RTE-02', 'RTE-06'] as const;
  for (let index = 0; index < 4; index++) {
    const route = routeOf(at(hubs, index));
    const distanceKm = Math.round(route.distanceKm * rng.float(0.8, 1));
    const deadheadKm = Math.round(rng.float(40, 160));
    const windowStart = addHours(asOf, rng.float(10, 40));
    const emptyKmAvoided = Math.max(distanceKm - deadheadKm, 0);
    push({
      originName: `${route.destinationName.split(' ')[0]} region`,
      originLat: route.destinationLat + rng.float(-0.2, 0.2),
      originLng: route.destinationLng + rng.float(-0.2, 0.2),
      destinationName: route.originName,
      destinationLat: route.originLat,
      destinationLng: route.originLng,
      customerName: rng.pick(BACKHAUL_CUSTOMERS),
      cargo: rng.pick(BACKHAUL_CARGO),
      containerType: rng.pick(['dry_20', 'dry_40', 'hc_40'] as const),
      pickupWindowStart: windowStart.toISOString(),
      pickupWindowEnd: addHours(windowStart, rng.float(12, 30)).toISOString(),
      revenue: Math.round((distanceKm * route.ratePerKm * rng.float(0.55, 0.7)) / 10) * 10,
      distanceKm,
      deadheadKm,
      matchScore: clamp(rng.float(0.3, 0.6), 0.2, 0.97),
      emptyKmAvoided,
      co2SavedKg: Math.round(emptyKmAvoided * CO2_KG_PER_KM_EMPTY),
    });
  }

  return opportunities.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Our row in the network is computed from the simulated book, never stated:
 * whatever the trips did, that is where we rank.
 */
function buildNetwork(rng: Rng, trips: Trip[], offers: LoadOffer[]): NetworkBenchmark {
  const completed = trips.filter((trip) => trip.status === 'completed');
  const rated = completed.filter((trip) => trip.driverRating !== undefined);

  const late = completed.filter(
    (trip) =>
      trip.deliveredAt &&
      new Date(trip.deliveredAt).getTime() >
        new Date(trip.plannedDeliveryAt).getTime() + 2 * HOUR,
  ).length;
  const delayed = completed.filter((trip) => trip.delays.length > 0).length;

  const onTimeRate = completed.length ? 1 - late / completed.length : 0.9;
  const delayRate = completed.length ? delayed / completed.length : 0.2;
  const accepted = offers.filter((offer) => offer.outcome === 'accepted').length;
  const acceptanceRate = offers.length ? accepted / offers.length : 0.85;
  const avgRating = rated.length
    ? rated.reduce((sum, trip) => sum + (trip.driverRating ?? 0), 0) / rated.length
    : 4.3;

  const score = (peer: Pick<NetworkPeer, 'onTimeRate' | 'delayRate' | 'avgRating'>) =>
    Math.round(100 * (0.5 * peer.onTimeRate + 0.3 * (1 - peer.delayRate) + 0.2 * (peer.avgRating / 5)));

  const you: NetworkPeer = {
    id: 'NET-YOU',
    label: MOCK_TRANSPORTER.name,
    isYou: true,
    onTimeRate: round3(onTimeRate),
    acceptanceRate: round3(acceptanceRate),
    delayRate: round3(delayRate),
    avgRating: Math.round(avgRating * 10) / 10,
    costIndex: 0.97,
    reliabilityScore: 0,
    trips: completed.length,
  };
  you.reliabilityScore = score(you);

  const peers: NetworkPeer[] = NETWORK_PEER_SEEDS.map((seed) => ({
    ...seed,
    isYou: false,
    reliabilityScore: score(seed),
    // A little jitter so the leaderboard does not read as hand-typed.
    trips: seed.trips + rng.int(-15, 15),
  }));

  peers.push(you);
  peers.sort((a, b) => b.reliabilityScore - a.reliabilityScore);

  return {
    onTimeRate: 0.887,
    acceptanceRate: 0.84,
    avgDelayMinutes: 262,
    avgRating: 4.2,
    emptyReturnRate: 0.27,
    avgTurnaroundHours: 5.1,
    // Corridor norms: the port is the network's worst point, the consignee its
    // best — which is exactly the shape our own numbers have to answer to.
    avgWaitingHoursByLocation: {
      port: 3.6,
      border: 3.1,
      loading_site: 4.2,
      unloading_site: 2.4,
    },
    peers,
    opportunityBands: OPPORTUNITY_BANDS,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
