import {
  CHARGE_TYPE_LABELS,
  PENALTY_CHARGE_TYPES,
  type BiDataset,
  type ChargeType,
} from '@/features/shipper-bi/contracts';
import type { ShipmentFact } from '@/lib/bi/derive';
import { bucketKey, bucketLabel, daysBetween, eachBucket, toDayString } from '@/lib/bi/time';

/**
 * Everything the shipper's Business Intelligence page states, derived once.
 *
 * The page this replaced had seven tabs and roughly thirty cards, and each tab
 * did its own arithmetic over the same fact table — which is how the same
 * account could report one detention figure on the Cost tab and a different one
 * on the Containers tab, and how "delay responsibility" came to be drawn three
 * times in three shapes. There is now exactly one aggregation, and every block
 * on the page reads a field off the object it returns.
 *
 * The scope rule is also one rule, not two: **a shipment belongs to the period
 * its job started in.** Its cost, its outcome and its container all stay with
 * it. That is what lets the page say "you moved 214 containers, 190 have landed,
 * 165 of them on time" and have the three numbers reconcile — a reader can add
 * them up in their head and never find a contradiction.
 */

/* ---------------------------------------------------------------------------
 * Period
 * ------------------------------------------------------------------------ */

export type InsightRange = '90d' | '6m' | '12m' | 'all';

export const INSIGHT_RANGES: Array<{ key: InsightRange; label: string; short: string }> = [
  { key: '90d', label: 'Last 3 months', short: '3M' },
  { key: '6m', label: 'Last 6 months', short: '6M' },
  { key: '12m', label: 'Last 12 months', short: '12M' },
  { key: 'all', label: 'All time', short: 'All' },
];

export interface InsightPeriod {
  from: string;
  to: string;
  label: string;
  /** The equal-length window immediately before, for the "vs last period" deltas. */
  priorFrom: string;
  priorTo: string;
}

const DAY = 86_400_000;

function resolveRange(range: InsightRange, asOf: Date, earliest: string | undefined): InsightPeriod {
  const to = asOf.getTime();
  const days = range === '90d' ? 90 : range === '6m' ? 183 : range === '12m' ? 365 : undefined;

  const from =
    days === undefined
      ? earliest
        ? new Date(earliest).getTime()
        : to - 365 * DAY
      : to - days * DAY;

  const span = Math.max(DAY, to - from);
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    label: INSIGHT_RANGES.find((entry) => entry.key === range)?.label ?? '',
    priorFrom: new Date(from - span).toISOString(),
    priorTo: new Date(from).toISOString(),
  };
}

/* ---------------------------------------------------------------------------
 * Shapes the page reads
 * ------------------------------------------------------------------------ */

/** A headline number with the same number from the window before it. */
export interface Figure {
  value: number;
  /**
   * Undefined when the prior window holds too little to compare against — an
   * invented delta is worse than no delta. A shipper who ran 9 containers six
   * months ago and 167 now does not need to be told that is "+1,755%".
   */
  delta?: number;
  /**
   * How to read `delta`. A **rate** changes by percentage *points*: on-time
   * falling from 88% to 67% is 21 points, not "−24%". Reporting a rate's
   * relative change is how a dashboard makes a small move sound alarming and a
   * large one sound trivial.
   */
  deltaKind?: 'percent' | 'points';
  /** Which direction is good news, so the arrow can be coloured honestly. */
  polarity: 'up_is_good' | 'down_is_good';
}

export interface TrendPoint {
  key: string;
  label: string;
  /** Jobs started in this bucket. */
  runs: number;
  /** Share of that bucket's landed jobs that landed on time, 0–1. Undefined
   *  when nothing landed — a gap in the line, not a zero. */
  onTimeRate?: number;
  spend: number;
  avoidable: number;
}

export interface RankedParty {
  id: string;
  name: string;
  runs: number;
  onTimeRate?: number;
  avgCost: number;
  /** Route rails only: door-to-door days. */
  avgDays?: number;
}

export interface ShareSlice {
  key: string;
  label: string;
  value: number;
  /** 0–1 of the whole. */
  share: number;
  /** Orange on this page means "this is costing you" — never decoration. */
  tone: 'good' | 'attention';
}

export interface ShipperInsight {
  period: InsightPeriod;
  /** No jobs in the window at all — every block renders its empty state. */
  isEmpty: boolean;

  /** A. The account in four numbers. */
  headline: {
    runs: Figure;
    spend: Figure;
    onTimeRate: Figure;
    doorToDoorDays: Figure;
  };
  /** The one sentence at the top. Generated, never typed. */
  verdict: string;

  /** B. Are we delivering on time? */
  onTime: {
    delivered: number;
    stillMoving: number;
    rate: number;
    target: number;
    outcomes: ShareSlice[];
    /** How late the late ones were, in days — the figure a rate hides. */
    medianLateDays: number;
    worstMonth?: { label: string; rate: number };
  };

