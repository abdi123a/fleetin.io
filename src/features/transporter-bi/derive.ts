import {
  bucketKey,
  bucketLabel,
  eachBucket,
  minutesBetween,
  toDayString,
  type Granularity,
  type Period,
} from '@/lib/bi/time';
import {
  CO2_KG_PER_KM_EMPTY,
  CO2_KG_PER_KM_LOADED,
  EMPTY_COST_PER_KM,
  EMPTY_RISK_HOURS,
  ON_TIME_GRACE_MINUTES,
} from './config';
import {
  DELAY_CAUSE_PARTY,
  type AgingBucket,
  type BackhaulStatus,
  type ContainerType,
  type DelayCause,
  type DelayParty,
  type DetailRequest,
  type FleetState,
  type KpiMetric,
  type MetricPolarity,
  type MetricUnit,
  type PaymentStatus,
  type TransporterDataset,
  type TransporterFilters,
  type TransporterRoute,
  type TrendPoint,
  type Trip,
  type TripStatus,
  type WaitingLocation,
} from './contracts';

/**
 * The flat fact table the whole portal stands on.
 *
 * One pass over the dataset turns every trip into a `TripFact` with all the
 * judgements pre-made — on-time, delay ownership, empty mileage, CO₂, payment
 * aging, live empty-return risk — so sections aggregate rather than re-derive,
 * and two cards showing "the same" number cannot disagree about what it means.
 *
 * Mirrors `lib/bi/derive.ts` for the shipper suite; kept inside the feature
 * because the viewpoint (and therefore the fact grain) is the carrier's.
 */

export interface FactPayment {
  invoiceNo: string;
  amount: number;
  invoicedAt: string;
  dueAt: string;
  paidAt?: string;
  status: PaymentStatus;
  /** Unpaid remainder — the full amount until settlement lands. */
  outstanding: number;
  /** Days past due. Negative while not yet due. */
  agingDays: number;
  agingBucket: AgingBucket;
  expectedSettlementAt: string;
}

export interface TripFact {
  tripId: string;
  ref: string;
  routeId: string;
  vehicleId: string;
  driverId: string;
  customerId: string;
  containerType: ContainerType;
  cargo: string;
  status: TripStatus;

  offeredAt: string;
  acceptedAt: string;
  startedAt?: string;
  departedAt?: string;
  plannedDeliveryAt: string;
  deliveredAt?: string;
  etaAt?: string;
  progressPct?: number;

  /** The day this trip counts on, for every period bucket in the portal. */
  anchorDate: string;

  isCompleted: boolean;
  isCancelled: boolean;
  /** Wheels committed right now: scheduled through returning. */
  isLive: boolean;

  onTime?: boolean;
  /** Signed minutes vs plan; negative is early. Completed trips only. */
  deliveryVarianceMinutes?: number;

  isDelayed: boolean;
  delayMinutes: number;
  delayByCause: Partial<Record<DelayCause, number>>;
  delayByParty: Partial<Record<DelayParty, number>>;
  primaryCause?: DelayCause;

  waitingHours: number;
  waitingByLocation: Partial<Record<WaitingLocation, number>>;

  distanceKm: number;
  /** Loaded km including a matched backhaul's return leg. */
  loadedKm: number;
  emptyKm: number;
  totalKm: number;
  co2Kg: number;
  /** The share of `co2Kg` burned running empty. */
  emptyCo2Kg: number;
  /** Direct cost of the empty km driven, USD. */
  emptyCostUsd: number;

  revenue: number;
  backhaulRevenue: number;
  totalRevenue: number;
  revenuePerKm: number;

  backhaulStatus: BackhaulStatus;
  matchedLoadRef?: string;

  rating?: number;
  incident?: string;

  payment?: FactPayment;

