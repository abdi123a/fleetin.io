import { addHours, addMinutes, formatISO, parseISO, subDays } from 'date-fns';
import {
  CARGO_TYPES,
  CONTAINER_TYPES,
  DELAY_OWNERS,
  STAGE_KEYS,
  type BiDataset,
  type CargoType,
  type Charge,
  type Container,
  type ContainerStatus,
  type ContainerType,
  type DelayAttribution,
  type DelayOwner,
  type EtaSnapshot,
  type Shipment,
  type ShipmentEvent,
  type StageKey,
  type TrackingPosition,
  type Vehicle,
} from '../contracts';
import { defaultFreeTimeDays } from '@/lib/bi/config';
import { Rng } from './random';
import {
  ACCESSORIAL_DAY_RATES,
  MOCK_DEPOTS,
  MOCK_ROUTES,
  MOCK_SHIPPING_LINES,
  MOCK_TRANSPORTERS,
  TRANSPORTER_DELAY_BIAS,
  TRANSPORTER_RATE_PER_KM,
  WAITING_HOUR_RATE,
} from './dimensions';

/**
 * Build a mock dataset by simulating shipments, not by writing down answers.
 *
 * This matters more than it looks. If the mock produced finished chart data,
 * every number would be a guess and the derivation layer would be untested
 * until the backend arrived. Instead the generator emits the same primitives a
 * real system emits — events, charges, attributions, GPS pings — and
 * `deriveFacts` computes the metrics from them exactly as it will in
 * production. The charts are therefore already being fed by the real logic;
 * only the source of the primitives changes.
 *
 * Seeded from the shipper id, so a given shipper always gets the same world.
 */

const HOURS_PER_STAGE_MEDIAN: Record<StageKey, number> = {
  created: 6,
  documentation: 14,
  dispatched: 5,
  gate_in: 3,
  picked_up: 2,
  in_transit: 22,
  arrived: 3,
  unloading: 7,
  delivered: 30,
  empty_awaiting: 40,
  empty_returned: 0,
};

/** Spread of the log-normal each stage duration is drawn from. */
const STAGE_SIGMA = 0.42;

/**
 * Mean-to-median ratio of that log-normal, `exp(σ²/2)`.
 *
 * Used to turn stage medians into the expected duration a planner would quote.
 */
const LOGNORMAL_MEAN_FACTOR = Math.exp((STAGE_SIGMA * STAGE_SIGMA) / 2);

/** Slack a planner adds on top of the expected duration. */
const PLANNING_BUFFER = 1.06;

/** The stages that happen before the shipment counts as delivered. */
const PRE_DELIVERY_STAGES = STAGE_KEYS.slice(
  0,
  STAGE_KEYS.indexOf('delivered'),
);

/** Which owner tends to be blamed for losing time at which stage. */
const STAGE_DELAY_OWNERS: Partial<Record<StageKey, readonly (readonly [DelayOwner, number])[]>> = {
  documentation: [
    ['shipper_documentation', 6],
    ['customs', 3],
    ['shipping_line', 1],
  ],
  gate_in: [
    ['port_terminal', 5],
    ['transporter', 3],
    ['customs', 2],
  ],
  in_transit: [
    ['transporter', 7],
    ['force_majeure', 2],
  ],
  unloading: [
    ['shipper_depotage', 6],
    ['transporter', 2],
  ],
  empty_awaiting: [
    ['shipper_communication', 4],
    ['transporter', 4],
    ['shipping_line', 2],
  ],
};

export interface GenerateOptions {
  shipperId: string;
  /** Instant the world is observed at. Everything is generated backwards. */
  asOf: Date;
  /** How far back to generate history. */
  historyDays?: number;
  shipmentCount?: number;
}

