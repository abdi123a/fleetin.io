import {
  CARGO_TYPES,
  DELIVERY_OUTCOME_LABELS,
  DELIVERY_OUTCOMES,
  STAGE_KEYS,
  STAGE_LABELS,
  STAGE_ORDER,
  type CategorySlice,
  type OverviewSection,
  type StageKey,
} from '@/features/shipper-bi/contracts';
import { getTransporterProfile } from '@/features/shipper-bi/mocks/transporterProfiles';
import type { ShipmentFact } from '../derive';
import { mean, ratio, sum } from '../stats';
import { hoursBetween } from '../time';
import { returnHeadroomBands } from '../config';
import {
  bucketSeries,
  buildKpi,
  buildMeta,
  drillTo,
  drillToShipments,
  labelBucket,
  toTimeSeries,
  type BiContext,
} from './context';

/**
 * Section 1 — Control Tower Overview.
 *
 * Six headline numbers, each with the context that makes it actionable. The
 * scoping sheet asks for bare KPI cards; every one here also ships the
 * breakdown behind it, because "142 shipments" and "78% on time" are not
 * decisions until you can see where they are and which ones missed.
 */

const countOpen = (facts: ShipmentFact[]) => facts.filter((fact) => fact.isOpen).length;

const onTimeRate = (facts: ShipmentFact[]) => {
  const delivered = facts.filter((fact) => fact.deliveryOutcome);
  const onTime = delivered.filter((fact) => fact.deliveryOutcome === 'on_time');
  return ratio(onTime.length, delivered.length);
};

const pendingReturns = (facts: ShipmentFact[]) =>
  facts.filter((fact) => fact.isDelivered && !fact.returnedAt).length;

