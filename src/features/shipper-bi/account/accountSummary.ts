import {
  CONTAINER_STATUS_LABELS,
  DELIVERY_OUTCOME_LABELS,
  STAGE_LABELS,
  TERMINAL_STAGE,
  type BiDataset,
  type CargoType,
  type ChargeType,
  type ContainerType,
  type DelayOwner,
  type DeliveryOutcome,
  type StageKey,
} from '../contracts';
import { deriveFacts, type ShipmentFact } from '@/lib/bi/derive';
import {
  onTimeGraceMinutes,
  returnHeadroomBands,
  riskSeverityThresholds,
} from '@/lib/bi/config';
import { hoursBetween } from '@/lib/bi/time';
import { ratio, sum } from '@/lib/bi/stats';

/**
 * The shipper account, as one object.
 *
 * The detail page used to carry its own hardcoded headline figures while the
 * control tower below it aggregated the real dataset — so the masthead claimed
 * four active loads and $116.5k against a dashboard reporting thirty-two in
 * flight and 12.23M DJF. Three numbers, three answers, one account.
 *
 * Everything the page states about the account is derived here instead, from
 * the same fact table `aggregateOverview` runs on. The header, the exception
 * rail and the shipments table cannot disagree because there is only one
 * derivation, and when the BI endpoints move server-side this file moves with
 * them unchanged.
 *
 * Scope is deliberately *unfiltered*: the control tower answers "how did the
 * last 30 days go", the account answers "what is true about this customer right
 * now". Both windows are labelled at the point of display — an unlabelled
 * number is the thing that started the disagreement.
 */

/* ---------------------------------------------------------------------------
 * Exceptions
 * ------------------------------------------------------------------------ */

/** Where a reader is sent to act on an alert. Mirrors the page's tab keys. */
export type AccountAlertTarget = 'analytics' | 'shipments' | 'compliance';
export type ShipmentFilterKey = 'all' | 'open' | 'delivered' | 'overdue' | 'dueSoon' | 'closed';

export interface AccountAlert {
  id: string;
  severity: 'critical' | 'warning';
  /** The finding, with its number in it — read on its own it is still complete. */
  title: string;
  /** Why it matters, in the terms the reader is accountable for. */
  detail: string;
  actionLabel: string;
  target: AccountAlertTarget;
  filter?: ShipmentFilterKey;
}

/* ---------------------------------------------------------------------------
 * Summary
 * ------------------------------------------------------------------------ */

export interface ShipperAccountSummary {
  /** The instant every "now"-relative figure below was measured at. */
  asOf: string;
  /** Oldest shipment on record — the left edge of the window these totals cover. */
  since: string;

  /**
   * Not yet closed: a job stays open until the empty container is back, so the
   * two fields below partition it — cargo still moving, and cargo delivered
   * with the box still out. They are the same split the shipments table filters
   * by, deliberately: a header that counts differently from the list under it
   * is the bug this whole module exists to prevent.
   */
  openShipments: number;
  inProgress: number;
  awaitingReturn: number;
  /** Open shipments whose risk score has crossed the warning threshold. */
  atRisk: number;
  /** Open shipments whose latest ETA already breaks the promised date. */
  forecastLate: number;

  deliveredShipments: number;
  onTimeRate: number;
  onTimeTarget: number;
  lateDeliveries: number;

  /** Every charge line on record, and the avoidable part of it. */
  spendTotal: number;
  accessorialTotal: number;
  accessorialShare: number;

  containersOut: number;
  containersOverdue: number;
  containersDueSoon: number;
  /** Days already accrued past free time across every container still out. */
  overdueDays: number;

  totalShipments: number;
  alerts: AccountAlert[];
}

/* ---------------------------------------------------------------------------
 * Shipment rows
 * ------------------------------------------------------------------------ */

/** Lifecycle bucket a row is filtered by — three states, not eleven stages. */
export type ShipmentRowStatus = 'open' | 'delivered' | 'closed';

export interface ShipperShipmentRow {
  shipmentId: string;
  reference: string;
  routeName: string;
  origin: string;
  destination: string;
  transporter: string;
  cargoType: CargoType;

  stage: StageKey;
  stageLabel: string;
  status: ShipmentRowStatus;

  plannedDeliveryAt: string;
  /** Predicted arrival while open, actual arrival once delivered. */
  arrivalAt?: string;
  /**
   * Signed minutes against the promised date — forecast drift while the
   * shipment is open, realised variance once it has landed. One column, because
   * "will it miss" and "did it miss" are the same question at different times.
   */
  varianceMinutes?: number;
  outcome?: DeliveryOutcome;
  outcomeLabel?: string;

  riskScore: number;

  /** The truck carrying it. One vehicle per shipment; absent before dispatch. */
  vehicleId?: string;
  vehiclePlate?: string;

  containerNo?: string;
  containerType?: ContainerType;
  containerStatusLabel?: string;
  freeTimeExpiresAt?: string;
  /** Negative once free time has run out. Meaningless once the box is back. */
  freeTimeHoursRemaining?: number;
  /** Set once the empty is returned — free-time pressure stops mattering then. */
  returnedAt?: string;

