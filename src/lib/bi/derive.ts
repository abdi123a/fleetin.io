import {
  CHARGE_TYPES,
  DELAY_OWNER_PARTY,
  DELAY_OWNERS,
  PENALTY_CHARGE_TYPES,
  STAGE_ORDER,
  TERMINAL_STAGE,
  type BiDataset,
  type CargoType,
  type Charge,
  type ChargeType,
  type Container,
  type ContainerType,
  type DelayAttribution,
  type DelayOwner,
  type DelayParty,
  type DeliveryOutcome,
  type EtaSnapshot,
  type Shipment,
  type ShipmentEvent,
  type StageKey,
} from '@/features/shipper-bi/contracts';
import {
  EARLY_THRESHOLD_MINUTES,
  ON_TIME_GRACE_MINUTES,
  RISK_DWELL_CEILING_RATIO,
  RISK_ETA_DRIFT_CEILING_MINUTES,
  RISK_WEIGHTS,
} from './config';
import { clamp, quantile, sum } from './stats';
import { daysBetween, hoursBetween, minutesBetween } from './time';

/**
 * Turn events and money into one flat row per shipment.
 *
 * This is the layer the whole dashboard stands on. Roughly four fifths of the
 * twenty-one scoped features are a `GROUP BY` over `ShipmentFact`; the rest need
 * the raw events as well. Keeping it pure — no React, no fetch, no clock —
 * means the same definitions can be unit-tested here today and ported to SQL in
 * `fleetin-backend` later without a second interpretation of "on time".
 *
 * Nothing in here reads `Date.now()`. Anything that needs "now" takes `asOf`
 * from the dataset, so a fact table is reproducible and a test is not flaky at
 * midnight.
 */

export interface ShipmentFact {
  shipmentId: string;
  reference: string;
  shipperId: string;
  transporterId: string;
  routeId: string;
  containerId?: string;
  containerType?: ContainerType;
  cargoType: CargoType;
  weightKg: number;

  createdAt: string;
  plannedDeliveryAt: string;
  deliveredAt?: string;
  returnedAt?: string;
  freeTimeExpiresAt?: string;

  currentStage: StageKey;
  currentStageAt: string;
  /** Hours since the shipment entered its current stage, as of `asOf`. */
  currentStageDwellHours: number;
  /** Time spent in each stage the shipment has left. Open stage excluded. */
  stageDurationHours: Partial<Record<StageKey, number>>;
  /** Stages the shipment has actually reached, for funnel widths. */
  stagesReached: StageKey[];

  isDelivered: boolean;
  /** Open until the container is back — delivery is not the end of the job. */
  isOpen: boolean;
  deliveryOutcome?: DeliveryOutcome;
  /** Signed minutes against plan. Negative is ahead. */
  deliveryVarianceMinutes?: number;

  totalDelayMinutes: number;
  delayByOwner: Record<DelayOwner, number>;
  delayByParty: Record<DelayParty, number>;
  delayByStage: Partial<Record<StageKey, number>>;
  primaryDelayOwner?: DelayOwner;

  emptyReturnCycleDays?: number;
  /** Days past free time the container was (or still is) out. */
  emptyReturnOverdueDays: number;
  detentionDays: number;
  demurrageDays: number;

  costTotal: number;
  costByType: Record<ChargeType, number>;
  /** Everything that is not base freight — the avoidable part of the bill. */
  accessorialCost: number;

  /** Latest prediction against plan, signed minutes. Open shipments only. */
  etaDriftMinutes?: number;
  predictedArrivalAt?: string;
  riskScore: number;
}

const emptyDelayByOwner = (): Record<DelayOwner, number> =>
  Object.fromEntries(DELAY_OWNERS.map((owner) => [owner, 0])) as Record<DelayOwner, number>;

const emptyDelayByParty = (): Record<DelayParty, number> => ({
  shipper: 0,
  transporter: 0,
  fleetin: 0,
});

const emptyCostByType = (): Record<ChargeType, number> =>
  Object.fromEntries(CHARGE_TYPES.map((type) => [type, 0])) as Record<ChargeType, number>;

/* ---------------------------------------------------------------------------
 * Individual definitions — exported so the tests can pin them one at a time
 * ------------------------------------------------------------------------ */