export function aggregateOverview(context: BiContext): OverviewSection {
  const { facts } = context;

  const openFacts = facts.filter((fact) => fact.isOpen);
  const deliveredFacts = facts.filter((fact) => fact.deliveryOutcome);
  const awaitingReturn = facts.filter((fact) => fact.isDelivered && !fact.returnedAt);

  return {
    meta: buildMeta(context),

    kpis: {
      totalShipments: buildKpi(context, {
        key: 'totalShipments',
        label: 'Total Shipments',
        unit: 'count',
        polarity: 'neutral',
        compute: (subset) => subset.length,
        caption: 'Volume handled in selected period',
        drillDown: drillTo('All shipments', {}),
      }),

      activeShipments: buildKpi(context, {
        key: 'activeShipments',
        label: 'Active Shipments',
        unit: 'count',
        polarity: 'neutral',
        compute: countOpen,
        caption: 'Shipments currently in progress',
        drillDown: drillToShipments('Active shipments', openFacts),
      }),

      emptyReturnPending: buildKpi(context, {
        key: 'emptyReturnPending',
        label: 'Empty Return Pending',
        unit: 'count',
        polarity: 'lower_is_better',
        compute: pendingReturns,
        caption: 'Containers waiting for empty return',
        drillDown: drillToShipments('Containers awaiting return', awaitingReturn),
      }),

      onTimeRate: buildKpi(context, {
        key: 'onTimeRate',
        label: 'On-Time Delivery Rate',
        unit: 'percent',
        polarity: 'higher_is_better',
        // A rate is not additive: each bucket has to be recomputed from its own
        // shipments rather than summed, or the sparkline contradicts the number
        // above it.
        compute: onTimeRate,
        bucket: onTimeRate,
        caption: 'Delivered on promised delivery date',
        drillDown: drillToShipments(
          'Late shipments',
          deliveredFacts.filter((fact) => fact.deliveryOutcome === 'late'),
        ),
      }),

      totalCost: buildKpi(context, {
        key: 'totalCost',
        label: 'Total Logistics Cost',
        unit: 'currency',
        polarity: 'lower_is_better',
        compute: (subset) => sum(subset.map((fact) => fact.costTotal)),
        caption: 'Transportation freight & accessorial cost',
        drillDown: drillTo('Cost detail', {}),
      }),

      costPerShipment: buildKpi(context, {
        key: 'costPerShipment',
        label: 'Average Cost per Shipment',
        unit: 'currency',
        polarity: 'lower_is_better',
        compute: (subset) => mean(subset.map((fact) => fact.costTotal)),
        bucket: (subset) => mean(subset.map((fact) => fact.costTotal)),
        caption: 'Blended across cargo types',
        drillDown: drillTo('Cost detail', {}),
      }),
    },

    /* Where the open shipments actually are. */
    activeByStage: STAGE_KEYS.filter((stage) => stage !== 'empty_returned')
      .map((stage) => {
        const matching = openFacts.filter((fact) => fact.currentStage === stage);
        return {
          key: stage,
          label: STAGE_LABELS[stage],
          value: matching.length,
          drillDown: drillTo(`Active — ${STAGE_LABELS[stage]}`, { stages: [stage] }),
        } satisfies CategorySlice;
      })
      .filter((slice) => slice.value > 0),

    /* Early / on-time / late. These *mean* good and bad, so they wear the
     * status scale rather than series hues. */
    deliveryOutcomes: DELIVERY_OUTCOMES.map((outcome) => {
      const matching = deliveredFacts.filter((fact) => fact.deliveryOutcome === outcome);
      return {
        key: outcome,
        label: DELIVERY_OUTCOME_LABELS[outcome],
        value: matching.length,
        outcome,
        intent:
          outcome === 'on_time'
            ? ('good' as const)
            : outcome === 'late'
              ? ('critical' as const)
              : ('warning' as const),
        drillDown: drillToShipments(`${DELIVERY_OUTCOME_LABELS[outcome]} deliveries`, matching),
      };
    }),

    returnHeadroom: buildReturnHeadroom(context, awaitingReturn),

    costByCargoType: CARGO_TYPES.map((cargoType) => {
      const matching = facts.filter((fact) => fact.cargoType === cargoType);
      return {
        key: cargoType,
        label: cargoType,
        value: mean(matching.map((fact) => fact.costTotal)),
        drillDown: drillTo(`${cargoType} shipments`, { cargoTypes: [cargoType] }),
      } satisfies CategorySlice;
    })
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value),

    costByCargoTypeTrend: [
      toTimeSeries(context, 'blended', 'All cargo', facts, context.period, (subset) =>
        mean(subset.map((fact) => fact.costTotal)),
      ),
      ...CARGO_TYPES.map((cargoType) =>
        toTimeSeries(
          context,
          cargoType,
          cargoType,
          facts.filter((fact) => fact.cargoType === cargoType),
          context.period,
          (subset) => mean(subset.map((fact) => fact.costTotal)),
        ),
      ),
    ],

    spendByBucket: bucketSeries(context, facts, context.period, (subset) =>
      sum(subset.map((fact) => fact.costTotal)),
    ).map((point) => ({
      key: point.t,
      label: labelBucket(context, point.t),
      value: point.v,
    })),

    ...buildMapView(context, openFacts),

    latestShipment: buildLatestShipment(context, openFacts),
    spotlightTransporters: buildSpotlightTransporters(context, facts),
  };
}

/* ---------------------------------------------------------------------------
 * Map
 * ------------------------------------------------------------------------ */

/**
 * Open shipments as map markers, plus a frame that fits them.
 *
 * Position comes from the latest GPS ping where there is one, and falls back to
 * interpolating along the route by lifecycle progress. The fallback matters:
 * a shipment sitting in documentation has no truck reporting yet, and dropping
 * it off the map would understate what is in flight.
 */