  /**
   * 0–100 for live outbound trips with no return load: how urgently dispatch
   * must find one. Blends closeness to arrival with the cost of running home
   * empty; resolved trips carry 0.
   */
  emptyReturnRisk: number;
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

function agingBucketOf(agingDays: number): AgingBucket {
  if (agingDays <= 0) return 'current';
  if (agingDays <= 15) return 'b1_15';
  if (agingDays <= 30) return 'b16_30';
  if (agingDays <= 45) return 'b31_45';
  return 'b46_plus';
}

function derivePayment(trip: Trip, asOf: Date): FactPayment | undefined {
  const payment = trip.payment;
  if (!payment) return undefined;

  const paid = payment.paidAt !== undefined;
  const overdue = !paid && new Date(payment.dueAt) < asOf;
  const agingDays = Math.floor(
    (asOf.getTime() - new Date(payment.dueAt).getTime()) / 86_400_000,
  );

  return {
    invoiceNo: payment.invoiceNo,
    amount: payment.amount,
    invoicedAt: payment.invoicedAt,
    dueAt: payment.dueAt,
    paidAt: payment.paidAt,
    status: paid ? 'paid' : overdue ? 'overdue' : 'pending',
    outstanding: paid ? 0 : payment.amount,
    agingDays: paid ? 0 : agingDays,
    agingBucket: paid ? 'current' : agingBucketOf(agingDays),
    expectedSettlementAt: payment.expectedSettlementAt,
  };
}

function deriveEmptyReturnRisk(trip: Trip, route: TransporterRoute | undefined, asOf: Date): number {
  const liveOutbound = trip.status === 'enroute' || trip.status === 'at_destination';
  if (!liveOutbound || trip.backhaul.status !== 'pending' || !trip.etaAt) return 0;

  const hoursToArrival = Math.max(
    (new Date(trip.etaAt).getTime() - asOf.getTime()) / 3_600_000,
    0,
  );
  // Urgency: 1 at arrival, 0 at the edge of the risk window.
  const urgency = Math.max(0, 1 - hoursToArrival / EMPTY_RISK_HOURS);
  // Stake: how expensive an unmatched return on this lane is, normalised to
  // the longest corridor leg.
  const stake = Math.min((route?.distanceKm ?? 400) / 1150, 1);

  return Math.round(Math.min(100, 30 + urgency * 55 + stake * 15));
}

export function deriveTripFacts(dataset: TransporterDataset): TripFact[] {
  const asOf = new Date(dataset.generatedAt);
  const routeById = new Map(dataset.routes.map((route) => [route.id, route]));

  return dataset.trips.map((trip) => {
    const delayByCause: Partial<Record<DelayCause, number>> = {};
    const delayByParty: Partial<Record<DelayParty, number>> = {};
    let delayMinutes = 0;
    let primaryCause: DelayCause | undefined;
    let primaryCauseMinutes = 0;

    for (const segment of trip.delays) {
      delayMinutes += segment.minutes;
      delayByCause[segment.cause] = (delayByCause[segment.cause] ?? 0) + segment.minutes;
      const party = DELAY_CAUSE_PARTY[segment.cause];
      delayByParty[party] = (delayByParty[party] ?? 0) + segment.minutes;
      if ((delayByCause[segment.cause] ?? 0) > primaryCauseMinutes) {
        primaryCauseMinutes = delayByCause[segment.cause] ?? 0;
        primaryCause = segment.cause;
      }
    }

    const waitingByLocation: Partial<Record<WaitingLocation, number>> = {};
    let waitingHours = 0;
    for (const segment of trip.waiting) {
      waitingHours += segment.hours;
      waitingByLocation[segment.location] =
        Math.round(((waitingByLocation[segment.location] ?? 0) + segment.hours) * 10) / 10;
    }

    const isCompleted = trip.status === 'completed';
    const isCancelled = trip.status === 'cancelled';

    const deliveryVarianceMinutes =
      isCompleted && trip.deliveredAt
        ? Math.round(minutesBetween(trip.plannedDeliveryAt, trip.deliveredAt))
        : undefined;
    const onTime =
      deliveryVarianceMinutes === undefined
        ? undefined
        : deliveryVarianceMinutes <= ON_TIME_GRACE_MINUTES;

    const backhaul = trip.backhaul;
    const outboundKm = isCancelled ? 0 : trip.distanceKm;
    const backhaulLoadedKm = backhaul.status === 'matched' ? (backhaul.loadedKm ?? 0) : 0;
    // Live trips have not driven their return yet; empty km lands on completion.
    const emptyKm = isCompleted ? backhaul.emptyKm : 0;
    const loadedKm = outboundKm + (isCompleted ? backhaulLoadedKm : 0);
    const totalKm = loadedKm + emptyKm;

    const emptyCo2Kg = Math.round(emptyKm * CO2_KG_PER_KM_EMPTY);
    const co2Kg = Math.round(loadedKm * CO2_KG_PER_KM_LOADED + emptyKm * CO2_KG_PER_KM_EMPTY);

    const backhaulRevenue = isCompleted ? (backhaul.revenue ?? 0) : 0;
    const revenue = isCancelled ? 0 : trip.revenue;
    const totalRevenue = isCompleted ? revenue + backhaulRevenue : 0;

    const anchorSource = trip.deliveredAt ?? trip.plannedDeliveryAt;

    return {
      tripId: trip.id,
      ref: trip.ref,
      routeId: trip.routeId,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,
      customerId: trip.customerId,
      containerType: trip.containerType,
      cargo: trip.cargo,
      status: trip.status,

      offeredAt: trip.offeredAt,
      acceptedAt: trip.acceptedAt,
      startedAt: trip.startedAt,
      departedAt: trip.departedAt,
      plannedDeliveryAt: trip.plannedDeliveryAt,
      deliveredAt: trip.deliveredAt,
      etaAt: trip.etaAt,
      progressPct: trip.progressPct,

      anchorDate: toDayString(isCancelled ? trip.acceptedAt : anchorSource),

      isCompleted,
      isCancelled,
      isLive: !isCompleted && !isCancelled,

      onTime,
      deliveryVarianceMinutes,

      isDelayed: delayMinutes > 0,
      delayMinutes,
      delayByCause,
      delayByParty,
      primaryCause,

      waitingHours: Math.round(waitingHours * 10) / 10,
      waitingByLocation,

      distanceKm: outboundKm,
      loadedKm,
      emptyKm,
      totalKm,
      co2Kg,
      emptyCo2Kg,
      emptyCostUsd: Math.round(emptyKm * EMPTY_COST_PER_KM),

      revenue,
      backhaulRevenue,
      totalRevenue,
      revenuePerKm: totalKm > 0 ? Math.round((totalRevenue / totalKm) * 100) / 100 : 0,

      backhaulStatus: backhaul.status,
      matchedLoadRef: backhaul.matchedLoadRef,

      rating: trip.driverRating,
      incident: trip.incident,

      payment: derivePayment(trip, asOf),

      emptyReturnRisk: deriveEmptyReturnRisk(trip, routeById.get(trip.routeId), asOf),
    };
  });
}

/* ---------------------------------------------------------------------------
 * Filtering
 * ------------------------------------------------------------------------ */

/** Apply the dimension filters (not the period — that is `inPeriod`). */
export function applyFilters(facts: TripFact[], filters: Partial<TransporterFilters>): TripFact[] {
  const routes = filters.routeIds?.length ? new Set(filters.routeIds) : null;
  const vehicles = filters.vehicleIds?.length ? new Set(filters.vehicleIds) : null;
  const drivers = filters.driverIds?.length ? new Set(filters.driverIds) : null;
  const customers = filters.customerIds?.length ? new Set(filters.customerIds) : null;
  const statuses = filters.statuses?.length ? new Set(filters.statuses) : null;
  const containers = filters.containerTypes?.length ? new Set(filters.containerTypes) : null;
  const causes = filters.delayCauses?.length ? new Set(filters.delayCauses) : null;

  return facts.filter((fact) => {
    if (routes && !routes.has(fact.routeId)) return false;
    if (vehicles && !vehicles.has(fact.vehicleId)) return false;
    if (drivers && !drivers.has(fact.driverId)) return false;
    if (customers && !customers.has(fact.customerId)) return false;
    if (statuses && !statuses.has(fact.status)) return false;
    if (containers && !containers.has(fact.containerType)) return false;
    if (causes && !Object.keys(fact.delayByCause).some((cause) => causes.has(cause as DelayCause)))
      return false;
    return true;
  });
}

/** Facts whose anchor day falls inside the inclusive period. */
export function inPeriod(facts: TripFact[], period: Period): TripFact[] {
  return facts.filter(
    (fact) => fact.anchorDate >= period.from && fact.anchorDate <= period.to,
  );
}

/* ---------------------------------------------------------------------------
 * Series + KPI helpers
 * ------------------------------------------------------------------------ */

export interface SeriesOptions {
  facts: TripFact[];
  period: Period;
  granularity: Granularity;
  /** Which date puts a fact in a bucket. Return undefined to leave it out. */
  dateOf?: (fact: TripFact) => string | undefined;
  /** The measure being trended. Return undefined to leave the fact out. */
  valueOf: (fact: TripFact) => number | undefined;
  aggregate?: 'sum' | 'mean';
}

/**
 * Bucket facts onto a real calendar series, empty buckets included, so a
 * quiet week is a visible gap rather than a shortened axis.
 */
export function buildSeries({
  facts,
  period,
  granularity,
  dateOf = (fact) => fact.anchorDate,
  valueOf,
  aggregate = 'sum',
}: SeriesOptions): { points: TrendPoint[]; formatBucket: (key: string) => string } {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const fact of facts) {
    const date = dateOf(fact);
    if (!date) continue;
    const value = valueOf(fact);
    if (value === undefined || Number.isNaN(value)) continue;

    const key = bucketKey(date, granularity);
    const entry = totals.get(key) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    totals.set(key, entry);
  }

