import {
  DAY_MS,
  detentionRatePerDay,
  detentionFor,
  normalizeContainerSize,
} from '@/data/emptyReturnData';
import { emptyDwellOf, riskOf } from '@/stores/emptyReturn.store';
import type {
  EmptyReturnRecord,
  FullLoadMission,
  PerformanceFilters,
} from '@/types/emptyReturn';

import { incompatibilityReasons, suggestLoadsFor } from './matching';

/**
 * The Dashboard's arithmetic — every figure on the performance page, computed
 * once.
 *
 * The page answers one question: *are we actually avoiding unnecessary empty
 * movements?* Daily work lives in the Control Tower; nothing here is a queue
 * and nothing here is clickable-to-act. So the figures are chosen to be
 * arguable rather than merely available — a pairing rate somebody can push on,
 * an average empty time somebody can shorten, and a failure breakdown that says
 * what to fix.
 *
 * ## The one assumption, stated
 *
 * Everything is measured off real timestamps except `detentionAvoided`,
 * which cannot be: nobody can know what a container *would* have cost had it
 * gone back separately. It is priced at `AVOIDED_TRIP_DETENTION_DAYS` container-
 * days per avoided trip, that constant is named here rather than buried in an
 * expression, and the screen labels the figure "Est." and prints the assumption
 * underneath it. An estimate an operator can see the shape of is useful; one
 * that looks like a measurement is not.
 */

/** Container-days of detention assumed saved by each empty return that never happened. */
export const AVOIDED_TRIP_DETENTION_DAYS = 2;

/** How many weeks the avoidance trend looks back. */
export const TREND_WEEKS = 6;

export interface FailureReason {
  label: string;
  count: number;
  /** Share of all blocked container↔load pairs, 0–100. */
  pct: number;
}

export interface TrendPoint {
  /** `W-5` … `W0`, oldest first. `W0` is the current week. */
  label: string;
  /** Avoidance rate that week, 0–100. Null when nothing was decided. */
  rate: number | null;
  decisions: number;
  pairings: number;
}

export interface EmptyReturnPerformance {
  /** Containers inside the current filter. */
  scope: EmptyReturnRecord[];

  /** Closed containers whose decision was a pairing, over all closed containers. Null when nothing has closed. */
  pairingRate: number | null;
  /** Mean time from "empty available" to a decision. */
  averageEmptyMs: number;
  /** Every pairing, open or closed — each one is a trip that was not driven. */
  returnsAvoided: number;
  /** See the module note: an estimate, at a stated rate. */
  detentionAvoided: number;

  /** Distinct container numbers touched. */
  containersManaged: number;
  /** Closed by going back on their own. */
  returnedDirectly: number;
  /** Of those, back inside the deadline. Null when nothing has gone back. */
  onTimeReturnRate: number | null;
  /** Open containers already past their deadline. */
  overdueNow: number;
  /** Detention actually accruing right now on those. */
  detentionExposure: number;
  /** Open containers with no deadline recorded — the blind spot, stated. */
  noDeadline: number;

  trend: TrendPoint[];
  failureReasons: FailureReason[];
  /** Containers awaiting a decision that no open load can serve. The page's call to action. */
  unmatchable: EmptyReturnRecord[];
}

function inPeriod(record: EmptyReturnRecord, now: number, period: PerformanceFilters['period']) {
  if (period === 'all') return true;
  const windowMs = Number(period) * DAY_MS;
  const stamp = record.emptyReadyAt ?? record.fullPickupAt;
  if (!stamp) return true;
  return now - stamp <= windowMs;
}

/** The filter bar, applied. Kept separate so the failure analysis can reuse it. */
export function applyPerformanceFilters(
  records: EmptyReturnRecord[],
  filters: PerformanceFilters,
  now: number,
): EmptyReturnRecord[] {
  return records.filter((record) => {
    if (!inPeriod(record, now, filters.period)) return false;
    if (filters.line !== 'all' && record.line !== filters.line) return false;
    if (filters.transporter !== 'all' && record.transporter !== filters.transporter) return false;
    if (filters.size !== 'all' && normalizeContainerSize(record.size) !== filters.size) return false;
    return true;
  });
}

/** The moment a container's decision was made, whichever branch it took. */
function decidedAt(record: EmptyReturnRecord): number | null {
  return record.matchedAt ?? record.plannedReturnAt ?? record.returnedAt;
}