function buildMapView(
  context: BiContext,
  openFacts: ShipmentFact[],
): Pick<OverviewSection, 'liveShipments' | 'mapBounds'> {
  const routeById = new Map(context.dataset.routes.map((route) => [route.id, route]));
  const vehicleById = new Map(context.dataset.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const shipmentById = new Map(context.dataset.shipments.map((s) => [s.id, s]));

  const latestPing = new Map<string, (typeof context.dataset.positions)[number]>();
  for (const position of context.dataset.positions) {
    const current = latestPing.get(position.shipmentId);
    if (!current || position.recordedAt > current.recordedAt) {
      latestPing.set(position.shipmentId, position);
    }
  }

  const liveShipments = openFacts.flatMap((fact) => {
    const route = routeById.get(fact.routeId);
    if (!route) return [];

    const ping = latestPing.get(fact.shipmentId);
    const progress = stageProgress(fact.currentStage);
    const lat = ping?.lat ?? route.originLat + (route.destinationLat - route.originLat) * progress;
    const lng = ping?.lng ?? route.originLng + (route.destinationLng - route.originLng) * progress;

    const shipment = shipmentById.get(fact.shipmentId);
    const vehicle = shipment?.vehicleId ? vehicleById.get(shipment.vehicleId) : undefined;

    return [
      {
        shipmentId: fact.shipmentId,
        reference: fact.reference,
        stage: fact.currentStage,
        transporterName: context.transporterName(fact.transporterId),
        routeName: route.name,
        vehiclePlate: vehicle?.plateNumber,
        lat,
        lng,
        headingDegrees: ping?.heading,
        lastPingAt: ping?.recordedAt ?? fact.currentStageAt,
        riskScore: fact.riskScore,
        etaAt: fact.predictedArrivalAt,
        plannedArrivalAt: fact.plannedDeliveryAt,
      },
    ];
  });

  // Fall back to the corridor's own extent when nothing is in flight, so the
  // map still shows the shipper's geography rather than the whole globe.
  const lats = liveShipments.length
    ? liveShipments.map((s) => s.lat)
    : context.dataset.routes.flatMap((r) => [r.originLat, r.destinationLat]);
  const lngs = liveShipments.length
    ? liveShipments.map((s) => s.lng)
    : context.dataset.routes.flatMap((r) => [r.originLng, r.destinationLng]);

  return {
    liveShipments,
    mapBounds: {
      minLat: Math.min(...lats),
      minLng: Math.min(...lngs),
      maxLat: Math.max(...lats),
      maxLng: Math.max(...lngs),
    },
  };
}

/** How far through the corridor a stage sits, 0 at origin and 1 at destination. */
function stageProgress(stage: StageKey): number {
  const index = STAGE_ORDER[stage];
  const pickedUp = STAGE_ORDER.picked_up;
  const arrived = STAGE_ORDER.arrived;
  if (index <= pickedUp) return 0;
  if (index >= arrived) return 1;
  return (index - pickedUp) / (arrived - pickedUp);
}

/* ---------------------------------------------------------------------------
 * Spotlights
 * ------------------------------------------------------------------------ */

function buildLatestShipment(
  context: BiContext,
  openFacts: ShipmentFact[],
): OverviewSection['latestShipment'] {
  const latest = [...openFacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return undefined;

  const route = context.dataset.routes.find((r) => r.id === latest.routeId);

  return {
    shipmentId: latest.shipmentId,
    reference: latest.reference,
    stage: latest.currentStage,
    stageLabel: STAGE_LABELS[latest.currentStage],
    destinationName: route?.destinationName ?? context.routeName(latest.routeId),
    destinationLat: route?.destinationLat ?? 0,
    destinationLng: route?.destinationLng ?? 0,
    // Progress across the whole lifecycle, not the road: the job is not done
    // until the empty container is back.
    progress: STAGE_ORDER[latest.currentStage] / (STAGE_KEYS.length - 1),
    etaAt: latest.predictedArrivalAt,
    isLate: (latest.etaDriftMinutes ?? 0) > 0,
  };
}

/** How many transporters the Fleet card slides through. */
const SPOTLIGHT_TRANSPORTER_COUNT = 3;

function buildSpotlightTransporters(
  context: BiContext,
  facts: ShipmentFact[],
): OverviewSection['spotlightTransporters'] {
  const byTransporter = new Map<string, ShipmentFact[]>();
  for (const fact of facts) {
    const existing = byTransporter.get(fact.transporterId);
    if (existing) existing.push(fact);
    else byTransporter.set(fact.transporterId, [fact]);
  }

  const ranked = [...byTransporter.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, SPOTLIGHT_TRANSPORTER_COUNT);

  const routeById = new Map(context.dataset.routes.map((route) => [route.id, route]));

  return ranked.map(([transporterId, theirFacts]) => {
    const transporter = context.dataset.transporters.find((t) => t.id === transporterId);

    const delivered = theirFacts.filter((fact) => fact.deliveryOutcome);
    const onTime = delivered.filter((fact) => fact.deliveryOutcome === 'on_time');

    const active = theirFacts.find((fact) => fact.isOpen);
    const activeShipment = active
      ? context.dataset.shipments.find((s) => s.id === active.shipmentId)
      : undefined;
    const vehicle = activeShipment?.vehicleId
      ? context.dataset.vehicles.find((v) => v.id === activeShipment.vehicleId)
      : undefined;

    const profile = getTransporterProfile(transporterId);

    return {
      transporterId,
      name: transporter?.name ?? transporterId,
      fleetCode: transporter?.fleetCode ?? '—',
      logoUrl: profile?.logoUrl,
      rating: profile?.rating ?? 4.0,
      totalFleet: context.dataset.vehicles.filter((v) => v.transporterId === transporterId).length,
      deliveries: delivered.length,
      onTimeRate: ratio(onTime.length, delivered.length),
      distanceKm: sum(
        theirFacts.map((fact) => routeById.get(fact.routeId)?.distanceKm ?? 0),
      ),
      activeVehiclePlate: vehicle?.plateNumber,
      activeShipmentStage: active ? STAGE_LABELS[active.currentStage] : undefined,
      // The driver roster is not modelled yet — the backend will join it here.
      driverName: DRIVER_ROSTER[transporterId] ?? 'Unassigned',
      driverPhone: '+253 77 45 21 08',
    };
  });
}

/**
 * Placeholder driver names, one per transporter.
 *
 * The entity model has no `Driver` yet — the scoping sheet never asks a
 * question that needs one, so adding a table for a name on a card would be
 * inventing schema. This is the seam where the join goes when drivers land.
 */
const DRIVER_ROSTER: Record<string, string> = {
  'TRP-01': 'Robert Reynolds',
  'TRP-02': 'Ahmed Farah',
  'TRP-03': 'Yonas Bekele',
  'TRP-04': 'Idris Waberi',
  'TRP-05': 'Samuel Tesfaye',
};


/**
 * Free-time headroom for containers still out.
 *
 * The pending count says how many; this says how urgent. Bucketed rather than
 * averaged because the average is meaningless — what matters is how many boxes
 * are already accruing charges and how many can still be saved today.
 */
function buildReturnHeadroom(context: BiContext, awaiting: ShipmentFact[]): CategorySlice[] {
  const asOf = context.dataset.asOf;

  const overdue: ShipmentFact[] = [];
  const dueSoon: ShipmentFact[] = [];
  const comfortable: ShipmentFact[] = [];

  for (const fact of awaiting) {
    if (!fact.freeTimeExpiresAt) {
      comfortable.push(fact);
      continue;
    }
    const hoursRemaining = hoursBetween(asOf, fact.freeTimeExpiresAt);
    if (hoursRemaining <= returnHeadroomBands().overdue) overdue.push(fact);
    else if (hoursRemaining <= returnHeadroomBands().dueSoon) dueSoon.push(fact);
    else comfortable.push(fact);
  }

  return [
    {
      key: 'overdue',
      label: 'Past free time',
      value: overdue.length,
      intent: 'critical',
      drillDown: drillToShipments('Containers past free time', overdue),
    },
    {
      key: 'due_soon',
      label: 'Due within 48h',
      value: dueSoon.length,
      intent: 'warning',
      drillDown: drillToShipments('Containers due within 48 hours', dueSoon),
    },
    {
      key: 'comfortable',
      label: 'In free time',
      value: comfortable.length,
      intent: 'good',
      drillDown: drillToShipments('Containers inside free time', comfortable),
    },
  ];
}
