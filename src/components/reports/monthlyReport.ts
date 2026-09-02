import { format } from 'date-fns';
import { detentionRateCurrency, detentionRatePerContainerDay } from '@/lib/bi/config';
import {
  RESPONSIBLE_PARTY_LABELS,
  type ResponsibleParty,
  DELAY_REASON_LABELS,
  type DelayReason,
} from './delayVocabulary';
import type { MissionException, MissionReport } from './missionReport';
import { DAY, formatDuration } from './reportFormat';

/**
 * The monthly performance report for one shipper.
 *
 * An aggregation of the very mission reports the shipper can open one by one —
 * not a second calculation over the same data. That is the whole point: a
 * monthly average that disagrees with the missions behind it is worse than no
 * average, and the only way to guarantee agreement is to sum the same objects.
 *
 * Section order follows the specification's executive structure:
 * Executive KPIs → Operational Performance → Container Performance →
 * Detention → Trends & Exceptions.
 *
 * A month with no work reports zeros, never invented history.
 */

export interface MonthlyMissionKpis {
  total: number;
  completed: number;
  inProgress: number;
  cancelled: number;
  completionPct: number;
  onTime: number;
  onTimePct: number;
  avgMissionMs: number | null;
  avgTransitMs: number | null;
  avgWaitingMs: number | null;
}

export interface MonthlyContainerKpis {
  total: number;
  delivered: number;
  emptyReady: number;
  returned: number;
  lateReturns: number;
  onTimeReturns: number;
  onTimeReturnPct: number;
  avgDepotageMs: number | null;
  avgReturnLegMs: number | null;
}

export interface MonthlyResponsibilityRow {
  party: ResponsibleParty;
  label: string;
  /** Share of the month's detention days. */
  pct: number;
  incidents: number;
  days: number;
  fees: number;
  /** The reasons recorded behind those incidents, most frequent first. */
  reasons: Array<{ reason: DelayReason; label: string; count: number }>;
}

export interface MonthlyDetentionKpis {
  cases: number;
  days: number;
  fees: number;
  currency: string;
  ratePerDay: number;
  avgDaysPerCase: number | null;
  responsibility: MonthlyResponsibilityRow[];
  /**
   * What one more dépotage day, across this month's returned containers, would
   * add to the bill — the reason a zero in the KPI row is a margin worth
   * protecting rather than a given.
   */
  oneMoreDayCost: number;
}

export interface MonthlyStageAverage {
  key: string;
  label: string;
  avgMs: number;
  /** How many missions contributed — an average of one is not an average. */
  samples: number;
  isLongest: boolean;
}

export interface MonthlyWeeklyRollup {
  /** 'W1', 'W2', … in calendar order within the month. */
  key: string;
  /** e.g. "01–07 Aug". */
  dateRangeLabel: string;
  closed: number;
  avgMissionMs: number | null;
  avgDepotageMs: number | null;
  onTimePct: number | null;
  detentionFees: number | null;
  /** The week has not finished yet — figures are partial, never a verdict. */
  isOpen: boolean;
}

export interface MonthlyRecommendation {
  rank: number;
  title: string;
  description: string;
  impact: string;
}

export interface MonthlyExceptionRow {
  code: MissionException['code'];
  label: string;
  level: MissionException['level'];
  count: number;
}

export interface MonthlyReport {
  /** First instant of the month the report covers. */
  monthStart: number;
  monthEnd: number;
  missions: MonthlyMissionKpis;
  containers: MonthlyContainerKpis;
  detention: MonthlyDetentionKpis;
  stages: MonthlyStageAverage[];
  /** One row per week of the month, missions bucketed by when they closed. */
  weeklyRollup: MonthlyWeeklyRollup[];
  exceptions: MonthlyExceptionRow[];
  /** Every mission in the month, so the report can list the ones that need reading. */
  reports: MissionReport[];
  /** Missions whose empty-return deadline was missed, worst first. */
  worstReturns: MissionReport[];
  /** Up to three data-driven moves for next month. Empty when nothing stands out. */
  recommendations: MonthlyRecommendation[];
}

/**
 * §11 — where operational time is consumed, in the specification's order.
 *
 * Exported because the shipment report rolls the very same seven intervals up
 * over one consignment's containers: two aggregates of the same missions that
 * named their stages differently would be two vocabularies for one fact.
 */