export function generateDataset({
  shipperId,
  asOf,
  historyDays = 180,
  shipmentCount = 260,
}: GenerateOptions): BiDataset {
  const rng = new Rng(`${shipperId}:${historyDays}:${shipmentCount}`);
  const iso = (date: Date) => formatISO(date);

  const vehicles: Vehicle[] = MOCK_TRANSPORTERS.flatMap((transporter, index) =>
    Array.from({ length: 6 }, (_, slot) => ({
      id: `VEH-${index + 1}${String(slot + 1).padStart(2, '0')}`,
      plateNumber: `DJ ${rng.int(1000, 9999)} ${transporter.fleetCode}`,
      transporterId: transporter.id,
    })),
  );

  const shipments: Shipment[] = [];
  const events: ShipmentEvent[] = [];
  const containers: Container[] = [];
  const delays: DelayAttribution[] = [];
  const charges: Charge[] = [];
  const positions: TrackingPosition[] = [];
  const etaSnapshots: EtaSnapshot[] = [];

  for (let index = 0; index < shipmentCount; index += 1) {
    const shipmentId = `SHP-${String(index + 1).padStart(4, '0')}`;
    const reference = `FL-${asOf.getFullYear()}-${String(4200 + index)}`;

    const route = rng.pick(MOCK_ROUTES);
    const transporter = rng.pick(MOCK_TRANSPORTERS);
    const vehiclePool = vehicles.filter((v) => v.transporterId === transporter.id);
    const vehicle = rng.pick(vehiclePool);
    const cargoType = rng.pick(CARGO_TYPES) as CargoType;
    const containerType = rng.pick(CONTAINER_TYPES) as ContainerType;

    // Spread creation across the history window, biased towards recent so the
    // trailing buckets of every trend have enough shipments to be meaningful.
    const ageDays = Math.floor(historyDays * Math.pow(rng.next(), 1.35));
    const createdAt = subDays(asOf, ageDays);

    const delayBias = TRANSPORTER_DELAY_BIAS[transporter.id] ?? 0.2;
    const runsLate = rng.bool(delayBias);

    // Walk the lifecycle forward, stage by stage, stopping wherever this
    // shipment has actually got to. Later stages only exist if it got there.
    let cursor = createdAt;
    let seq = 0;
    const stageTimestamps = new Map<StageKey, Date>();
    let currentStage: StageKey = 'created';

    for (const stage of STAGE_KEYS) {
      if (cursor > asOf) break;

      stageTimestamps.set(stage, cursor);
      currentStage = stage;
      events.push({
        id: `EVT-${shipmentId}-${seq}`,
        shipmentId,
        seq,
        stage,
        occurredAt: iso(cursor),
        // Reporting lag: field events reach the system minutes to hours late.
        recordedAt: iso(addMinutes(cursor, Math.round(rng.logNormal(12, 0.9)))),
        actorType: actorForStage(stage),
        actorId: stage === 'in_transit' ? vehicle.id : transporter.id,
        locationName: locationForStage(stage, route.originName, route.destinationName),
        lat: latForStage(stage, route, rng),
        lng: lngForStage(stage, route, rng),
      });
      seq += 1;

      const medianHours =
        stage === 'in_transit'
          ? route.nominalTransitHours
          : (HOURS_PER_STAGE_MEDIAN[stage] ?? 6);

      // Late shipments lose their time at a stage, not uniformly across the trip.
      const stageOwners = STAGE_DELAY_OWNERS[stage];
      const stretch = runsLate && stageOwners ? rng.float(1.5, 3.4) : 1;
      const hours = rng.logNormal(medianHours, STAGE_SIGMA) * stretch;

      if (stageOwners && stretch > 1) {
        const owner = rng.weighted(stageOwners);
        const lostMinutes = Math.round((hours - medianHours) * 60);
        if (lostMinutes > 30) {
          delays.push({
            id: `DLY-${shipmentId}-${stage}`,
            shipmentId,
            eventId: `EVT-${shipmentId}-${seq - 1}`,
            stage,
            delayMinutes: lostMinutes,
            owner,
            reasonCode: reasonCodeFor(owner),
            attributedAt: iso(addHours(cursor, 2)),
            attributedBy: 'ops@fleetin.dj',
          });
        }
      }

      cursor = addHours(cursor, hours);
    }

    /**
     * The promised delivery date.
     *
     * Built from the *expected* duration of the pre-delivery stages, not the
     * sum of their medians. Stage durations are drawn log-normal, whose mean
     * sits `exp(σ²/2)` above its median — plan against the medians and a
     * perfectly typical shipment arrives late, which is how a mock ends up
     * reporting a 10% on-time rate that says nothing about the dashboard.
     *
     * The buffer on top is what a planner actually does: quote a date with a
     * little slack rather than the coin-flip estimate.
     */
    const plannedTotalHours =
      PRE_DELIVERY_STAGES.reduce(
        (total, stage) =>
          total +
          (stage === 'in_transit' ? route.nominalTransitHours : HOURS_PER_STAGE_MEDIAN[stage]),
        0,
      ) *
      LOGNORMAL_MEAN_FACTOR *
      PLANNING_BUFFER;

    const plannedPickupAt = addHours(createdAt, 20);
    const plannedDeliveryAt = addHours(createdAt, plannedTotalHours);

    const actualPickupAt = stageTimestamps.get('picked_up');
    const actualDeliveryAt = stageTimestamps.get('delivered');
    const currentStageAt = stageTimestamps.get(currentStage) ?? createdAt;

    const isBulkCargo =
      cargoType === 'Bulk' || cargoType === 'Bulky Goods';

    shipments.push({
      id: shipmentId,
      reference,
      shipperId,
      transporterId: transporter.id,
      routeId: route.id,
      vehicleId: vehicle.id,
      // Bulk / bulky goods move as direct haul — no shipping-line container.
      containerId: isBulkCargo ? undefined : `CNT-${String(index + 1).padStart(4, '0')}`,
      cargoType,
      weightKg: Math.round(rng.float(4_000, 26_000)),
      plannedPickupAt: iso(plannedPickupAt),
      plannedDeliveryAt: iso(plannedDeliveryAt),
      actualPickupAt: actualPickupAt ? iso(actualPickupAt) : undefined,
      actualDeliveryAt: actualDeliveryAt ? iso(actualDeliveryAt) : undefined,
      currentStage,
      currentStageAt: iso(currentStageAt),
      createdAt: iso(createdAt),
    });

    /* ---- container ---------------------------------------------------- */

    if (!isBulkCargo) {
      const gateOutAt = stageTimestamps.get('picked_up');
      const deliveredAt = stageTimestamps.get('delivered');
      const returnedAt = stageTimestamps.get('empty_returned');
      const freeTimeExpiresAt = addHours(createdAt, defaultFreeTimeDays() * 24);

      containers.push({
        id: `CNT-${String(index + 1).padStart(4, '0')}`,
        containerNo: `${rng.pick(['MSKU', 'CMAU', 'MSCU', 'HLXU', 'PILU'])}${rng.int(1000000, 9999999)}`,
        type: containerType,
        shippingLine: rng.pick(MOCK_SHIPPING_LINES),
        shipmentId,
        status: containerStatusFor(currentStage),
        gateOutAt: gateOutAt ? iso(gateOutAt) : undefined,
        deliveredAt: deliveredAt ? iso(deliveredAt) : undefined,
        freeTimeExpiresAt: iso(freeTimeExpiresAt),
        returnedAt: returnedAt ? iso(returnedAt) : undefined,
        depotId: returnedAt ? rng.pick(MOCK_DEPOTS).id : undefined,
      });
    }

    /* ---- charges ------------------------------------------------------ */

    const gateOutAt = stageTimestamps.get('picked_up');
    const deliveredAt = stageTimestamps.get('delivered');
    const returnedAt = stageTimestamps.get('empty_returned');
    const freeTimeExpiresAt = addHours(createdAt, defaultFreeTimeDays() * 24);
    const containerId = isBulkCargo ? undefined : `CNT-${String(index + 1).padStart(4, '0')}`;

    const ratePerKm = TRANSPORTER_RATE_PER_KM[transporter.id] ?? 150;
    const chargeEnd = returnedAt ?? deliveredAt ?? cursor;

    charges.push({
      id: `CHG-${shipmentId}-base`,
      shipmentId,
      containerId,
      transporterId: transporter.id,
      type: 'base_freight',
      amount: Math.round(route.distanceKm * ratePerKm * rng.float(0.94, 1.08)),
      currency: 'DJF',
      incurredFrom: iso(createdAt),
      incurredTo: iso(chargeEnd),
      status: returnedAt || (isBulkCargo && deliveredAt) ? 'invoiced' : 'estimated',
      invoiceId:
        returnedAt || (isBulkCargo && deliveredAt)
          ? `INV-${String(index + 1).padStart(4, '0')}`
          : undefined,
    });

    charges.push({
      id: `CHG-${shipmentId}-handling`,
      shipmentId,
      containerId,
      transporterId: transporter.id,
      type: 'handling',
      amount: Math.round(rng.float(18_000, 46_000)),
      currency: 'DJF',
      incurredFrom: iso(createdAt),
      incurredTo: iso(addHours(createdAt, 24)),
      status: 'invoiced',
    });

    // Waiting time at the gate becomes a charge whenever gate-in dragged.
    const gateInAt = stageTimestamps.get('gate_in');
    const pickedUpAt = stageTimestamps.get('picked_up');
    if (gateInAt && pickedUpAt) {
      const waitingHours = (pickedUpAt.getTime() - gateInAt.getTime()) / 3_600_000;
      if (waitingHours > 4) {
        charges.push({
          id: `CHG-${shipmentId}-waiting`,
          shipmentId,
          transporterId: transporter.id,
          type: 'waiting',
          amount: Math.round((waitingHours - 4) * WAITING_HOUR_RATE),
          currency: 'DJF',
          incurredFrom: iso(gateInAt),
          incurredTo: iso(pickedUpAt),
          status: 'invoiced',
        });
      }
    }

    // Demurrage / detention only apply to containerised cargo.
    if (!isBulkCargo) {
      if (gateOutAt && gateOutAt > freeTimeExpiresAt) {
        const days = (gateOutAt.getTime() - freeTimeExpiresAt.getTime()) / 86_400_000;
        charges.push({
          id: `CHG-${shipmentId}-demurrage`,
          shipmentId,
          containerId,
          transporterId: transporter.id,
          type: 'demurrage',
          amount: Math.round(days * ACCESSORIAL_DAY_RATES.demurrage),
          currency: 'DJF',
          incurredFrom: iso(freeTimeExpiresAt),
          incurredTo: iso(gateOutAt),
          status: 'invoiced',
        });
      }

      const detentionEnd = returnedAt ?? asOf;
      const detentionStart =
        gateOutAt && gateOutAt > freeTimeExpiresAt ? gateOutAt : freeTimeExpiresAt;
      if (gateOutAt && detentionEnd > detentionStart) {
        const days = (detentionEnd.getTime() - detentionStart.getTime()) / 86_400_000;
        if (days > 0.5) {
          charges.push({
            id: `CHG-${shipmentId}-detention`,
            shipmentId,
            containerId,
            transporterId: transporter.id,
            type: 'detention',
            amount: Math.round(days * ACCESSORIAL_DAY_RATES.detention),
            currency: 'DJF',
            incurredFrom: iso(detentionStart),
            incurredTo: iso(detentionEnd),
            status: returnedAt ? 'invoiced' : 'estimated',
          });
        }
      }
    }

    if (rng.bool(0.14)) {
      charges.push({
        id: `CHG-${shipmentId}-extra`,
        shipmentId,
        transporterId: transporter.id,
        type: 'extra',
        amount: Math.round(rng.float(12_000, 88_000)),
        currency: 'DJF',
        incurredFrom: iso(createdAt),
        incurredTo: iso(chargeEnd),
        status: rng.bool(0.2) ? 'disputed' : 'invoiced',
      });
    }

    /* ---- live tracking & ETA ------------------------------------------ */

    const isOpen = currentStage !== 'empty_returned';
    if (isOpen) {
      const progress = stageProgress(currentStage);
      positions.push({
        shipmentId,
        vehicleId: vehicle.id,
        lat: interpolate(route.originLat, route.destinationLat, progress) + rng.float(-0.12, 0.12),
        lng: interpolate(route.originLng, route.destinationLng, progress) + rng.float(-0.12, 0.12),
        speedKph: currentStage === 'in_transit' ? Math.round(rng.float(38, 82)) : 0,
        heading: Math.round(rng.float(0, 360)),
        recordedAt: iso(subDays(asOf, rng.float(0, 0.02))),
      });

      // A short history of predictions, so ETA drift has a shape to show.
      const driftHours = runsLate ? rng.float(3, 30) : rng.float(-4, 4);
      for (let step = 3; step >= 0; step -= 1) {
        etaSnapshots.push({
          shipmentId,
          predictedArrivalAt: iso(
            addHours(plannedDeliveryAt, driftHours * ((4 - step) / 4)),
          ),
          computedAt: iso(subDays(asOf, step * 0.5)),
          source: step === 0 ? 'gps_projection' : 'historical_median',
          confidence: Math.min(0.95, 0.55 + (4 - step) * 0.1),
        });
      }
    }
  }

  return {
    asOf: formatISO(asOf),
    shipperId,
    transporters: MOCK_TRANSPORTERS,
    routes: MOCK_ROUTES,
    depots: MOCK_DEPOTS,
    vehicles,
    shipments,
    events,
    containers,
    delays,
    charges,
    positions,
    etaSnapshots,
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

function actorForStage(stage: StageKey): ShipmentEvent['actorType'] {
  if (stage === 'created' || stage === 'documentation') return 'shipper';
  if (stage === 'in_transit' || stage === 'picked_up' || stage === 'arrived') return 'driver';
  if (stage === 'empty_returned' || stage === 'empty_awaiting') return 'transporter';
  return 'ops';
}

function locationForStage(stage: StageKey, origin: string, destination: string): string {
  const index = STAGE_KEYS.indexOf(stage);
  if (index <= STAGE_KEYS.indexOf('picked_up')) return origin;
  if (index >= STAGE_KEYS.indexOf('arrived')) return destination;
  return 'En route';
}

/** 0 at origin, 1 at destination — how far through the corridor a stage is. */
function stageProgress(stage: StageKey): number {
  const index = STAGE_KEYS.indexOf(stage);
  const pickedUp = STAGE_KEYS.indexOf('picked_up');
  const arrived = STAGE_KEYS.indexOf('arrived');
  if (index <= pickedUp) return 0;
  if (index >= arrived) return 1;
  return (index - pickedUp) / (arrived - pickedUp);
}

const interpolate = (from: number, to: number, t: number) => from + (to - from) * t;

function latForStage(stage: StageKey, route: (typeof MOCK_ROUTES)[number], rng: Rng): number {
  const t = stageProgress(stage);
  return interpolate(route.originLat, route.destinationLat, t) + rng.float(-0.08, 0.08);
}

function lngForStage(stage: StageKey, route: (typeof MOCK_ROUTES)[number], rng: Rng): number {
  const t = stageProgress(stage);
  return interpolate(route.originLng, route.destinationLng, t) + rng.float(-0.08, 0.08);
}

function containerStatusFor(stage: StageKey): ContainerStatus {
  switch (stage) {
    case 'empty_returned':
      return 'returned';
    case 'empty_awaiting':
      return 'awaiting_return';
    case 'delivered':
      return 'delivered';
    default:
      return 'in_transit';
  }
}

const REASON_CODES: Record<DelayOwner, string> = {
  shipper_documentation: 'DOC-INCOMPLETE',
  shipper_depotage: 'DEPOT-SLOT-MISSED',
  shipper_communication: 'NO-RETURN-INSTRUCTION',
  transporter: 'TRUCK-UNAVAILABLE',
  customs: 'CUSTOMS-INSPECTION',
  port_terminal: 'TERMINAL-CONGESTION',
  shipping_line: 'DEPOT-REFUSED-RETURN',
  force_majeure: 'ROAD-CLOSURE',
};

function reasonCodeFor(owner: DelayOwner): string {
  return REASON_CODES[owner] ?? 'UNSPECIFIED';
}

/** Exposed so tests can assert the generator covers every owner. */
export const ALL_DELAY_OWNERS = DELAY_OWNERS;
export { parseISO };