  const points = eachBucket(period, granularity).map((key) => {
    const entry = totals.get(key);
    if (!entry || entry.count === 0) return { t: key, v: 0 };
    return {
      t: key,
      v: aggregate === 'sum' ? Math.round(entry.sum * 10) / 10 : Math.round((entry.sum / entry.count) * 10) / 10,
    };
  });

  return { points, formatBucket: (key: string) => bucketLabel(key, granularity) };
}

export interface KpiInput {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
  polarity: MetricPolarity;
  previousValue?: number;
  trend?: TrendPoint[];
  previousTrend?: TrendPoint[];
  caption?: string;
  detail?: DetailRequest;
}

/** Assemble a KpiMetric, deriving the delta from the two values. */
export function buildKpi(input: KpiInput): KpiMetric {
  const { previousValue } = input;
  const deltaPct =
    previousValue === undefined || previousValue === 0
      ? undefined
      : Math.round(((input.value - previousValue) / Math.abs(previousValue)) * 1000) / 1000;

  return {
    key: input.key,
    label: input.label,
    value: input.value,
    unit: input.unit,
    polarity: input.polarity,
    previousValue,
    deltaPct,
    trend: input.trend ?? [],
    previousTrend: input.previousTrend,
    caption: input.caption,
    detail: input.detail,
  };
}