/**
 * Avoidance rate per week, oldest first.
 *
 * Bucketed by *when the decision was made*, not when the container appeared —
 * the rate is a measure of decisions, and dating it by arrival would credit
 * this week's work to the week the box turned up.
 */
function buildTrend(records: EmptyReturnRecord[], now: number): TrendPoint[] {
  const weeks: TrendPoint[] = [];

  for (let index = TREND_WEEKS - 1; index >= 0; index -= 1) {
    const end = now - index * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const decided = records.filter((record) => {
      const at = decidedAt(record);
      return at !== null && at > start && at <= end;
    });
    const pairings = decided.filter((record) => Boolean(record.nextFull)).length;
    weeks.push({
      label: index === 0 ? 'This week' : `−${index}w`,
      decisions: decided.length,
      pairings,
      rate: decided.length ? Math.round((pairings / decided.length) * 100) : null,
    });
  }

  return weeks;
}

/**
 * Why pairings are not happening — tallied from the real pool, not assumed.
 *
 * For every container still awaiting a decision that no open load can serve,
 * each load in the pool is asked *why not*, and the reasons are counted. That
 * turns a vague "matching is poor" into the one sentence the page exists to
 * produce: which constraint to attack first — earlier full-load visibility,
 * a different line's boxes, or deadlines being captured too late.
 */
function buildFailureReasons(
  awaiting: EmptyReturnRecord[],
  loads: FullLoadMission[],
  now: number,
): { reasons: FailureReason[]; unmatchable: EmptyReturnRecord[] } {
  const unmatchable = awaiting.filter(
    (record) => suggestLoadsFor(record, loads, now).length === 0,
  );

  const tally = new Map<string, number>();
  let total = 0;

  for (const record of unmatchable) {
    if (loads.length === 0) {
      tally.set('No open full load in the pool at all', (tally.get('No open full load in the pool at all') ?? 0) + 1);
      total += 1;
      continue;
    }
    for (const load of loads) {
      for (const issue of incompatibilityReasons(record, load, now)) {
        tally.set(issue, (tally.get(issue) ?? 0) + 1);
        total += 1;
      }
    }
  }

  const reasons = Array.from(tally.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { reasons, unmatchable };
}

export interface BuildPerformanceInput {
  records: EmptyReturnRecord[];
  loads: FullLoadMission[];
  filters: PerformanceFilters;
  now: number;
}

export function buildEmptyReturnPerformance({
  records,
  loads,
  filters,
  now,
}: BuildPerformanceInput): EmptyReturnPerformance {
  const scope = applyPerformanceFilters(records, filters, now);

  const closed = scope.filter((record) => record.stage === 'closed');
  const closedPaired = closed.filter((record) => record.outcome === 'paired').length;
  const openPaired = scope.filter((record) => record.stage === 'paired').length;
  const returnsAvoided = closedPaired + openPaired;

  const returnedDirectly = closed.filter(
    (record) => record.outcome === 'returned' || record.outcome === 'returned_late',
  );
  const returnedOnTime = returnedDirectly.filter((record) => record.outcome === 'returned').length;

  const open = scope.filter((record) => record.stage !== 'closed');
  const overdue = open.filter((record) => riskOf(record, now) === 'overdue');

  const awaiting = scope.filter((record) => record.stage === 'empty');
  const { reasons, unmatchable } = buildFailureReasons(awaiting, loads, now);

  const averageEmptyMs = scope.length
    ? scope.reduce((total, record) => total + emptyDwellOf(record, now), 0) / scope.length
    : 0;

  return {
    scope,

    pairingRate: closed.length ? Math.round((closedPaired / closed.length) * 100) : null,
    averageEmptyMs,
    returnsAvoided,
    detentionAvoided: returnsAvoided * AVOIDED_TRIP_DETENTION_DAYS * detentionRatePerDay(),

    containersManaged: new Set(scope.map((record) => record.container).filter(Boolean)).size,
    returnedDirectly: returnedDirectly.length,
    onTimeReturnRate: returnedDirectly.length
      ? Math.round((returnedOnTime / returnedDirectly.length) * 100)
      : null,
    overdueNow: overdue.length,
    detentionExposure: overdue.reduce(
      (total, record) => total + detentionFor(record.deadline ? now - record.deadline : 0),
      0,
    ),
    noDeadline: open.filter((record) => !record.deadline).length,

    trend: buildTrend(scope, now),
    failureReasons: reasons.slice(0, 5),
    unmatchable,
  };
}
