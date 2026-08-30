import {
  CONTAINER_TYPE_LABELS,
  DELAY_CAUSE_LABELS,
  DELAY_CAUSE_PARTY,
  DELAY_PARTIES,
  DELAY_PARTY_LABELS,
  emptyCostPerKm,
  WAITING_LOCATION_LABELS,
  fleetSnapshot,
  inPeriod,
  type ContainerType,
  type DelayCause,
  type DelayParty,
  type TransporterDataset,
  type TripFact,
  type WaitingLocation,
} from '@/features/transporter-bi';
import type { SpotlightTransporter } from '@/features/shipper-bi/contracts';
import { previousPeriod, type Period } from '@/lib/bi/time';
import { buildRateTabs, type RateTab } from './rateSeries';

/**
 * Everything the transporter console shows, derived once.
 *
 * The panels below are presentational on purpose. Two cards on this page quote
 * "156 moves" and four quote an empty-return figure; if each computed its own
 * the page would eventually contradict itself in front of the person whose
 * fleet it describes. So the derivation happens here, once, from the same
 * `TripFact` spine the rest of the portal stands on, and a panel's props are
 * the answer rather than the ingredients.
 *
 * Where the design asks for something the fact table cannot answer directly —
 * a truck-day split into loaded / empty / waiting, a per-move cost waterfall —
 * the approximation and the constant behind it are stated at the point of use
 * rather than buried in a component.
 */

/* ---------------------------------------------------------------------------
 * Policy — the constants this page's money and time arithmetic stands on
 * ------------------------------------------------------------------------ */

/**
 * Standing cost of a tractor and driver going nowhere, USD per hour.
 *
 * Wages, depreciation and the finance cost keep running while a truck queues.
 * Applied to gate and loading-site waiting; the consignee end is billed
 * separately as detention below, so no hour is charged twice.
 */
export const WAITING_COST_PER_HOUR = 11;

/** Free time at the delivery end before the line's detention tariff starts. */
export const DETENTION_FREE_HOURS = 2;

/** Hourly equivalent of the line's daily detention tariff, USD. */
export const DETENTION_COST_PER_HOUR = 5;

/**
 * Working average road speed on the corridor, km/h.
 *
 * Only used to turn loaded and empty kilometres into a share of a truck-day
 * for the fleet-week split — never to state a duration on its own.
 */
export const AVG_ROAD_SPEED_KMH = 45;

/** Days a container may sit with us after delivery before the return is late. */
export const EMPTY_RETURN_FREE_DAYS = 3;

/* ---------------------------------------------------------------------------
 * Cargo grouping — the three things this fleet hauls
 * ------------------------------------------------------------------------ */

export type CargoGroup = 'container' | 'bulk' | 'special';

export const CARGO_GROUP_OF: Record<ContainerType, CargoGroup> = {
  dry_20: 'container',
  dry_40: 'container',
  hc_40: 'container',
  flatbed: 'bulk',
  reefer_40: 'special',
};

export const CARGO_GROUP_LABELS: Record<CargoGroup, string> = {
  container: 'Container',
  bulk: 'Bulk',
  special: 'Special',
};

export const CARGO_GROUP_DETAIL: Record<CargoGroup, string> = {
  container: "20' / 40' dry & high cube",
  bulk: 'Flatbed — commodities / steel',
  special: 'Reefer & oversize',
};

/** Ordinal teal ramp plus the brand amber — teal reports, amber asks. */
export const CARGO_GROUP_COLOR: Record<CargoGroup, string> = {
  container: 'var(--fl-teal-700)',
  bulk: 'var(--fl-teal-400)',
  special: 'var(--accent-bold)',
};

export const CARGO_GROUPS: CargoGroup[] = ['container', 'bulk', 'special'];

/* ---------------------------------------------------------------------------
 * Shapes
 * ------------------------------------------------------------------------ */

export interface Delta {
  /** Signed fraction, e.g. 0.04 for +4%. Undefined when there is no baseline. */
  pct?: number;
  /** Whether the movement is good news, given what the metric measures. */
  good: boolean;
}

export interface KpiSummary {
  utilization: number;
  utilizationDelta: Delta;
  activeTrucks: number;
  fleetSize: number;

  idleDays: number;
  idleDelta: Delta;

  onTime: number;
  onTimeDelta: Delta;
  onTimeCount: number;
  judgedCount: number;

  delayRate: number;
  delayDelta: Delta;
  hoursLost: number;
}

export type { RatePoint, RateTab } from './rateSeries';

export interface EmptyLegs {
  emptyRate: number;
  matchedShare: number;
  emptyShare: number;
  pendingShare: number;
  emptyKm: number;
  emptyCostUsd: number;
}

export interface MoveDay {
  label: string;
  completed: number;
  delayed: number;
}

export interface DelayOwnership {
  group: CargoGroup;
  delayedMoves: number;
  hoursLost: number;
  byParty: Array<{ party: DelayParty; label: string; hours: number; share: number }>;
  /**
   * What actually happened, split by the party that answers for it — the second
   * level the panel opens when a party is selected. Shares are of that party's
   * own hours, not of the group total, so a party's causes always sum to 100%.
   */
  causesByParty: Record<DelayParty, Array<{ cause: DelayCause; label: string; hours: number; share: number }>>;
}

export interface HaulDay {
  label: string;
  container: number;
  bulk: number;
  special: number;
}

export interface HaulGroup {
  group: CargoGroup;
  moves: number;
  revenue: number;
  revenueShare: number;
  moveShare: number;
}

export interface Funnel {
  offers: number;
  accepted: number;
  /** Completed moves — the on-time share rides along as this stage's note. */
  delivered: number;
  invoiced: number;
  paid: number;
  acceptanceRate: number;
  onTimeRate: number;
  awaitingDocs: number;
  declined: number;
  declinedValue: number;
  unpaid: number;
  unpaidValue: number;
  overdueValue: number;
}

export interface MoneyLeg {
  key: string;
  label: string;
  value: number;
  kind: 'gain' | 'cost' | 'total';
}