  /** Days the container was, or still is, out past free time. */
  emptyReturnOverdueDays: number;
  /** The billable slice of that overrun — the box outside the terminal. */
  detentionDays: number;
  demurrageDays: number;
  /** Who owns the largest share of this shipment's delay minutes. */
  primaryDelayOwner?: DelayOwner;

  cost: number;
  accessorialCost: number;
  costByType: Record<ChargeType, number>;
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

export interface ShipperAccount {
  summary: ShipperAccountSummary;
  rows: ShipperShipmentRow[];
}

export function buildShipperAccount(dataset: BiDataset): ShipperAccount {
  const facts = deriveFacts(dataset);
  const rows = buildRows(dataset, facts);
  return { summary: buildSummary(dataset, facts), rows };
}

function buildSummary(dataset: BiDataset, facts: ShipmentFact[]): ShipperAccountSummary {
  const { asOf } = dataset;

  const open = facts.filter((fact) => fact.isOpen);
  const delivered = facts.filter((fact) => fact.isDelivered);

  const inProgress = open.filter((fact) => !fact.isDelivered).length;
  const awaitingReturn = open.length - inProgress;

  const atRisk = open.filter(
    (fact) => fact.riskScore >= riskSeverityThresholds().warning,
  ).length;

  const forecastLate = open.filter(
    (fact) => (fact.etaDriftMinutes ?? 0) > onTimeGraceMinutes(),
  ).length;

  const lateDeliveries = delivered.filter((fact) => fact.deliveryOutcome === 'late').length;
  const onTimeDeliveries = delivered.filter(
    (fact) => fact.deliveryOutcome === 'on_time' || fact.deliveryOutcome === 'early',
  ).length;

  const spendTotal = sum(facts.map((fact) => fact.costTotal));
  const accessorialTotal = sum(facts.map((fact) => fact.accessorialCost));

  // A container is "out" until it is returned; free time is measured against
  // that, not against delivery — the box keeps accruing after the cargo lands.
  const containersOut = facts.filter((fact) => fact.containerId && !fact.returnedAt);
  const headroomHours = (fact: ShipmentFact) =>
    fact.freeTimeExpiresAt === undefined ? undefined : hoursBetween(asOf, fact.freeTimeExpiresAt);

  const overdue = containersOut.filter((fact) => {
    const headroom = headroomHours(fact);
    return headroom !== undefined && headroom <= returnHeadroomBands().overdue;
  });
  const dueSoon = containersOut.filter((fact) => {
    const headroom = headroomHours(fact);
    return (
      headroom !== undefined &&
      headroom > returnHeadroomBands().overdue &&
      headroom <= returnHeadroomBands().dueSoon
    );
  });

  const since = facts.reduce(
    (earliest, fact) => (fact.createdAt < earliest ? fact.createdAt : earliest),
    asOf,
  );

  const summary: Omit<ShipperAccountSummary, 'alerts'> = {
    asOf,
    since,
    openShipments: open.length,
    inProgress,
    awaitingReturn,
    atRisk,
    forecastLate,
    deliveredShipments: delivered.length,
    onTimeRate: ratio(onTimeDeliveries, delivered.length),
    onTimeTarget: DEFAULT_ON_TIME_TARGET,
    lateDeliveries,
    spendTotal,
    accessorialTotal,
    accessorialShare: ratio(accessorialTotal, spendTotal),
    containersOut: containersOut.length,
    containersOverdue: overdue.length,
    containersDueSoon: dueSoon.length,
    overdueDays: Math.round(sum(overdue.map((fact) => fact.emptyReturnOverdueDays))),
    totalShipments: facts.length,
  };

  return {
    ...summary,
    alerts: buildAlerts(summary, {
      overdueCost: sum(
        overdue.map((fact) => fact.costByType.demurrage + fact.costByType.detention),
      ),
    }),
  };
}

/** The contractual on-time floor the gauge in the control tower is drawn against. */
const DEFAULT_ON_TIME_TARGET = 0.9;

/**
 * The account's exceptions, worst first.
 *
 * An alert earns its place by being *actionable today*: a container past free
 * time is money leaving the account every hour it stays out, a shipment
 * forecast late is a phone call that can still change the outcome. A metric
 * that is merely disappointing — an on-time rate under target — is reported in
 * the health strip, not here; promoting it to an alert would train the reader
 * to scroll past the rail.
 */
function buildAlerts(
  summary: Omit<ShipperAccountSummary, 'alerts'>,
  context: { overdueCost: number },
): AccountAlert[] {
  const alerts: AccountAlert[] = [];

  // Overdue empty return containers
  if (summary.containersOverdue > 0) {
    alerts.push({
      id: 'containers-overdue',
      severity: 'critical',
      title: `${summary.containersOverdue} container${summary.containersOverdue === 1 ? '' : 's'} past free time (empty return pending)`,
      detail:
        context.overdueCost > 0
          ? `${summary.overdueDays} chargeable days accrued so far across unreturned containers.`
          : `${summary.overdueDays} days past expiry across containers awaiting empty return.`,
      actionLabel: 'Review returns',
      target: 'shipments',
      filter: 'overdue',
    });
  }

  // Containers due back soon for empty return
  if (summary.containersDueSoon > 0) {
    alerts.push({
      id: 'containers-due-soon',
      severity: 'warning',
      title: `${summary.containersDueSoon} container${summary.containersDueSoon === 1 ? '' : 's'} due for empty return within 48 hours`,
      detail: 'Avoidable charges — schedule the empty container return before free time expires.',
      actionLabel: 'Review returns',
      target: 'shipments',
      filter: 'dueSoon',
    });
  }

  // General empty return pending alert if no urgent overdue/due-soon alerts exist but containers are awaiting return
  const remainingAwaiting =
    summary.awaitingReturn - (summary.containersOverdue + summary.containersDueSoon);
  if (remainingAwaiting > 0 && alerts.length === 0) {
    alerts.push({
      id: 'containers-pending-return',
      severity: 'warning',
      title: `${summary.awaitingReturn} container${summary.awaitingReturn === 1 ? '' : 's'} awaiting empty return`,
      detail: 'Cargo delivered; empty containers have not been returned to the yard yet.',
      actionLabel: 'Review returns',
      target: 'shipments',
      filter: 'delivered',
    });
  }

  return alerts;
}

function buildRows(dataset: BiDataset, facts: ShipmentFact[]): ShipperShipmentRow[] {
  const routeById = new Map(dataset.routes.map((route) => [route.id, route]));
  const transporterById = new Map(
    dataset.transporters.map((transporter) => [transporter.id, transporter]),
  );
  const containerById = new Map(dataset.containers.map((container) => [container.id, container]));
  const shipmentById = new Map(dataset.shipments.map((shipment) => [shipment.id, shipment]));
  const vehicleById = new Map(dataset.vehicles.map((vehicle) => [vehicle.id, vehicle]));

  return facts
    .map((fact): ShipperShipmentRow => {
      const route = routeById.get(fact.routeId);
      const container = fact.containerId ? containerById.get(fact.containerId) : undefined;
      const vehicleId = shipmentById.get(fact.shipmentId)?.vehicleId;

      return {
        shipmentId: fact.shipmentId,
        reference: fact.reference,
        routeName: route?.name ?? '—',
        origin: route?.originName ?? '—',
        destination: route?.destinationName ?? '—',
        transporter: transporterById.get(fact.transporterId)?.name ?? '—',
        cargoType: fact.cargoType,

        stage: fact.currentStage,
        stageLabel: STAGE_LABELS[fact.currentStage],
        status: rowStatus(fact),

        plannedDeliveryAt: fact.plannedDeliveryAt,
        arrivalAt: fact.deliveredAt ?? fact.predictedArrivalAt,
        varianceMinutes: fact.isDelivered ? fact.deliveryVarianceMinutes : fact.etaDriftMinutes,
        outcome: fact.deliveryOutcome,
        outcomeLabel: fact.deliveryOutcome
          ? DELIVERY_OUTCOME_LABELS[fact.deliveryOutcome]
          : undefined,

        riskScore: fact.riskScore,

        vehicleId,
        vehiclePlate: vehicleId ? vehicleById.get(vehicleId)?.plateNumber : undefined,

        containerNo: container?.containerNo,
        containerType: fact.containerType,
        containerStatusLabel: container ? CONTAINER_STATUS_LABELS[container.status] : undefined,
        freeTimeExpiresAt: fact.freeTimeExpiresAt,
        freeTimeHoursRemaining: fact.freeTimeExpiresAt
          ? hoursBetween(dataset.asOf, fact.freeTimeExpiresAt)
          : undefined,
        returnedAt: fact.returnedAt,

        emptyReturnOverdueDays: fact.emptyReturnOverdueDays,
        detentionDays: fact.detentionDays,
        demurrageDays: fact.demurrageDays,
        primaryDelayOwner: fact.primaryDelayOwner,

        cost: fact.costTotal,
        accessorialCost: fact.accessorialCost,
        costByType: fact.costByType,
      };
    })
    /**
     * Open work first, and within it the most urgent first.
     *
     * Ordering everything by promised date puts the load due furthest out at
     * the top of the list an operator is meant to work down — exactly backwards.
     * Open rows lead with the risk score, which already blends ETA drift, stage
     * dwell and free-time headroom, and fall back to the nearest promise.
     * Settled rows read as history, so those run newest first.
     */
    .sort((a, b) => {
      if (a.status !== b.status) return statusRank(a.status) - statusRank(b.status);

      if (a.status === 'open') {
        if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;
        return a.plannedDeliveryAt.localeCompare(b.plannedDeliveryAt);
      }

      return b.plannedDeliveryAt.localeCompare(a.plannedDeliveryAt);
    });
}

function rowStatus(fact: ShipmentFact): ShipmentRowStatus {
  if (fact.currentStage === TERMINAL_STAGE) return 'closed';
  return fact.isDelivered ? 'delivered' : 'open';
}

function statusRank(status: ShipmentRowStatus): number {
  return status === 'open' ? 0 : status === 'delivered' ? 1 : 2;
}