  /** C. Where the money goes. */
  money: {
    total: number;
    freight: number;
    avoidable: number;
    avoidableShare: number;
    perContainer: number;
    breakdown: ShareSlice[];
    /** The single biggest avoidable line, named. */
    biggestLeak?: { label: string; value: number };
  };

  /** D. How fast do the boxes come back? */
  containers: {
    returned: number;
    withinFreeTime: number;
    pastFreeTime: number;
    stillOut: number;
    avgCycleDays: number;
    /** Days accrued past free time across the whole window. */
    daysLost: number;
    detentionDays: number;
    demurrageDays: number;
  };

  /** E. Who moves the cargo, and where it goes. */
  transporters: RankedParty[];
  routes: RankedParty[];

  /** Shared x-axis for every trend on the page. */
  trend: TrendPoint[];
}

/* ---------------------------------------------------------------------------
 * Derivation
 * ------------------------------------------------------------------------ */

const ON_TIME_TARGET = 0.9;
/** Ranked rails show six; past that a reader stops reading and starts scanning. */
const RANK_LIMIT = 6;
/**
 * The prior window needs at least this many runs before any delta is shown.
 *
 * Without it, an account reports four-digit percentages against a base of two
 * or three shipments — arithmetically true and completely meaningless. Below
 * the floor the tiles simply show no chip.
 */
const MIN_PRIOR_RUNS = 5;

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

/** A percentage change, or nothing when the base is too small to mean anything. */
function relativeDelta(current: number, prior: number, comparable: boolean): number | undefined {
  if (!comparable || prior === 0) return undefined;
  return (current - prior) / prior;
}

function landed(facts: ShipmentFact[]) {
  return facts.filter((fact) => fact.isDelivered && fact.deliveryOutcome);
}

function onTimeRateOf(facts: ShipmentFact[]): number | undefined {
  const done = landed(facts);
  if (done.length === 0) return undefined;
  const good = done.filter(
    (fact) => fact.deliveryOutcome === 'on_time' || fact.deliveryOutcome === 'early',
  ).length;
  return good / done.length;
}

/** Door to door: the job opening to the cargo landing. */
function doorToDoorDaysOf(facts: ShipmentFact[]): number[] {
  return facts
    .filter((fact) => fact.deliveredAt)
    .map((fact) => daysBetween(fact.createdAt, fact.deliveredAt as string))
    .filter((days) => Number.isFinite(days) && days >= 0);
}