/* ---------------------------------------------------------------------------
 * Fleet log aggregation
 * ------------------------------------------------------------------------ */

export interface FleetSnapshot {
  vehicleDays: number;
  activeDays: number;
  idleDays: number;
  maintenanceDays: number;
  /** activeDays / (vehicleDays − maintenanceDays): downtime is not demand. */
  utilization: number;
  byVehicle: Array<{
    vehicleId: string;
    activeDays: number;
    idleDays: number;
    maintenanceDays: number;
    utilization: number;
  }>;
}

/**
 * Utilisation from the fleet log, honouring the vehicle filter: a fleet
 * narrowed to three trucks reports those three trucks' utilisation.
 */
export function fleetSnapshot(
  dataset: TransporterDataset,
  period: Period,
  vehicleIds?: string[],
): FleetSnapshot {
  const wanted = vehicleIds?.length ? new Set(vehicleIds) : null;
  const perVehicle = new Map<string, { active: number; idle: number; maintenance: number }>();

  for (const day of dataset.fleetLog) {
    if (day.date < period.from || day.date > period.to) continue;
    if (wanted && !wanted.has(day.vehicleId)) continue;
    const entry = perVehicle.get(day.vehicleId) ?? { active: 0, idle: 0, maintenance: 0 };
    if (day.state === 'active') entry.active += 1;
    else if (day.state === 'maintenance') entry.maintenance += 1;
    else entry.idle += 1;
    perVehicle.set(day.vehicleId, entry);
  }

  let activeDays = 0;
  let idleDays = 0;
  let maintenanceDays = 0;
  const byVehicle = Array.from(perVehicle.entries()).map(([vehicleId, entry]) => {
    activeDays += entry.active;
    idleDays += entry.idle;
    maintenanceDays += entry.maintenance;
    const available = entry.active + entry.idle;
    return {
      vehicleId,
      activeDays: entry.active,
      idleDays: entry.idle,
      maintenanceDays: entry.maintenance,
      utilization: available > 0 ? entry.active / available : 0,
    };
  });

  const vehicleDays = activeDays + idleDays + maintenanceDays;
  const available = activeDays + idleDays;

  return {
    vehicleDays,
    activeDays,
    idleDays,
    maintenanceDays,
    utilization: available > 0 ? activeDays / available : 0,
    byVehicle: byVehicle.sort((a, b) => b.idleDays - a.idleDays),
  };
}