/**
 * Which of the three delivery buckets a shipment landed in.
 *
 * Three, not two. A single on-time percentage cannot distinguish a delivery ten
 * minutes late from one two days late, and it silently rewards chronic early
 * arrival — which in practice is a truck idling at a gate that has not opened,
 * i.e. the waiting charges in the cost section.
 */
export function classifyDelivery(
  plannedDeliveryAt: string,
  actualDeliveryAt: string,
): { outcome: DeliveryOutcome; varianceMinutes: number } {
  const varianceMinutes = minutesBetween(plannedDeliveryAt, actualDeliveryAt);
  if (varianceMinutes > ON_TIME_GRACE_MINUTES) return { outcome: 'late', varianceMinutes };
  if (varianceMinutes < -EARLY_THRESHOLD_MINUTES) return { outcome: 'early', varianceMinutes };
  return { outcome: 'on_time', varianceMinutes };
}

/**
 * Split time past free time into demurrage and detention.
 *
 * The scoping sheet treats these as one line. They are not: demurrage accrues
 * while the box is still *inside* the terminal and is owed to the shipping
 * line; detention accrues once it is *outside* and is usually the consignee's
 * or the transporter's doing. Reported together, the number tells you that you
 * are losing money but not which lever moves it.
 */
export function splitFreeTimeOverrun(
  container: Container,
  asOf: string,
): { demurrageDays: number; detentionDays: number; overdueDays: number } {
  const expiry = container.freeTimeExpiresAt;
  const gateOut = container.gateOutAt;
  const returned = container.returnedAt;

  // Inside the terminal past free time.
  const demurrageEnd = gateOut ?? asOf;
  const demurrageDays = Math.max(0, Math.round(daysBetween(expiry, demurrageEnd)));

  // Outside the terminal past free time. Only counts once it has gated out.
  const detentionStart = gateOut && gateOut > expiry ? gateOut : expiry;
  const detentionEnd = returned ?? asOf;
  const detentionDays = gateOut ? Math.max(0, Math.round(daysBetween(detentionStart, detentionEnd))) : 0;

  return {
    demurrageDays,
    detentionDays,
    overdueDays: Math.max(0, Math.round(daysBetween(expiry, returned ?? asOf))),
  };
}

/**
 * How long the shipment sat in each stage it has left behind.
 *
 * Reads the event stream rather than the denormalised `currentStage`, and
 * orders by `seq` first: a driver reporting a pickup after they have already
 * reported departure would otherwise produce a negative dwell.
 */
export function deriveStageDurations(events: ShipmentEvent[]): {
  stageDurationHours: Partial<Record<StageKey, number>>;
  stagesReached: StageKey[];
} {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const stageDurationHours: Partial<Record<StageKey, number>> = {};
  const stagesReached: StageKey[] = [];

  for (const [index, event] of ordered.entries()) {
    if (!stagesReached.includes(event.stage)) stagesReached.push(event.stage);
    const next = ordered[index + 1];
    if (!next) break;
    const hours = Math.max(0, hoursBetween(event.occurredAt, next.occurredAt));
    stageDurationHours[event.stage] = (stageDurationHours[event.stage] ?? 0) + hours;
  }

  return { stageDurationHours, stagesReached };
}

/**
 * Sum attributed delay by owner, by party, and by the stage that lost the time.
 *
 * Attribution is read, never inferred. A delay report that recomputes blame on
 * every query is one nobody can be held to — the moment a transporter disputes
 * a charge, the answer has to be the same as it was last month.
 */