export interface PayingJob {
  routeId: string;
  label: string;
  group: CargoGroup;
  distanceKm: number;
  ratePerMove: number;
  moves: number;
  /** The contracted network rate for the same distance. */
  networkRate: number;
}

export interface FleetWeek {
  truckDays: number;
  segments: Array<{ key: string; label: string; days: number; color: string; foreground?: string }>;
  earningDays: number;
  notEarningDays: number;
  earningShare: number;
  perDayValue: number;
  stillest: Array<{ plate: string; days: number; reason: string }>;
}

export interface WaitingProfile {
  perMove: number;
  drivingPerMove: number;
  cycle: number;
  waitingShare: number;
  byLocation: Array<{
    location: WaitingLocation;
    label: string;
    hours: number;
    network: number;
    delta: number;
  }>;
  worst?: { label: string; delta: number };
}

export interface BusyHeatmap {
  hours: number[];
  days: Array<{ label: string; cells: number[] }>;
  peak: { hourLabel: string; moves: number };
  max: number;
}

export interface EarningsPerMove {
  perMove: number;
  target: number;
  attainment: number;
  total: number;
  totalDelta: Delta;
  emptyCost: number;
  emptyCostDelta: Delta;
  spark: Array<{ label: string; value: number }>;
}

export interface AvailableLoad {
  id: string;
  customerName: string;
  origin: string;
  destination: string;
  cargo: string;
  containerLabel: string;
  group: CargoGroup;
  distanceKm: number;
  deadheadKm: number;
  revenue: number;
  matchScore: number;
  freeAt: string;
  matched: boolean;
}


export interface DetentionRow {
  id: string;
  containerNo: string;
  origin: string;
  destination: string;
  primaryDate: string;
  secondaryDate: string;
  status: 'overdue' | 'due_today' | 'due_soon' | 'on_track';
  statusLabel: string;
  responsible?: { initials: string; label: string; tone: 'calm' | 'attention' | 'info' };
  rootCause: string;
  flow: 'import' | 'export';
}

export interface PaymentsSummary {
  paid: number;
  pending: number;
  overdue: number;
  nextSettlement?: { date: string; amount: number };
  aging: Array<{ key: string; label: string; amount: number; share: number; color: string }>;
}

export interface NetworkComparison {
  rows: Array<{
    key: string;
    label: string;
    valueLabel: string;
    networkLabel: string;
    value: number;
    network: number;
    ahead: boolean;
  }>;
  causes: Array<{ cause: DelayCause; label: string; hours: number; color: string }>;
  hoursLost: number;
  yourShare: number;
  insight: string;
}

export interface JobRow {
  id: string;
  ref: string;
  customerName: string;
  origin: string;
  destination: string;
  truckLabel: string;
  driverName: string;
  driverInitials: string;
  statusLabel: string;
  statusTone: 'calm' | 'attention' | 'critical' | 'info';
  cargoLabel: string;
  slot: string;
  slotSort: number;
}

