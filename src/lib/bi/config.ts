import { getSettings } from '@/stores/settings.store';

/**
 * The tunable constants behind the control tower's metric definitions.
 *
 * Collected here rather than inlined so a policy question — "what counts as
 * on time?" — has one answer with one place to change it, and so the backend
 * port has an explicit list of what it must agree with. Every value is a
 * business decision, not an implementation detail.
 *
 * Since Settings arrived, most of these are **functions, not constants**. That
 * is the point: a business decision an operator can change has to be read at
 * the moment it is used, and a `const` captured at module load cannot be. The
 * ones that are still `const` are the ones nobody was ever going to tune from
 * a settings screen — histogram bin edges, the ceilings inside the risk score's
 * own arithmetic.
 *
 * Each function reads the store directly rather than through a hook, because
 * these are called from `derive`/`aggregate` code that runs outside React. A
 * component that needs to re-render when a policy changes should read the
 * `useOperationsPolicy()` hook instead.
 */

/**
 * How late a delivery may be and still count as on time.
 *
 * The scoping sheet promises a delivery *date*, not an instant, and that is how
 * the corridor actually contracts: a shipment quoted for Tuesday that arrives
 * Tuesday evening met its commitment. Half a day is the working-hours reading
 * of "on the promised date".
 *
 * Measuring to the minute instead scores a multi-day haul against a window
 * narrower than a single queue at the terminal gate, and a scorecard nobody
 * believes is a scorecard nobody uses. The moment a transporter disputes their
 * ranking this is the number the argument is about, so it lives here, named.
 */
export function onTimeGraceMinutes(): number {
  return getSettings().operations.onTimeGraceMinutes;
}

/**
 * How early is *too* early.
 *
 * Arriving ahead of the window is not automatically a win: a truck a full day
 * early is a truck waiting at a gate that has not opened, which is where the
 * waiting charges in the cost section come from. Inside a day of the promise is
 * ordinary variation and counts as on time; beyond it is reported separately so
 * the pattern stays visible.
 */
export function earlyThresholdMinutes(): number {
  return getSettings().operations.earlyThresholdMinutes;
}

/**
 * Free-time headroom bands for containers still out, in hours.
 *
 * `overdue` is not configurable and never will be: zero headroom means free
 * time has expired, which is a fact about the container rather than a policy
 * about it. Only the due-soon window is a judgement call.
 */
export function returnHeadroomBands(): { overdue: number; dueSoon: number } {
  return { overdue: 0, dueSoon: getSettings().operations.returnDueSoonHours };
}

/**
 * Weights of the risk score, summing to 1.
 *
 * The score answers "which shipment should someone look at first", so it blends
 * the three independent ways a shipment goes wrong: it is drifting off its ETA,
 * it is stuck at a stage longer than that stage normally takes, or its free
 * time is about to run out.
 */
export function riskWeights(): { etaDrift: number; stageDwell: number; freeTime: number } {
  return getSettings().operations.riskWeights;
}

/** Risk score at or above which an alert is critical / warning. */
export function riskSeverityThresholds(): { critical: number; warning: number } {
  const { riskCritical, riskWarning } = getSettings().operations;
  return { critical: riskCritical, warning: riskWarning };
}

/** Fallback free time when a shipping line has not specified one, in days. */
export function defaultFreeTimeDays(): number {
  return getSettings().finance.defaultFreeTimeDays;
}

/** Currency the ledger is denominated in. */
export function biCurrency(): string {
  return getSettings().finance.baseCurrency;
}

/**
 * Detention billed per container, per day past free time.
 *
 * Quoted in USD rather than the ledger's DJF: this is the contractual rate the
 * shipping lines bill at, and it is the number the shipper negotiates. The
 * empty-return panel is the one place the dashboard shows it, and it labels the
 * currency at the point of display so it cannot be read as a DJF figure.
 */
export function detentionRatePerContainerDay(): number {
  return getSettings().finance.detentionRatePerDay;
}

export function detentionRateCurrency(): string {
  return getSettings().finance.detentionCurrency;
}

// ─── Not settings ───────────────────────────────────────────────────────────
//
// Internal to the risk score's own arithmetic and to chart layout. Changing one
// of these is changing how a metric is computed, not what the business wants
// from it, so they stay in code.

/** ETA drift that scores full marks on its component, in minutes. */
export const RISK_ETA_DRIFT_CEILING_MINUTES = 24 * 60;

/** Dwell beyond a stage's P90 that scores full marks, as a multiple of P90. */
export const RISK_DWELL_CEILING_RATIO = 2;

/** Bin edges for the empty-return cycle-time histogram, in days. */
export const CYCLE_TIME_BINS = [0, 2, 4, 6, 8, 10, 14, 21] as const;