export function buildShipperInsight({
  facts,
  dataset,
  range,
  asOf,
}: {
  facts: ShipmentFact[];
  dataset: BiDataset;
  range: InsightRange;
  asOf: Date;
}): ShipperInsight {
  const earliest = facts.reduce<string | undefined>(
    (oldest, fact) => (oldest === undefined || fact.createdAt < oldest ? fact.createdAt : oldest),
    undefined,
  );
  const period = resolveRange(range, asOf, earliest);

  const inWindow = (fact: ShipmentFact, from: string, to: string) =>
    fact.createdAt >= from && fact.createdAt <= to;

  const scoped = facts.filter((fact) => inWindow(fact, period.from, period.to));
  const prior = facts.filter((fact) => inWindow(fact, period.priorFrom, period.priorTo));

  /* ── A. Headline ──────────────────────────────────────────────────────── */

  const spend = total(scoped.map((fact) => fact.costTotal));
  const priorSpend = total(prior.map((fact) => fact.costTotal));
  const rate = onTimeRateOf(scoped);
  const priorRate = onTimeRateOf(prior);
  const days = mean(doorToDoorDaysOf(scoped));
  const priorDays = mean(doorToDoorDaysOf(prior));

  /*
   * One gate for every comparison on the page, so the tiles cannot disagree
   * about whether the window before this one is worth comparing to.
   *
   * Two conditions, and the second is the one that matters. A prior window that
   * *starts before the account did* is not a slow half-year — it is a half-year
   * the customer did not exist for, and dividing by it produced "+1,755%" on a
   * shipper whose first container shipped inside it. The comparison is only
   * offered when the account's own history covers the whole prior window.
   */
  const historyCoversPrior = earliest !== undefined && earliest <= period.priorFrom;
  const comparable = historyCoversPrior && prior.length >= MIN_PRIOR_RUNS;

  const headline: ShipperInsight['headline'] = {
    runs: {
      value: scoped.length,
      delta: relativeDelta(scoped.length, prior.length, comparable),
      deltaKind: 'percent',
      polarity: 'up_is_good',
    },
    spend: {
      value: spend,
      delta: relativeDelta(spend, priorSpend, comparable),
      deltaKind: 'percent',
      polarity: 'down_is_good',
    },
    onTimeRate: {
      value: rate ?? 0,
      // Points, not percent — see `Figure.deltaKind`.
      delta:
        comparable && rate !== undefined && priorRate !== undefined ? rate - priorRate : undefined,
      deltaKind: 'points',
      polarity: 'up_is_good',
    },
    doorToDoorDays: {
      value: days,
      delta: relativeDelta(days, priorDays, comparable),
      deltaKind: 'percent',
      polarity: 'down_is_good',
    },
  };

  /* ── B. On time ───────────────────────────────────────────────────────── */

  const done = landed(scoped);
  const byOutcome = (key: string) => done.filter((fact) => fact.deliveryOutcome === key).length;
  const outcomeShare = (count: number) => (done.length === 0 ? 0 : count / done.length);

  const outcomes: ShareSlice[] = [
    {
      key: 'on_time',
      label: 'On time',
      value: byOutcome('on_time'),
      share: outcomeShare(byOutcome('on_time')),
      tone: 'good',
    },
    {
      key: 'early',
      label: 'Early',
      value: byOutcome('early'),
      share: outcomeShare(byOutcome('early')),
      tone: 'good',
    },
    {
      key: 'late',
      label: 'Late',
      value: byOutcome('late'),
      share: outcomeShare(byOutcome('late')),
      tone: 'attention',
    },
  ];

  const lateDays = done
    .filter((fact) => fact.deliveryOutcome === 'late')
    .map((fact) => (fact.deliveryVarianceMinutes ?? 0) / (60 * 24))
    .filter((value) => value > 0);

  /* ── C. Money ─────────────────────────────────────────────────────────── */

  const byChargeType = (type: ChargeType) =>
    total(scoped.map((fact) => fact.costByType[type] ?? 0));

  const freight = byChargeType('base_freight');
  const avoidable = total(scoped.map((fact) => fact.accessorialCost));
  const moneyShare = (value: number) => (spend === 0 ? 0 : value / spend);

  const penaltySlices: ShareSlice[] = PENALTY_CHARGE_TYPES.map((type) => ({
    key: type,
    label: CHARGE_TYPE_LABELS[type],
    value: byChargeType(type),
    share: moneyShare(byChargeType(type)),
    tone: 'attention' as const,
  }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);

  const otherCharges = avoidable - total(penaltySlices.map((slice) => slice.value));

  const breakdown: ShareSlice[] = [
    {
      key: 'base_freight',
      label: 'Transport',
      value: freight,
      share: moneyShare(freight),
      tone: 'good' as const,
    },
    ...penaltySlices,
    ...(otherCharges > 0
      ? [
          {
            key: 'other',
            label: 'Other charges',
            value: otherCharges,
            share: moneyShare(otherCharges),
            tone: 'attention' as const,
          },
        ]
      : []),
  ].filter((slice) => slice.value > 0);

  /* ── D. Containers ────────────────────────────────────────────────────── */

  const withBox = scoped.filter((fact) => fact.containerId);
  const returned = withBox.filter((fact) => fact.returnedAt);
  const pastFreeTime = withBox.filter((fact) => fact.emptyReturnOverdueDays > 0);

  const containers: ShipperInsight['containers'] = {
    returned: returned.length,
    withinFreeTime: returned.filter((fact) => fact.emptyReturnOverdueDays === 0).length,
    pastFreeTime: pastFreeTime.length,
    stillOut: withBox.length - returned.length,
    avgCycleDays: mean(
      returned
        .map((fact) => fact.emptyReturnCycleDays)
        .filter((value): value is number => value !== undefined),
    ),
    daysLost: total(withBox.map((fact) => fact.emptyReturnOverdueDays)),
    detentionDays: total(withBox.map((fact) => fact.detentionDays)),
    demurrageDays: total(withBox.map((fact) => fact.demurrageDays)),
  };

  /* ── E. Transporters and routes ───────────────────────────────────────── */

  const rank = (
    keyOf: (fact: ShipmentFact) => string,
    nameOf: (id: string) => string,
    withDays: boolean,
  ): RankedParty[] => {
    const groups = new Map<string, ShipmentFact[]>();
    for (const fact of scoped) {
      const key = keyOf(fact);
      if (!key) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(fact);
      else groups.set(key, [fact]);
    }

    return [...groups.entries()]
      .map(([id, group]) => ({
        id,
        name: nameOf(id),
        runs: group.length,
        onTimeRate: onTimeRateOf(group),
        avgCost: mean(group.map((fact) => fact.costTotal)),
        avgDays: withDays ? mean(doorToDoorDaysOf(group)) : undefined,
      }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, RANK_LIMIT);
  };

  const transporterName = new Map(dataset.transporters.map((entry) => [entry.id, entry.name]));
  const routeName = new Map(
    dataset.routes.map((entry) => [entry.id, entry.name || `${entry.originName} → ${entry.destinationName}`]),
  );

  /* ── Trend, one x-axis for the whole page ─────────────────────────────── */

  const granularity = daysBetween(period.from, period.to) > 120 ? 'month' : 'week';
  const buckets = eachBucket({ from: period.from, to: period.to }, granularity);
  const grouped = new Map<string, ShipmentFact[]>();
  for (const fact of scoped) {
    const key = bucketKey(fact.createdAt, granularity);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(fact);
    else grouped.set(key, [fact]);
  }

  const trend: TrendPoint[] = buckets.map((key) => {
    const group = grouped.get(key) ?? [];
    return {
      key,
      label: bucketLabel(key, granularity),
      runs: group.length,
      onTimeRate: onTimeRateOf(group),
      spend: total(group.map((fact) => fact.costTotal)),
      avoidable: total(group.map((fact) => fact.accessorialCost)),
    };
  });

  const rated = trend.filter((point) => point.onTimeRate !== undefined && point.runs > 0);
  const worst = rated.reduce<TrendPoint | undefined>(
    (lowest, point) =>
      lowest === undefined || (point.onTimeRate as number) < (lowest.onTimeRate as number)
        ? point
        : lowest,
    undefined,
  );

  return {
    period,
    isEmpty: scoped.length === 0,
    headline,
    verdict: buildVerdict({
      runs: scoped.length,
      delivered: done.length,
      rate: rate ?? 0,
      avoidable,
      avoidableShare: moneyShare(avoidable),
      pastFreeTime: pastFreeTime.length,
      periodLabel: period.label.toLowerCase(),
    }),
    onTime: {
      delivered: done.length,
      stillMoving: scoped.filter((fact) => !fact.isDelivered).length,
      rate: rate ?? 0,
      target: ON_TIME_TARGET,
      outcomes,
      medianLateDays: median(lateDays),
      worstMonth:
        worst && rated.length > 1
          ? { label: worst.label, rate: worst.onTimeRate as number }
          : undefined,
    },
    money: {
      total: spend,
      freight,
      avoidable,
      avoidableShare: moneyShare(avoidable),
      perContainer: scoped.length === 0 ? 0 : spend / scoped.length,
      breakdown,
      // Every avoidable line, not just the four named penalty types — the
      // header used to say "mostly detention" while the ring beside it showed
      // handling and extras as three quarters of the bill.
      biggestLeak: (() => {
        const worst = [...breakdown]
          .filter((slice) => slice.tone === 'attention')
          .sort((a, b) => b.value - a.value)[0];
        return worst ? { label: worst.label, value: worst.value } : undefined;
      })(),
    },
    containers,
    transporters: rank(
      (fact) => fact.transporterId,
      (id) => transporterName.get(id) ?? id,
      false,
    ),
    routes: rank(
      (fact) => fact.routeId,
      (id) => routeName.get(id) ?? id,
      true,
    ),
    trend,
  };
}

/**
 * The sentence at the top of the page.
 *
 * Assembled from the same figures the blocks below it draw, so it can never
 * describe a different account than the one on screen. It names the one thing
 * worth acting on and stops — a paragraph here would be the wall of text this
 * page exists to get rid of.
 */
function buildVerdict({
  runs,
  delivered,
  rate,
  avoidable,
  avoidableShare,
  pastFreeTime,
  periodLabel,
}: {
  runs: number;
  delivered: number;
  rate: number;
  avoidable: number;
  avoidableShare: number;
  pastFreeTime: number;
  periodLabel: string;
}): string {
  if (runs === 0) return `Nothing moved in the ${periodLabel}.`;

  const pct = Math.round(rate * 100);
  const opening =
    delivered === 0
      ? `You started ${runs} container${runs === 1 ? '' : 's'} in the ${periodLabel}; none have landed yet.`
      : `You moved ${runs} container${runs === 1 ? '' : 's'} in the ${periodLabel} and ${pct}% of the ${delivered} that landed arrived on time.`;

  if (pastFreeTime > 0) {
    return `${opening} ${pastFreeTime} box${pastFreeTime === 1 ? '' : 'es'} went past free time, which is where most of the avoidable cost comes from.`;
  }
  if (avoidableShare >= 0.05) {
    return `${opening} ${Math.round(avoidableShare * 100)}% of the bill was waiting and penalty charges rather than transport.`;
  }
  if (avoidable === 0) {
    return `${opening} The whole bill was transport — no waiting or penalty charges at all.`;
  }
  return `${opening} Penalty charges stayed under 5% of the bill.`;
}

/** Shared by the empty states so "no data" reads the same everywhere. */
export function emptyPeriodLabel(period: InsightPeriod): string {
  return `${toDayString(period.from)} — ${toDayString(period.to)}`;
}