export interface ConsoleModel {
  moves: number;
  revenue: number;
  alerts: { detentionRunning: number; emptyOverdue: number };
  kpis: KpiSummary;
  rate: RateTab[];
  emptyLegs: EmptyLegs;
  moveDays: MoveDay[];
  weakestDay?: { label: string; delayed: number; cause: string };
  delays: Record<CargoGroup, DelayOwnership>;
  haulDays: HaulDay[];
  haulGroups: HaulGroup[];
  funnel: Funnel;
  moneyLegs: MoneyLeg[];
  payingJobs: PayingJob[];
  fleetWeek: FleetWeek;
  waiting: WaitingProfile;
  heatmap: BusyHeatmap;
  earnings: EarningsPerMove;
  loads: AvailableLoad[];
  /**
   * Our own trucks, shaped for the shipper console's `FleetSpotlightCard`.
   *
   * That panel already exists and already does this job — three counters, the
   * vehicle carousel, the operator row — so the transporter console feeds it
   * rather than growing a second one. Read from this seat the "operator" is
   * the driver rather than a carrier, which is the only substitution needed.
   */
  spotlight: SpotlightTransporter[];
  detention: DetentionRow[];
  payments: PaymentsSummary;
  network: NetworkComparison;
  jobs: { ongoing: JobRow[]; scheduled: JobRow[] };
}

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function delta(current: number, previous: number | undefined, higherIsBetter: boolean): Delta {
  if (previous === undefined || previous === 0 || !Number.isFinite(previous)) {
    return { good: higherIsBetter };
  }
  const pct = (current - previous) / Math.abs(previous);
  return { pct, good: higherIsBetter ? pct >= 0 : pct <= 0 };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function onTimeShare(facts: TripFact[]): number | undefined {
  const judged = facts.filter((fact) => fact.onTime !== undefined);
  if (judged.length === 0) return undefined;
  return judged.filter((fact) => fact.onTime).length / judged.length;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '—';
}

function dayLabel(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function clockLabel(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** Inclusive list of `YYYY-MM-DD` days in the period, capped so a long window
 *  still renders as a readable strip rather than a barcode. */
function daysOf(period: Period, cap = 14): string[] {
  const days: string[] = [];
  const start = new Date(`${period.from}T00:00:00.000Z`);
  const end = new Date(`${period.to}T00:00:00.000Z`);
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days.length <= cap ? days : days.slice(days.length - cap);
}

/* ---------------------------------------------------------------------------
 * The derivation
 * ------------------------------------------------------------------------ */

export interface BuildConsoleModelInput {
  dataset: TransporterDataset;
  /** Facts after the dimension filters, before the period narrowing. */
  facts: TripFact[];
  period: Period;
  now: Date;
}

export function buildConsoleModel({
  dataset,
  facts,
  period,
  now,
}: BuildConsoleModelInput): ConsoleModel {
  const prior = previousPeriod(period);
  const current = inPeriod(facts, period);
  const previous = inPeriod(facts, prior);

  const completed = current.filter((fact) => fact.isCompleted);
  const previousCompleted = previous.filter((fact) => fact.isCompleted);
  const live = facts.filter((fact) => fact.isLive);

  const routeById = new Map(dataset.routes.map((route) => [route.id, route]));
  const vehicleById = new Map(dataset.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const driverById = new Map(dataset.drivers.map((driver) => [driver.id, driver]));
  const customerById = new Map(dataset.customers.map((customer) => [customer.id, customer]));

  // Trailing days with no completed work are dropped from every series: the
  // period runs to today, and a zero for a morning that has not finished yet
  // reads as a collapse rather than as "not measured".
  const days = (() => {
    const all = daysOf(period);
    const withWork = new Set(completed.map((fact) => fact.anchorDate));
    let end = all.length;
    while (end > 1 && !withWork.has(all[end - 1] as string)) end -= 1;
    return all.slice(0, end);
  })();
  const revenue = sum(completed.map((fact) => fact.totalRevenue));

  /* ── KPI strip ───────────────────────────────────────────────────────── */

  const fleet = fleetSnapshot(dataset, period);
  const previousFleet = fleetSnapshot(dataset, prior);

  const onTime = onTimeShare(completed) ?? 0;
  const previousOnTime = onTimeShare(previousCompleted);
  const judged = completed.filter((fact) => fact.onTime !== undefined);

  const delayedCount = completed.filter((fact) => fact.isDelayed).length;
  const delayRate = share(delayedCount, completed.length);
  const previousDelayRate = share(
    previousCompleted.filter((fact) => fact.isDelayed).length,
    previousCompleted.length,
  );
  const hoursLost = sum(completed.map((fact) => fact.delayMinutes)) / 60;

  const rollingNow = live.filter((fact) => fact.status !== 'scheduled').length;

  const kpis: KpiSummary = {
    utilization: fleet.utilization,
    utilizationDelta: delta(fleet.utilization, previousFleet.utilization, true),
    activeTrucks: rollingNow,
    fleetSize: dataset.vehicles.length,

    idleDays: fleet.idleDays,
    idleDelta: delta(fleet.idleDays, previousFleet.idleDays, false),

    onTime,
    onTimeDelta: delta(onTime, previousOnTime, true),
    onTimeCount: judged.filter((fact) => fact.onTime).length,
    judgedCount: judged.length,

    delayRate,
    delayDelta: delta(delayRate, previousDelayRate || undefined, false),
    hoursLost,
  };

  /* ── Your rate vs the market, per equipment type ──────────────────────── */

  /** The contracted corridor rate for a move — the yardstick for the gauge. */
  const networkRateOf = (fact: TripFact): number => {
    const route = routeById.get(fact.routeId);
    return route ? route.distanceKm * route.ratePerKm : fact.revenue;
  };

  const rate = buildRateTabs({
    labels: days.map(dayLabel),
    movesByType: Object.fromEntries(
      (Object.keys(CONTAINER_TYPE_LABELS) as ContainerType[]).map((type) => [
        type,
        completed.filter((fact) => fact.containerType === type).length,
      ]),
    ),
  });

  /* ── Empty legs ──────────────────────────────────────────────────────── */

  const matchedMoves = completed.filter((fact) => fact.backhaulStatus === 'matched').length;
  const emptyMoves = completed.filter((fact) => fact.backhaulStatus === 'empty').length;
  const pendingMoves = completed.length - matchedMoves - emptyMoves;

  const emptyLegs: EmptyLegs = {
    emptyRate: share(emptyMoves, completed.length),
    matchedShare: share(matchedMoves, completed.length),
    emptyShare: share(emptyMoves, completed.length),
    pendingShare: share(pendingMoves, completed.length),
    emptyKm: sum(completed.map((fact) => fact.emptyKm)),
    emptyCostUsd: sum(completed.map((fact) => fact.emptyCostUsd)),
  };

  /* ── Moves per day, completed against delayed ────────────────────────── */

  const moveDays: MoveDay[] = days.map((day) => {
    const onDay = completed.filter((fact) => fact.anchorDate === day);
    return {
      label: dayLabel(day),
      completed: onDay.length,
      delayed: onDay.filter((fact) => fact.isDelayed).length,
    };
  });

  const worstDay = [...moveDays].sort((a, b) => b.delayed - a.delayed)[0];
  const worstDayFacts = worstDay
    ? completed.filter((fact) => dayLabel(fact.anchorDate) === worstDay.label && fact.isDelayed)
    : [];
  const worstCauseCounts = new Map<DelayCause, number>();
  for (const fact of worstDayFacts) {
    if (fact.primaryCause) {
      worstCauseCounts.set(fact.primaryCause, (worstCauseCounts.get(fact.primaryCause) ?? 0) + 1);
    }
  }
  const worstCause = [...worstCauseCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const weakestDay =
    worstDay && worstDay.delayed > 0
      ? {
          label: worstDay.label,
          delayed: worstDay.delayed,
          cause: worstCause ? DELAY_CAUSE_LABELS[worstCause[0]].toLowerCase() : 'mixed causes',
        }
      : undefined;

  /* ── Delay ownership, per cargo group ────────────────────────────────── */

  const delays = Object.fromEntries(
    CARGO_GROUPS.map((group) => {
      const scoped = completed.filter(
        (fact) => CARGO_GROUP_OF[fact.containerType] === group && fact.isDelayed,
      );
      const byParty = new Map<DelayParty, number>();
      const byCause = new Map<DelayCause, number>();
      for (const fact of scoped) {
        for (const [party, minutes] of Object.entries(fact.delayByParty)) {
          byParty.set(
            party as DelayParty,
            (byParty.get(party as DelayParty) ?? 0) + (minutes ?? 0),
          );
        }
        for (const [cause, minutes] of Object.entries(fact.delayByCause)) {
          byCause.set(
            cause as DelayCause,
            (byCause.get(cause as DelayCause) ?? 0) + (minutes ?? 0),
          );
        }
      }
      const totalMinutes = sum([...byParty.values()]);

      // Every cause has exactly one party that answers for it, so the causes
      // partition cleanly onto the parties — no cause is counted twice and a
      // party's causes add back up to its own share of the hours.
      const causesByParty = Object.fromEntries(
        DELAY_PARTIES.map((party) => {
          const partyMinutes = byParty.get(party) ?? 0;
          const rows = [...byCause.entries()]
            .filter(([cause]) => DELAY_CAUSE_PARTY[cause] === party && (byCause.get(cause) ?? 0) > 0)
            .map(([cause, minutes]) => ({
              cause,
              label: DELAY_CAUSE_LABELS[cause],
              hours: minutes / 60,
              share: share(minutes, partyMinutes),
            }))
            .sort((a, b) => b.hours - a.hours);
          return [party, rows] as const;
        }),
      ) as DelayOwnership['causesByParty'];

      const ownership: DelayOwnership = {
        group,
        delayedMoves: scoped.length,
        hoursLost: totalMinutes / 60,
        byParty: [...byParty.entries()]
          .map(([party, minutes]) => ({
            party,
            label: DELAY_PARTY_LABELS[party],
            hours: minutes / 60,
            share: share(minutes, totalMinutes),
          }))
          .sort((a, b) => b.hours - a.hours),
        causesByParty,
      };
      return [group, ownership] as const;
    }),
  ) as Record<CargoGroup, DelayOwnership>;

  /* ── What you haul ───────────────────────────────────────────────────── */

  const haulDays: HaulDay[] = days.map((day) => {
    const onDay = completed.filter((fact) => fact.anchorDate === day);
    const count = (group: CargoGroup) =>
      onDay.filter((fact) => CARGO_GROUP_OF[fact.containerType] === group).length;
    return {
      label: dayLabel(day),
      container: count('container'),
      bulk: count('bulk'),
      special: count('special'),
    };
  });

  const haulGroups: HaulGroup[] = CARGO_GROUPS.map((group) => {
    const scoped = completed.filter((fact) => CARGO_GROUP_OF[fact.containerType] === group);
    const groupRevenue = sum(scoped.map((fact) => fact.totalRevenue));
    return {
      group,
      moves: scoped.length,
      revenue: groupRevenue,
      revenueShare: share(groupRevenue, revenue),
      moveShare: share(scoped.length, completed.length),
    };
  });

  /* ── Offer to payment ────────────────────────────────────────────────── */

  const periodOffers = dataset.offers.filter(
    (offer) => offer.offeredAt.slice(0, 10) >= period.from && offer.offeredAt.slice(0, 10) <= period.to,
  );
  const declinedOffers = periodOffers.filter((offer) => offer.outcome !== 'accepted');
  const invoicedFacts = completed.filter((fact) => fact.payment !== undefined);
  const paidFacts = invoicedFacts.filter((fact) => fact.payment?.status === 'paid');
  // The funnel's own losses stay inside the funnel's window, so every stage is
  // a subset of the one above it. The whole-book receivables position is a
  // stock and belongs to the payments panel, not here.
  const unpaidInPeriod = invoicedFacts.filter((fact) => (fact.payment?.outstanding ?? 0) > 0);
  const unpaidAll = facts.filter((fact) => (fact.payment?.outstanding ?? 0) > 0);
  const overdueAll = unpaidAll.filter((fact) => fact.payment?.status === 'overdue');

  const acceptedCount = periodOffers.filter((offer) => offer.outcome === 'accepted').length;

  const funnel: Funnel = {
    offers: periodOffers.length,
    accepted: acceptedCount,
    delivered: completed.length,
    invoiced: invoicedFacts.length,
    paid: paidFacts.length,
    acceptanceRate: share(acceptedCount, periodOffers.length),
    onTimeRate: onTime,
    awaitingDocs: completed.length - invoicedFacts.length,
    declined: declinedOffers.length,
    declinedValue: sum(declinedOffers.map((offer) => offer.revenueEst)),
    unpaid: unpaidInPeriod.length,
    unpaidValue: sum(unpaidInPeriod.map((fact) => fact.payment?.outstanding ?? 0)),
    overdueValue: sum(overdueAll.map((fact) => fact.payment?.outstanding ?? 0)),
  };

  /* ── Where each move's money goes ────────────────────────────────────── */

  const waitingHoursAt = (fact: TripFact, location: WaitingLocation) =>
    fact.waitingByLocation[location] ?? 0;

  const gross = mean(completed.map((fact) => fact.revenue));
  const surcharges = mean(completed.map((fact) => fact.backhaulRevenue));
  const detentionCost = mean(
    completed.map(
      (fact) =>
        Math.max(0, waitingHoursAt(fact, 'unloading_site') - DETENTION_FREE_HOURS) *
        DETENTION_COST_PER_HOUR,
    ),
  );
  const emptyCostPerMove = mean(completed.map((fact) => fact.emptyKm * emptyCostPerKm()));
  const waitingCost = mean(
    completed.map(
      (fact) =>
        (waitingHoursAt(fact, 'port') +
          waitingHoursAt(fact, 'border') +
          waitingHoursAt(fact, 'loading_site')) *
        WAITING_COST_PER_HOUR,
    ),
  );
  const net = gross + surcharges - detentionCost - emptyCostPerMove - waitingCost;

  const moneyLegs: MoneyLeg[] = [
    { key: 'gross', label: 'Gross tariff', value: gross, kind: 'gain' },
    { key: 'surcharges', label: 'Backhaul', value: surcharges, kind: 'gain' },
    { key: 'detention', label: 'Detention', value: -detentionCost, kind: 'cost' },
    { key: 'empty', label: 'Empty km', value: -emptyCostPerMove, kind: 'cost' },
    { key: 'waiting', label: 'Waiting', value: -waitingCost, kind: 'cost' },
    { key: 'net', label: 'Net per move', value: net, kind: 'total' },
  ];

  /* ── Which jobs actually pay ─────────────────────────────────────────── */

  const payingJobs: PayingJob[] = dataset.routes
    .map((route) => {
      const scoped = completed.filter((fact) => fact.routeId === route.id);
      if (scoped.length === 0) return undefined;
      const dominant = CARGO_GROUPS.map((group) => ({
        group,
        count: scoped.filter((fact) => CARGO_GROUP_OF[fact.containerType] === group).length,
      })).sort((a, b) => b.count - a.count)[0];
      return {
        routeId: route.id,
        label: route.name,
        group: dominant?.group ?? 'container',
        distanceKm: route.distanceKm,
        // Outbound tariff only — `networkRate` prices the outbound leg, and a
        // bubble that quietly included matched backhaul revenue would sit
        // above the line for reasons the line does not measure.
        ratePerMove: mean(scoped.map((fact) => fact.revenue)),
        moves: scoped.length,
        networkRate: route.distanceKm * route.ratePerKm,
      } satisfies PayingJob;
    })
    .filter((job): job is PayingJob => job !== undefined);

  /* ── Where the fleet's week went ─────────────────────────────────────── */

  // The fleet log records active / idle / maintenance. An active day is split
  // into loaded, empty and waiting in proportion to the hours the period's
  // trips actually spent on each — an approximation, stated here rather than
  // implied by a chart.
  const loadedHours = sum(completed.map((fact) => fact.loadedKm)) / AVG_ROAD_SPEED_KMH;
  const emptyHours = sum(completed.map((fact) => fact.emptyKm)) / AVG_ROAD_SPEED_KMH;
  const waitHours = sum(completed.map((fact) => fact.waitingHours));
  const activeHours = loadedHours + emptyHours + waitHours || 1;

  const activeDays = fleet.activeDays;
  const loadedDays = Math.round((loadedHours / activeHours) * activeDays);
  const emptyDays = Math.round((emptyHours / activeHours) * activeDays);
  const waitDays = Math.max(0, activeDays - loadedDays - emptyDays);

  const stillest = fleet.byVehicle
    .filter((entry) => entry.idleDays > 0 || entry.maintenanceDays > 0)
    .sort(
      (a, b) => b.idleDays + b.maintenanceDays - (a.idleDays + a.maintenanceDays),
    )
    .slice(0, 5)
    .map((entry) => ({
      plate: vehicleById.get(entry.vehicleId)?.plateNumber ?? entry.vehicleId,
      days: entry.idleDays + entry.maintenanceDays,
      reason:
        entry.maintenanceDays > entry.idleDays ? 'in the workshop' : 'no job assigned',
    }));

  const fleetWeek: FleetWeek = {
    truckDays: fleet.vehicleDays,
    segments: [
      {
        key: 'loaded',
        label: 'Under load',
        days: loadedDays,
        color: 'var(--fl-teal-700)',
        foreground: 'var(--fl-neutral-0)',
      },
      {
        key: 'empty',
        label: 'Running empty',
        days: emptyDays,
        color: 'var(--accent-bold)',
        foreground: 'var(--accent-bold-foreground)',
      },
      {
        key: 'waiting',
        label: 'Waiting',
        days: waitDays,
        color: 'var(--fl-teal-400)',
        foreground: 'var(--fl-neutral-0)',
      },
      {
        key: 'idle',
        label: 'Idle, no job',
        days: fleet.idleDays,
        color: 'var(--border-strong)',
        foreground: 'var(--foreground)',
      },
      {
        key: 'workshop',
        label: 'Workshop',
        days: fleet.maintenanceDays,
        color: 'var(--surface-sunken)',
        foreground: 'var(--muted-foreground)',
      },
    ],
    earningDays: loadedDays,
    notEarningDays: fleet.vehicleDays - loadedDays,
    earningShare: share(loadedDays, fleet.vehicleDays),
    perDayValue: completed.length ? revenue / Math.max(1, activeDays) : 0,
    stillest,
  };

  /* ── Waiting time by location ────────────────────────────────────────── */

  const waitingLocations = Object.keys(WAITING_LOCATION_LABELS) as WaitingLocation[];
  const perMoveWaiting = mean(completed.map((fact) => fact.waitingHours));
  const drivingPerMove = completed.length
    ? mean(completed.map((fact) => fact.totalKm)) / AVG_ROAD_SPEED_KMH
    : 0;

  const byLocation = waitingLocations
    .map((location) => {
      const hours = mean(completed.map((fact) => waitingHoursAt(fact, location)));
      const network = dataset.network.avgWaitingHoursByLocation[location];
      return {
        location,
        label: WAITING_LOCATION_LABELS[location],
        hours,
        network,
        delta: hours - network,
      };
    })
    .filter((row) => row.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const worstWaiting = [...byLocation].sort((a, b) => b.delta - a.delta)[0];

  const waiting: WaitingProfile = {
    perMove: perMoveWaiting,
    drivingPerMove,
    cycle: perMoveWaiting + drivingPerMove,
    waitingShare: share(perMoveWaiting, perMoveWaiting + drivingPerMove),
    byLocation,
    worst:
      worstWaiting && worstWaiting.delta > 0
        ? { label: worstWaiting.label, delta: worstWaiting.delta }
        : undefined,
  };

  /* ── When your trucks are busy ───────────────────────────────────────── */

  const heatHours = Array.from({ length: 12 }, (_, index) => index + 6);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const grid = weekdayLabels.map(() => heatHours.map(() => 0));

  for (const fact of current) {
    const stamp = fact.departedAt ?? fact.startedAt ?? fact.acceptedAt;
    if (!stamp) continue;
    const date = new Date(stamp);
    const weekday = (date.getUTCDay() + 6) % 7;
    const hourIndex = heatHours.indexOf(date.getUTCHours());
    if (hourIndex < 0) continue;
    const row = grid[weekday];
    if (row) row[hourIndex] = (row[hourIndex] ?? 0) + 1;
  }

  const hourTotals = heatHours.map((_, index) =>
    sum(grid.map((row) => row[index] ?? 0)),
  );
  const peakIndex = hourTotals.indexOf(Math.max(...hourTotals));
  const heatmap: BusyHeatmap = {
    hours: heatHours,
    days: weekdayLabels.map((label, index) => ({ label, cells: grid[index] ?? [] })),
    peak: {
      hourLabel: `${String(heatHours[peakIndex] ?? 9).padStart(2, '0')}:00`,
      moves: hourTotals[peakIndex] ?? 0,
    },
    max: Math.max(1, ...grid.flat()),
  };

  /* ── Earnings per move ───────────────────────────────────────────────── */

  // Gross tariff against the contracted corridor rate for the very moves that
  // ran — so "88% of target" reads as "you priced 12% under the corridor for
  // this mix" rather than measuring against a number somebody typed. Both
  // sides are the outbound leg; matched backhaul revenue shows up in the
  // total-earnings box beside the gauge instead of quietly inflating the
  // numerator.
  const perMove = completed.length ? mean(completed.map((fact) => fact.revenue)) : 0;
  const target = completed.length ? mean(completed.map(networkRateOf)) : 0;
  const previousRevenue = sum(previousCompleted.map((fact) => fact.totalRevenue));
  const previousEmptyCost = sum(previousCompleted.map((fact) => fact.emptyCostUsd));

  const earnings: EarningsPerMove = {
    perMove,
    target,
    attainment: share(perMove, target),
    total: revenue,
    totalDelta: delta(revenue, previousRevenue || undefined, true),
    emptyCost: emptyLegs.emptyCostUsd,
    emptyCostDelta: delta(emptyLegs.emptyCostUsd, previousEmptyCost || undefined, false),
    spark: days.map((day) => {
      const onDay = completed.filter((fact) => fact.anchorDate === day);
      return {
        label: dayLabel(day),
        value: onDay.length ? Math.round(mean(onDay.map((fact) => fact.totalRevenue))) : 0,
      };
    }),
  };

  /* ── Available loads nearby ──────────────────────────────────────────── */

  const loads: AvailableLoad[] = dataset.opportunities
    .filter((opportunity) => opportunity.status === 'available')
    .slice(0, 8)
    .map((opportunity) => ({
      id: opportunity.id,
      customerName: opportunity.customerName,
      origin: opportunity.originName,
      destination: opportunity.destinationName,
      cargo: opportunity.cargo,
      containerLabel: CONTAINER_TYPE_LABELS[opportunity.containerType],
      group: CARGO_GROUP_OF[opportunity.containerType],
      distanceKm: opportunity.distanceKm,
      deadheadKm: opportunity.deadheadKm,
      revenue: opportunity.revenue,
      matchScore: opportunity.matchScore,
      freeAt: clockLabel(opportunity.pickupWindowStart),
      matched: opportunity.matchedTripId !== undefined,
    }));

  /* ── My fleet, shaped for the shipper console's spotlight panel ───────── */

  const stageLabel = (fact: TripFact): string => {
    if (fact.status === 'returning') {
      return fact.backhaulStatus === 'pending' ? 'Empty Awaiting' : 'Returning Loaded';
    }
    if (fact.status === 'enroute') return 'On-Route';
    if (fact.status === 'loading') return 'Loading Cargo';
    if (fact.status === 'at_destination') return 'Unloading';
    return 'Scheduled';
  };

  /**
   * The live move a vehicle is furthest along, when it has one.
   *
   * Rolling beats scheduled: a truck already on the road is a truck whose next
   * decision is closer than one that has not left the yard.
   */
  const liveByVehicle = new Map<string, TripFact>();
  const rollingRank = (fact: TripFact) =>
    (fact.status === 'scheduled' ? 0 : 1) * 10 + (fact.progressPct ?? 0);
  for (const fact of [...live].sort((a, b) => rollingRank(b) - rollingRank(a))) {
    if (!liveByVehicle.has(fact.vehicleId)) liveByVehicle.set(fact.vehicleId, fact);
  }

  const spotlight: SpotlightTransporter[] = dataset.vehicles
    .map((vehicle) => {
      const vehicleFacts = completed.filter((fact) => fact.vehicleId === vehicle.id);
      const liveFact = liveByVehicle.get(vehicle.id);
      const judgedForVehicle = vehicleFacts.filter((fact) => fact.onTime !== undefined);
      const driver = driverById.get(
        liveFact?.driverId ?? vehicleFacts[0]?.driverId ?? '',
      );

      return {
        transporterId: vehicle.id,
        // From this seat the operator behind a truck is its driver, not a
        // carrier — everything else the panel needs maps across unchanged.
        name: driver?.name ?? vehicle.model,
        fleetCode: initialsOf(driver?.name ?? vehicle.plateNumber),
        totalFleet: 1,
        deliveries: vehicleFacts.length,
        onTimeRate: share(
          judgedForVehicle.filter((fact) => fact.onTime).length,
          judgedForVehicle.length,
        ),
        distanceKm: sum(vehicleFacts.map((fact) => fact.totalKm)),
        activeVehiclePlate: vehicle.plateNumber,
        activeShipmentStage: liveFact ? stageLabel(liveFact) : 'Idle at depot',
        driverName: driver?.name ?? 'Unassigned',
        driverPhone: driver?.phone ?? '',
      } satisfies SpotlightTransporter;
    })
    // Trucks actually rolling first, then scheduled, then the busiest — the
    // spotlight should open on something that is happening right now.
    .sort((a, b) => {
      const rank = (id: string) => {
        const fact = liveByVehicle.get(id);
        if (!fact) return 0;
        return fact.status === 'scheduled' ? 1 : 2;
      };
      return rank(b.transporterId) - rank(a.transporterId) || b.deliveries - a.deliveries;
    });

  /* ── Detention & empty return ────────────────────────────────────────── */

  // The clock we own: a container we have delivered but not yet handed back.
  // Import legs are ours from the moment the box leaves the terminal; export
  // legs are the matched return loads running back to the port.
  const detentionSource = live.filter(
    (fact) =>
      CARGO_GROUP_OF[fact.containerType] === 'container' &&
      (fact.status === 'at_destination' || fact.status === 'returning' || fact.status === 'enroute'),
  );

  const detention: DetentionRow[] = detentionSource
    .map((fact) => {
      const route = routeById.get(fact.routeId);
      const anchor = new Date(fact.etaAt ?? fact.plannedDeliveryAt);
      const dueAt = new Date(anchor.getTime() + EMPTY_RETURN_FREE_DAYS * DAY_MS);
      const hoursLeft = (dueAt.getTime() - now.getTime()) / 3_600_000;

      const status: DetentionRow['status'] =
        hoursLeft < 0
          ? 'overdue'
          : hoursLeft < 24
            ? 'due_today'
            : hoursLeft < 48
              ? 'due_soon'
              : 'on_track';

      const statusLabel =
        status === 'overdue'
          ? `${Math.max(1, Math.round(-hoursLeft / 24))}d overdue`
          : status === 'due_today'
            ? `${Math.max(1, Math.round(hoursLeft))}h left`
            : status === 'due_soon'
              ? 'Due in 1d'
              : `Due in ${Math.round(hoursLeft / 24)}d`;

      const ownsIt = fact.backhaulStatus === 'pending' && fact.status !== 'enroute';
      const flow: DetentionRow['flow'] = fact.backhaulStatus === 'matched' ? 'export' : 'import';

      return {
        id: fact.tripId,
        containerNo: fact.ref,
        origin: route?.originName ?? '—',
        destination: route?.destinationName ?? '—',
        primaryDate:
          fact.status === 'enroute' ? 'Free time ends' : `Delivered ${dayLabel(fact.anchorDate)}`,
        secondaryDate: `due ${dayLabel(dueAt.toISOString())}`,
        status,
        statusLabel,
        responsible: ownsIt
          ? { initials: dataset.transporter.fleetCode.slice(0, 2), label: 'You', tone: 'calm' as const }
          : fact.status === 'at_destination'
            ? { initials: 'CN', label: 'Consignee', tone: 'attention' as const }
            : undefined,
        rootCause:
          fact.backhaulStatus === 'matched'
            ? 'Return load matched'
            : fact.status === 'at_destination'
              ? 'Unloading queue'
              : fact.status === 'returning'
                ? 'Running back empty'
                : 'On track — in transit',
        flow,
      } satisfies DetentionRow;
    })
    .sort((a, b) => {
      const rank: Record<DetentionRow['status'], number> = {
        overdue: 0,
        due_today: 1,
        due_soon: 2,
        on_track: 3,
      };
      return rank[a.status] - rank[b.status];
    });

  /* ── Payments ────────────────────────────────────────────────────────── */

  const paidTotal = sum(
    facts
      .filter((fact) => fact.payment?.status === 'paid')
      .map((fact) => fact.payment?.amount ?? 0),
  );
  const pendingTotal = sum(
    unpaidAll
      .filter((fact) => fact.payment?.status === 'pending')
      .map((fact) => fact.payment?.outstanding ?? 0),
  );
  const overdueTotal = sum(overdueAll.map((fact) => fact.payment?.outstanding ?? 0));

  const agingDefs: Array<{ key: string; label: string; color: string; match: (days: number) => boolean }> = [
    { key: 'b0_15', label: '0–15 d', color: 'var(--fl-teal-700)', match: (d) => d <= 15 },
    { key: 'b16_30', label: '16–30 d', color: 'var(--fl-teal-400)', match: (d) => d > 15 && d <= 30 },
    { key: 'b31_60', label: '31–60 d', color: 'var(--accent-bold)', match: (d) => d > 30 && d <= 60 },
    { key: 'b60_plus', label: '60 d +', color: 'var(--fl-orange-700)', match: (d) => d > 60 },
  ];

  const agingAmounts = agingDefs.map((def) => ({
    ...def,
    amount: sum(
      unpaidAll
        .filter((fact) => def.match(Math.max(0, fact.payment?.agingDays ?? 0)))
        .map((fact) => fact.payment?.outstanding ?? 0),
    ),
  }));
  const agingPeak = Math.max(1, ...agingAmounts.map((row) => row.amount));

  const nextSettlement = (() => {
    const upcoming = new Map<string, number>();
    for (const fact of unpaidAll) {
      const payment = fact.payment;
      if (!payment) continue;
      upcoming.set(
        payment.expectedSettlementAt,
        (upcoming.get(payment.expectedSettlementAt) ?? 0) + payment.outstanding,
      );
    }
    const sorted = [...upcoming.entries()]
      .filter(([date]) => date >= dataset.generatedAt.slice(0, 10))
      .sort(([a], [b]) => a.localeCompare(b));
    return sorted[0] ? { date: sorted[0][0], amount: sorted[0][1] } : undefined;
  })();

  const payments: PaymentsSummary = {
    paid: paidTotal,
    pending: pendingTotal,
    overdue: overdueTotal,
    nextSettlement,
    aging: agingAmounts.map((row) => ({
      key: row.key,
      label: row.label,
      amount: row.amount,
      share: row.amount / agingPeak,
      color: row.color,
    })),
  };

  /* ── Performance vs network ──────────────────────────────────────────── */

  const benchmark = dataset.network;
  const acceptanceRate = funnel.acceptanceRate;
  const turnaround = mean(
    completed.map(
      (fact) => waitingHoursAt(fact, 'unloading_site') + waitingHoursAt(fact, 'port'),
    ),
  );

  const causeTotals = new Map<DelayCause, number>();
  for (const fact of completed) {
    for (const [cause, minutes] of Object.entries(fact.delayByCause)) {
      causeTotals.set(cause as DelayCause, (causeTotals.get(cause as DelayCause) ?? 0) + (minutes ?? 0));
    }
  }
  const causeRamp = ['var(--accent-bold)', 'var(--fl-teal-700)', 'var(--fl-teal-400)', 'var(--border-strong)'];
  const causes = [...causeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cause, minutes], index) => ({
      cause,
      label: DELAY_CAUSE_LABELS[cause],
      hours: minutes / 60,
      color: causeRamp[index] ?? 'var(--border-strong)',
    }));

  const yourMinutes = sum(completed.map((fact) => fact.delayByParty.transporter ?? 0));

  const network: NetworkComparison = {
    rows: [
      {
        key: 'on_time',
        label: 'On-time rate',
        value: onTime,
        network: benchmark.onTimeRate,
        valueLabel: `${(onTime * 100).toFixed(0)}%`,
        networkLabel: `${(benchmark.onTimeRate * 100).toFixed(0)}%`,
        ahead: onTime >= benchmark.onTimeRate,
      },
      {
        key: 'acceptance',
        label: 'Acceptance rate',
        value: acceptanceRate,
        network: benchmark.acceptanceRate,
        valueLabel: `${(acceptanceRate * 100).toFixed(0)}%`,
        networkLabel: `${(benchmark.acceptanceRate * 100).toFixed(0)}%`,
        ahead: acceptanceRate >= benchmark.acceptanceRate,
      },
      {
        key: 'empty_return',
        label: 'Empty return rate',
        value: emptyLegs.emptyRate,
        network: benchmark.emptyReturnRate,
        valueLabel: `${(emptyLegs.emptyRate * 100).toFixed(0)}%`,
        networkLabel: `${(benchmark.emptyReturnRate * 100).toFixed(0)}%`,
        // Lower is better here — the row is ahead when it sits under the tick.
        ahead: emptyLegs.emptyRate <= benchmark.emptyReturnRate,
      },
      {
        key: 'turnaround',
        label: 'Avg turnaround',
        // Normalised against the slower of the two so both bars stay on scale.
        value: 1 - Math.min(1, turnaround / (benchmark.avgTurnaroundHours * 1.6)),
        network: 1 - Math.min(1, benchmark.avgTurnaroundHours / (benchmark.avgTurnaroundHours * 1.6)),
        valueLabel: `${turnaround.toFixed(1)} h`,
        networkLabel: `${benchmark.avgTurnaroundHours.toFixed(1)} h`,
        ahead: turnaround <= benchmark.avgTurnaroundHours,
      },
    ],
    causes,
    hoursLost,
    yourShare: share(yourMinutes / 60, hoursLost),
    insight:
      acceptanceRate < benchmark.acceptanceRate
        ? `You deliver better than the network but decline one offer in ${Math.max(2, Math.round(1 / Math.max(0.01, 1 - acceptanceRate)))} — roughly ${Math.round(declinedOffers.length / Math.max(1, days.length / 7))} loads a week you never get offered again.`
        : `You accept more than the network and deliver on plan — the offers keep coming because of it.`,
  };

  /* ── Jobs in progress ────────────────────────────────────────────────── */

  const statusPresentation: Record<
    string,
    { label: string; tone: JobRow['statusTone'] }
  > = {
    scheduled: { label: 'Scheduled', tone: 'info' },
    loading: { label: 'Loading', tone: 'attention' },
    enroute: { label: 'In transit', tone: 'calm' },
    at_destination: { label: 'Unloading', tone: 'attention' },
    returning: { label: 'Returning', tone: 'calm' },
  };

  const toJobRow = (fact: TripFact): JobRow => {
    const route = routeById.get(fact.routeId);
    const driver = driverById.get(fact.driverId);
    const vehicle = vehicleById.get(fact.vehicleId);
    const slotIso = fact.etaAt ?? fact.plannedDeliveryAt;
    const overdueEmpty = fact.status === 'returning' && fact.backhaulStatus === 'pending';
    const presentation = statusPresentation[fact.status] ?? { label: fact.status, tone: 'calm' as const };

    return {
      id: fact.tripId,
      ref: fact.ref,
      customerName: customerById.get(fact.customerId)?.name ?? '—',
      origin: route?.originName ?? '—',
      destination: route?.destinationName ?? '—',
      truckLabel: vehicle?.plateNumber ?? fact.vehicleId,
      driverName: driver?.name ?? 'Unassigned',
      driverInitials: initialsOf(driver?.name ?? '—'),
      statusLabel: overdueEmpty ? 'Empty pending' : presentation.label,
      statusTone: overdueEmpty ? 'critical' : presentation.tone,
      cargoLabel: `${CARGO_GROUP_LABELS[CARGO_GROUP_OF[fact.containerType]]} · ${CONTAINER_TYPE_LABELS[fact.containerType]}`,
      slot: clockLabel(slotIso),
      slotSort: new Date(slotIso).getTime(),
    };
  };

  const ongoing = live
    .filter((fact) => fact.status !== 'scheduled')
    .sort((a, b) => new Date(a.etaAt ?? a.plannedDeliveryAt).getTime() - new Date(b.etaAt ?? b.plannedDeliveryAt).getTime())
    .map(toJobRow);
  const scheduled = live
    .filter((fact) => fact.status === 'scheduled')
    .sort((a, b) => new Date(a.plannedDeliveryAt).getTime() - new Date(b.plannedDeliveryAt).getTime())
    .map(toJobRow);

  /* ── Alerts in the page header ───────────────────────────────────────── */

  const alerts = {
    detentionRunning: detention.filter(
      (row) => row.status === 'overdue' || row.status === 'due_today',
    ).length,
    emptyOverdue: live.filter(
      (fact) => fact.status === 'returning' && fact.backhaulStatus === 'pending',
    ).length,
  };

  return {
    moves: completed.length,
    revenue,
    alerts,
    kpis,
    rate,
    emptyLegs,
    moveDays,
    weakestDay,
    delays,
    haulDays,
    haulGroups,
    funnel,
    moneyLegs,
    payingJobs,
    fleetWeek,
    waiting,
    heatmap,
    earnings,
    loads,
    spotlight,
    detention,
    payments,
    network,
    jobs: { ongoing, scheduled },
  };
}