export function deriveDelay(attributions: DelayAttribution[]): {
  totalDelayMinutes: number;
  delayByOwner: Record<DelayOwner, number>;
  delayByParty: Record<DelayParty, number>;
  delayByStage: Partial<Record<StageKey, number>>;
  primaryDelayOwner?: DelayOwner;
} {
  const delayByOwner = emptyDelayByOwner();
  const delayByParty = emptyDelayByParty();
  const delayByStage: Partial<Record<StageKey, number>> = {};

  for (const attribution of attributions) {
    delayByOwner[attribution.owner] += attribution.delayMinutes;
    delayByParty[DELAY_OWNER_PARTY[attribution.owner]] += attribution.delayMinutes;
    delayByStage[attribution.stage] =
      (delayByStage[attribution.stage] ?? 0) + attribution.delayMinutes;
  }

  const totalDelayMinutes = sum(Object.values(delayByOwner));
  const primaryDelayOwner = (Object.entries(delayByOwner) as [DelayOwner, number][])
    .filter(([, minutes]) => minutes > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  return { totalDelayMinutes, delayByOwner, delayByParty, delayByStage, primaryDelayOwner };
}

/** Total the ledger by charge type. */
export function deriveCost(charges: Charge[]): {
  costTotal: number;
  costByType: Record<ChargeType, number>;
  accessorialCost: number;
} {
  const costByType = emptyCostByType();
  for (const charge of charges) costByType[charge.type] += charge.amount;
  const costTotal = sum(Object.values(costByType));
  const accessorialCost = costTotal - costByType.base_freight;
  return { costTotal, costByType, accessorialCost };
}

/**
 * Which shipment should someone look at first, 0–100.
 *
 * Blends the three independent failure modes rather than ranking on lateness
 * alone: a shipment can be on schedule and still be the urgent one because its
 * free time expires tonight. Each component is normalised to 0–1 against a
 * ceiling from `config.ts`, then weighted.
 */
export function computeRiskScore(input: {
  etaDriftMinutes?: number;
  stageDwellHours: number;
  stageP90Hours: number;
  freeTimeHoursRemaining?: number;
}): number {
  const drift = clamp(
    (input.etaDriftMinutes ?? 0) / RISK_ETA_DRIFT_CEILING_MINUTES,
    0,
    1,
  );

  const dwellCeiling = input.stageP90Hours * RISK_DWELL_CEILING_RATIO;
  const dwell = dwellCeiling <= 0 ? 0 : clamp(input.stageDwellHours / dwellCeiling, 0, 1);

  // Headroom counts only once it is inside a day; beyond that it is not news.
  const headroom = input.freeTimeHoursRemaining;
  const freeTime =
    headroom === undefined ? 0 : headroom <= 0 ? 1 : clamp(1 - headroom / 24, 0, 1);

  const score =
    drift * RISK_WEIGHTS.etaDrift +
    dwell * RISK_WEIGHTS.stageDwell +
    freeTime * RISK_WEIGHTS.freeTime;

  return Math.round(score * 100);
}

/* ---------------------------------------------------------------------------
 * The whole dataset
 * ------------------------------------------------------------------------ */

/** Index of stage -> P90 dwell across the dataset, used by the risk score. */
export function deriveStageP90(facts: ShipmentFact[]): Partial<Record<StageKey, number>> {
  const perStage = new Map<StageKey, number[]>();
  for (const fact of facts) {
    for (const [stage, hours] of Object.entries(fact.stageDurationHours)) {
      const key = stage as StageKey;
      const existing = perStage.get(key);
      if (existing) existing.push(hours as number);
      else perStage.set(key, [hours as number]);
    }
  }
  const p90: Partial<Record<StageKey, number>> = {};
  for (const [stage, values] of perStage) p90[stage] = quantile(values, 0.9);
  return p90;
}

/**
 * Derive every fact for a dataset.
 *
 * Two passes on purpose: the risk score needs each stage's P90 dwell, which is
 * a property of the population, not of one shipment. Computing it per shipment
 * would make a shipment's score depend on which page it was fetched on.
 */
export function deriveFacts(dataset: BiDataset): ShipmentFact[] {
  const { asOf } = dataset;

  const eventsByShipment = indexBy(dataset.events, (event) => event.shipmentId);
  const delaysByShipment = indexBy(dataset.delays, (delay) => delay.shipmentId);
  const chargesByShipment = indexBy(dataset.charges, (charge) => charge.shipmentId);
  const containerById = new Map(dataset.containers.map((c) => [c.id, c]));
  const latestEta = latestSnapshotByShipment(dataset.etaSnapshots);

  const base = dataset.shipments.map((shipment) =>
    deriveOne(shipment, {
      asOf,
      events: eventsByShipment.get(shipment.id) ?? [],
      delays: delaysByShipment.get(shipment.id) ?? [],
      charges: chargesByShipment.get(shipment.id) ?? [],
      container: shipment.containerId ? containerById.get(shipment.containerId) : undefined,
      eta: latestEta.get(shipment.id),
    }),
  );

  const stageP90 = deriveStageP90(base);

  return base.map((fact) => ({
    ...fact,
    riskScore: fact.isOpen
      ? computeRiskScore({
          etaDriftMinutes: fact.etaDriftMinutes,
          stageDwellHours: fact.currentStageDwellHours,
          stageP90Hours: stageP90[fact.currentStage] ?? 0,
          freeTimeHoursRemaining: fact.freeTimeExpiresAt
            ? hoursBetween(asOf, fact.freeTimeExpiresAt)
            : undefined,
        })
      : 0,
  }));
}

function deriveOne(
  shipment: Shipment,
  context: {
    asOf: string;
    events: ShipmentEvent[];
    delays: DelayAttribution[];
    charges: Charge[];
    container?: Container;
    eta?: EtaSnapshot;
  },
): ShipmentFact {
  const { asOf, events, delays, charges, container, eta } = context;

  const { stageDurationHours, stagesReached } = deriveStageDurations(events);
  const delay = deriveDelay(delays);
  const cost = deriveCost(charges);

  const isDelivered = Boolean(shipment.actualDeliveryAt);
  const isOpen = STAGE_ORDER[shipment.currentStage] < STAGE_ORDER[TERMINAL_STAGE];

  const delivery = shipment.actualDeliveryAt
    ? classifyDelivery(shipment.plannedDeliveryAt, shipment.actualDeliveryAt)
    : undefined;

  const overrun = container
    ? splitFreeTimeOverrun(container, asOf)
    : { demurrageDays: 0, detentionDays: 0, overdueDays: 0 };

  // Cycle time is delivery -> empty return, so it only exists once both have
  // happened; an in-flight container has a duration, not a cycle time.
  const emptyReturnCycleDays =
    container?.deliveredAt && container.returnedAt
      ? daysBetween(container.deliveredAt, container.returnedAt)
      : undefined;

  return {
    shipmentId: shipment.id,
    reference: shipment.reference,
    shipperId: shipment.shipperId,
    transporterId: shipment.transporterId,
    routeId: shipment.routeId,
    containerId: container?.id,
    containerType: container?.type,
    cargoType: shipment.cargoType,
    weightKg: shipment.weightKg,

    createdAt: shipment.createdAt,
    plannedDeliveryAt: shipment.plannedDeliveryAt,
    deliveredAt: shipment.actualDeliveryAt,
    returnedAt: container?.returnedAt,
    freeTimeExpiresAt: container?.freeTimeExpiresAt,

    currentStage: shipment.currentStage,
    currentStageAt: shipment.currentStageAt,
    currentStageDwellHours: Math.max(0, hoursBetween(shipment.currentStageAt, asOf)),
    stageDurationHours,
    stagesReached,

    isDelivered,
    isOpen,
    deliveryOutcome: delivery?.outcome,
    deliveryVarianceMinutes: delivery?.varianceMinutes,

    ...delay,

    emptyReturnCycleDays,
    emptyReturnOverdueDays: overrun.overdueDays,
    detentionDays: overrun.detentionDays,
    demurrageDays: overrun.demurrageDays,

    ...cost,

    etaDriftMinutes:
      isOpen && eta ? minutesBetween(shipment.plannedDeliveryAt, eta.predictedArrivalAt) : undefined,
    predictedArrivalAt: isOpen ? eta?.predictedArrivalAt : undefined,
    riskScore: 0, // filled by the second pass
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

function indexBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = index.get(key);
    if (existing) existing.push(item);
    else index.set(key, [item]);
  }
  return index;
}

/** Most recently computed prediction per shipment. */
function latestSnapshotByShipment(snapshots: EtaSnapshot[]): Map<string, EtaSnapshot> {
  const latest = new Map<string, EtaSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.shipmentId);
    if (!current || snapshot.computedAt > current.computedAt) {
      latest.set(snapshot.shipmentId, snapshot);
    }
  }
  return latest;
}

/** Charge lines that are avoidable, for the accessorial views. */
export function isPenaltyCharge(type: ChargeType): boolean {
  return PENALTY_CHARGE_TYPES.includes(type);
}