export const STAGE_ROWS: ReadonlyArray<{
  key: string;
  label: string;
  of: (report: MissionReport) => number | null;
}> = [
  { key: 'wait_pickup', label: 'Pickup Waiting', of: (r) => r.kpis.waitPickupMs },
  { key: 'loading', label: 'Loading', of: (r) => r.kpis.loadingMs },
  { key: 'transit', label: 'Transit', of: (r) => r.kpis.transitMs },
  { key: 'wait_dropoff', label: 'Drop-off Waiting', of: (r) => r.kpis.waitDropMs },
  { key: 'unloading', label: 'Unstuffing', of: (r) => r.kpis.unloadingMs },
  { key: 'depotage', label: 'Unstuffing (client)', of: (r) => r.kpis.depotageMs },
  { key: 'empty_return', label: 'Empty Return', of: (r) => r.kpis.returnLegMs },
];

/** The exception vocabulary, shared by every aggregate that counts them. */
export const EXCEPTION_LABELS: Record<MissionException['code'], string> = {
  excessive_waiting: 'Excessive waiting time',
  long_loading: 'Long loading time',
  long_unloading: 'Long unloading time',
  long_depotage: 'Long dépotage time',
  return_due_soon: 'Empty return approaching deadline',
  return_deadline_exceeded: 'Empty return deadline exceeded',
  detention_triggered: 'Detention triggered',
  long_mission: 'Unusually long mission duration',
  late_delivery: 'Delivered after the promised date',
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

const collect = (
  reports: MissionReport[],
  pick: (report: MissionReport) => number | null,
): number[] => reports.map(pick).filter((value): value is number => value !== null && value >= 0);

/**
 * A mission counts as on time when it met every promise it carried: the
 * delivery date where the account has one, and the shipping line's return
 * deadline where a container is involved. Both, because a container delivered
 * on the promised day and returned four days late did not go well.
 */
export function isOnTimeMission(report: MissionReport): boolean {
  if (report.deliveryOutcome === 'late') return false;
  if (report.containerReturn.status === 'delayed') return false;
  return true;
}

/**
 * Three heuristics, not a generic engine.
 *
 * Each names one specific, recurring pattern in a month's data and writes its
 * own sentence around real figures — a repeated slow dropoff, a week that
 * broke from the rest, the thing currently holding (or costing) money. A
 * heuristic that finds nothing returns `null` rather than force a slot that
 * is not backed by the month's own numbers, so a quiet month can legitimately
 * carry fewer than three.
 */

function recommendBottleneckLocation(
  completed: MissionReport[],
  ratePerDay: number,
  currency: string,
): MonthlyRecommendation | null {
  const slowest = completed
    .filter((report) => (report.kpis.depotageMs ?? 0) > 0)
    .sort((a, b) => (b.kpis.depotageMs ?? 0) - (a.kpis.depotageMs ?? 0))
    .slice(0, 3);
  if (slowest.length < 2) return null;

  const dropoffs = [...new Set(slowest.map((report) => report.overview.dropoff))];
  const topDropoff = dropoffs[0];
  if (!topDropoff) return null;

  return {
    rank: 0,
    title: `Pre-book dépotage slots for ${topDropoff}-bound boxes`,
    description: `The ${slowest.length} longest strips of the month ran through ${dropoffs.join(' and ')}.`,
    impact: `Removes ${ratePerDay.toLocaleString()} ${currency}/day of exposure`,
  };
}

function recommendWeeklyAnomaly(
  weeklyRollup: MonthlyWeeklyRollup[],
  onTimePct: number,
): MonthlyRecommendation | null {
  const dataWeeks = weeklyRollup.filter((week) => !week.isOpen && week.avgMissionMs !== null);
  if (dataWeeks.length < 2) return null;
  const last = dataWeeks[dataWeeks.length - 1];
  const prior = dataWeeks.slice(0, -1);
  const priorAvg = mean(prior.map((week) => week.avgMissionMs as number));
  if (!last || last.avgMissionMs === null || priorAvg === null || priorAvg === 0) return null;

  const deltaPct = ((last.avgMissionMs - priorAvg) / priorAvg) * 100;
  if (deltaPct < 15) return null;

  const priorWeek = prior[prior.length - 1];
  const volumeFell = priorWeek !== undefined && last.closed < priorWeek.closed;

  return {
    rank: 0,
    title: `Check why ${last.key} slowed`,
    description: `Cycle time reached ${formatDuration(last.avgMissionMs, { compact: true })}${
      volumeFell ? ' while volume dropped' : ''
    }. Confirm it is a one-off before next month.`,
    impact:
      onTimePct >= 90 ? `Protects the ${onTimePct}% on-time record` : 'Recovers the on-time rate',
  };
}

function recommendBufferOrRisk(
  detention: MonthlyDetentionKpis,
  containers: MonthlyContainerKpis,
): MonthlyRecommendation | null {
  if (detention.cases === 0) {
    if (containers.avgReturnLegMs === null || containers.returned === 0) return null;
    return {
      rank: 0,
      title: 'Keep the empty-return buffer',
      description: `Returns ran averaging ${formatDuration(containers.avgReturnLegMs, { compact: true })} and none crossed free time. That margin is what held detention at zero.`,
      impact: `Keeps fees at 0 ${detention.currency}`,
    };
  }

  const top = detention.responsibility[0];
  if (!top) return null;
  return {
    rank: 0,
    title: `Address ${top.label} detention exposure`,
    description: `${top.incidents} case${top.incidents === 1 ? '' : 's'} this month, ${top.days} day${top.days === 1 ? '' : 's'} total, mostly ${top.reasons[0]?.label ?? 'unattributed'}.`,
    impact: `${top.fees.toLocaleString()} ${detention.currency} at stake`,
  };
}

export function computeMonthlyReport(
  reports: MissionReport[],
  monthStart: Date,
  monthEnd: Date,
  /** Defaults to the month's own end, so a report for a past month never has an "open" week. */
  now: number = monthEnd.getTime(),
): MonthlyReport {
  const from = monthStart.getTime();
  const to = monthEnd.getTime();

  const ratePerDay = detentionRatePerContainerDay();
  const currency = detentionRateCurrency();

  /* ── Missions (§10) ─────────────────────────────────────────────────── */
  const cancelled = reports.filter((report) => report.overview.isTerminated);
  const live = reports.filter((report) => !report.overview.isTerminated);
  const completed = live.filter((report) => report.isClosed);
  const onTime = completed.filter(isOnTimeMission);

  const missions: MonthlyMissionKpis = {
    total: reports.length,
    completed: completed.length,
    inProgress: live.length - completed.length,
    cancelled: cancelled.length,
    completionPct: live.length ? Math.round((completed.length / live.length) * 100) : 0,
    onTime: onTime.length,
    onTimePct: completed.length ? Math.round((onTime.length / completed.length) * 100) : 0,
    avgMissionMs: mean(collect(completed, (r) => r.kpis.totalMs)),
    avgTransitMs: mean(collect(live, (r) => r.kpis.transitMs)),
    avgWaitingMs: mean(collect(live, (r) => r.kpis.waitTotalMs)),
  };

  /* ── Containers (§10) ───────────────────────────────────────────────── */
  const containerReports = live.filter((report) => report.containerReturn.hasContainer);
  const returned = containerReports.filter((report) => report.containerReturn.returnedAt !== null);
  const lateReturns = returned.filter(
    (report) => (report.containerReturn.deltaMs ?? 0) > 0,
  );

  const containers: MonthlyContainerKpis = {
    total: containerReports.length,
    delivered: containerReports.filter((report) => report.containerReturn.deliveredAt !== null).length,
    emptyReady: containerReports.filter((report) => report.containerReturn.emptyReadyAt !== null).length,
    returned: returned.length,
    lateReturns: lateReturns.length,
    onTimeReturns: returned.length - lateReturns.length,
    onTimeReturnPct: returned.length
      ? Math.round(((returned.length - lateReturns.length) / returned.length) * 100)
      : 0,
    avgDepotageMs: mean(collect(containerReports, (r) => r.kpis.depotageMs)),
    avgReturnLegMs: mean(collect(containerReports, (r) => r.kpis.returnLegMs)),
  };

  /* ── Detention (§10, §12) ───────────────────────────────────────────── */
  const detentionCases = live.filter((report) => report.containerReturn.detentionDays > 0);
  const detentionDays = detentionCases.reduce(
    (sum, report) => sum + report.containerReturn.detentionDays,
    0,
  );

  const byParty = new Map<
    ResponsibleParty,
    { incidents: number; days: number; reasons: Map<DelayReason, number> }
  >();
  for (const report of detentionCases) {
    const party = report.attribution?.party ?? 'under_review';
    const reason = report.attribution?.reason ?? 'other';
    const row = byParty.get(party) ?? { incidents: 0, days: 0, reasons: new Map() };
    row.incidents += 1;
    row.days += report.containerReturn.detentionDays;
    row.reasons.set(reason, (row.reasons.get(reason) ?? 0) + 1);
    byParty.set(party, row);
  }

  const responsibility: MonthlyResponsibilityRow[] = [...byParty.entries()]
    .map(([party, row]) => ({
      party,
      label: RESPONSIBLE_PARTY_LABELS[party],
      pct: detentionDays > 0 ? Math.round((row.days / detentionDays) * 100) : 0,
      incidents: row.incidents,
      days: row.days,
      fees: row.days * ratePerDay,
      reasons: [...row.reasons.entries()]
        .map(([reason, count]) => ({ reason, label: DELAY_REASON_LABELS[reason], count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.days - a.days);

  const detention: MonthlyDetentionKpis = {
    cases: detentionCases.length,
    days: detentionDays,
    fees: detentionDays * ratePerDay,
    currency,
    ratePerDay,
    avgDaysPerCase: detentionCases.length ? detentionDays / detentionCases.length : null,
    responsibility,
    oneMoreDayCost: returned.length * ratePerDay,
  };

  /* ── Average time by stage (§11) ────────────────────────────────────── */
  const stages: MonthlyStageAverage[] = STAGE_ROWS.map((row) => {
    const values = collect(live, row.of).filter((value) => value > 0);
    return {
      key: row.key,
      label: row.label,
      avgMs: mean(values) ?? 0,
      samples: values.length,
      isLongest: false,
    };
  }).filter((row) => row.samples > 0);
  const longestAvg = stages.reduce((max, row) => Math.max(max, row.avgMs), 0);
  for (const row of stages) row.isLongest = longestAvg > 0 && row.avgMs === longestAvg;

  /* ── Weekly rollup ──────────────────────────────────────────────────── */
  /*
   * Bucketed by close date, not start date: this table answers "what did we
   * close each week", the same population as the shipment list beside it in
   * the report, so the two totals always agree. Month membership itself stays
   * start-date-based (§ above, `useShipperMonthlyReport`'s stability rule) —
   * this only decides which week-row inside an already-settled month a closed
   * mission lands in.
   */
  const weekCount = Math.max(1, Math.ceil((to - from) / (7 * DAY)));
  const weekBuckets: MissionReport[][] = Array.from({ length: weekCount }, () => []);
  for (const report of completed) {
    const closedAt = report.overview.closedAt;
    if (closedAt === null) continue;
    const week = Math.min(weekCount - 1, Math.max(0, Math.floor((closedAt - from) / (7 * DAY))));
    weekBuckets[week]?.push(report);
  }

  const weekRangeLabel = (rangeStart: number, rangeEndExclusive: number): string => {
    const lastDay = new Date(Math.min(rangeEndExclusive, to) - DAY);
    return `${format(new Date(rangeStart), 'dd')}–${format(lastDay, 'dd MMM')}`;
  };

  const weeklyRollup: MonthlyWeeklyRollup[] = weekBuckets.map((bucket, index) => {
    const rangeStart = from + index * 7 * DAY;
    const rangeEnd = rangeStart + 7 * DAY;
    const onTimeInWeek = bucket.filter(isOnTimeMission).length;
    return {
      key: `W${index + 1}`,
      dateRangeLabel: weekRangeLabel(rangeStart, rangeEnd),
      closed: bucket.length,
      avgMissionMs: mean(collect(bucket, (r) => r.kpis.totalMs)),
      avgDepotageMs: mean(collect(bucket, (r) => r.kpis.depotageMs)),
      onTimePct: bucket.length > 0 ? Math.round((onTimeInWeek / bucket.length) * 100) : null,
      detentionFees:
        bucket.length > 0
          ? bucket.reduce((sum, report) => sum + report.containerReturn.detentionFees, 0)
          : null,
      isOpen: rangeEnd > now,
    };
  });

  const recommendations: MonthlyRecommendation[] = [
    recommendBottleneckLocation(completed, ratePerDay, currency),
    recommendWeeklyAnomaly(weeklyRollup, missions.onTimePct),
    recommendBufferOrRisk(detention, containers),
  ]
    .filter((recommendation): recommendation is MonthlyRecommendation => recommendation !== null)
    .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));

  /* ── Exceptions (§15) ───────────────────────────────────────────────── */
  const exceptionCounts = new Map<MissionException['code'], MonthlyExceptionRow>();
  for (const report of live) {
    for (const exception of report.exceptions) {
      const row = exceptionCounts.get(exception.code) ?? {
        code: exception.code,
        label: EXCEPTION_LABELS[exception.code],
        level: exception.level,
        count: 0,
      };
      row.count += 1;
      exceptionCounts.set(exception.code, row);
    }
  }
  const exceptions = [...exceptionCounts.values()].sort(
    (a, b) => (a.level === b.level ? b.count - a.count : a.level === 'delayed' ? -1 : 1),
  );

  const worstReturns = [...detentionCases].sort(
    (a, b) => (b.containerReturn.deltaMs ?? 0) - (a.containerReturn.deltaMs ?? 0),
  );

  return {
    monthStart: from,
    monthEnd: to,
    missions,
    containers,
    detention,
    stages,
    weeklyRollup,
    exceptions,
    reports,
    worstReturns,
    recommendations,
  };
}
