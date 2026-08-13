/**
 * The tunable constants behind the control tower's metric definitions.
 *
 * Collected here rather than inlined so a policy question — "what counts as
 * on time?" — has one answer with one place to change it, and so the backend
 * port has an explicit list of what it must agree with. Every value is a
 * business decision, not an implementation detail.
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
export const ON_TIME_GRACE_MINUTES = 12 * 60;

/**
 * How early is *too* early.
 *
 * Arriving ahead of the window is not automatically a win: a truck a full day
 * early is a truck waiting at a gate that has not opened, which is where the
 * waiting charges in the cost section come from. Inside a day of the promise is
 * ordinary variation and counts as on time; beyond it is reported separately so
 * the pattern stays visible.
 */
export const EARLY_THRESHOLD_MINUTES = 24 * 60;

/** Free-time headroom bands for containers still out, in hours. */
export const RETURN_HEADROOM_BANDS = {
  /** Past free time — accruing charges now. */
  overdue: 0,
  /** Inside two days: still fixable if someone acts today. */
  dueSoon: 48,
} as const;

/**
 * Weights of the risk score, summing to 1.
 *
 * The score answers "which shipment should someone look at first", so it blends
 * the three independent ways a shipment goes wrong: it is drifting off its ETA,
 * it is stuck at a stage longer than that stage normally takes, or its free
 * time is about to run out.
 */
export const RISK_WEIGHTS = {
  etaDrift: 0.45,
  stageDwell: 0.35,
  freeTime: 0.2,
} as const;

/** ETA drift that scores full marks on its component, in minutes. */
export const RISK_ETA_DRIFT_CEILING_MINUTES = 24 * 60;

/** Dwell beyond a stage's P90 that scores full marks, as a multiple of P90. */
export const RISK_DWELL_CEILING_RATIO = 2;

/** Risk score at or above which an alert is critical / warning. */
export const RISK_SEVERITY_THRESHOLDS = {
  critical: 70,
  warning: 40,
} as const;

/** Bin edges for the empty-return cycle-time histogram, in days. */
export const CYCLE_TIME_BINS = [0, 2, 4, 6, 8, 10, 14, 21] as const;

/** Fallback free time when a shipping line has not specified one, in days. */
export const DEFAULT_FREE_TIME_DAYS = 7;

/** Currency the ledger is denominated in. */
export const BI_CURRENCY = 'DJF';

/**
 * Detention billed per container, per day past free time.
 *
 * Quoted in USD rather than the ledger's DJF: this is the contractual rate the
 * shipping lines bill at, and it is the number the shipper negotiates. The
 * empty-return panel is the one place the dashboard shows it, and it labels the
 * currency at the point of display so it cannot be read as a DJF figure.
 */
export const DETENTION_RATE_PER_CONTAINER_DAY = 50;
export const DETENTION_RATE_CURRENCY = 'USD';