/** Vehicle-day counts per state per bucket — the utilisation trend's data. */
export function fleetStateSeries(
  dataset: TransporterDataset,
  period: Period,
  granularity: Granularity,
  vehicleIds?: string[],
): Array<{ key: FleetState; label: string; points: TrendPoint[] }> {
  const wanted = vehicleIds?.length ? new Set(vehicleIds) : null;
  const buckets = eachBucket(period, granularity);
  const byState = new Map<FleetState, Map<string, number>>([
    ['active', new Map()],
    ['idle', new Map()],
    ['maintenance', new Map()],
  ]);

  for (const day of dataset.fleetLog) {
    if (day.date < period.from || day.date > period.to) continue;
    if (wanted && !wanted.has(day.vehicleId)) continue;
    const key = bucketKey(day.date, granularity);
    const bucketTotals = byState.get(day.state);
    if (!bucketTotals) continue;
    bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + 1);
  }

  const labels: Record<FleetState, string> = {
    active: 'Active',
    idle: 'Idle',
    maintenance: 'Maintenance',
  };

  return (['active', 'idle', 'maintenance'] as const).map((state) => {
    const totals = byState.get(state);
    return {
      key: state,
      label: labels[state],
      points: buckets.map((bucket) => ({ t: bucket, v: totals?.get(bucket) ?? 0 })),
    };
  });
}

/* ---------------------------------------------------------------------------
 * Live position
 * ------------------------------------------------------------------------ */

/**
 * Where a live outbound trip sits on its lane, interpolated along the
 * straight line between endpoints — honest enough at corridor scale for a
 * situational map, and it never leaves the route's geography.
 */
export function liveTripPosition(
  fact: Pick<TripFact, 'progressPct'>,
  route: TransporterRoute,
): { lat: number; lng: number } {
  const progress = fact.progressPct ?? 0;
  return {
    lat: route.originLat + (route.destinationLat - route.originLat) * progress,
    lng: route.originLng + (route.destinationLng - route.originLng) * progress,
  };
}
