import type { DetailRequest } from './detail';

/**
 * The KPI envelope every headline number ships in.
 *
 * One shape means one `MetricTile` and one detail channel serve the whole
 * portal; adding a metric costs a row in an aggregation, not a component.
 * Mirrors the shipper suite's `KpiMetric`, with two extra units the carrier's
 * world needs (`km`, `kg` for CO₂) and the richer `DetailRequest` in place of
 * a bare filter narrowing.
 */

export type MetricUnit =
  | 'count'
  | 'percent'
  | 'currency'
  | 'days'
  | 'hours'
  | 'minutes'
  | 'km'
  | 'kg';

/**
 * Which direction is good. Earnings rising and empty mileage rising are both
 * "up", and colouring them alike is how a dashboard celebrates waste.
 */
export type MetricPolarity = 'higher_is_better' | 'lower_is_better' | 'neutral';

export interface TrendPoint {
  /** Bucket start, YYYY-MM-DD. */
  t: string;
  v: number;
}

export interface KpiMetric {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
  polarity: MetricPolarity;

  /** Same metric over the comparison window. Absent when compare is off. */
  previousValue?: number;
  /** Fractional change, e.g. 0.082 for +8.2%. Absent when the base is zero. */
  deltaPct?: number;

  /** Sparkline series. Empty array renders the tile without a plot. */
  trend: TrendPoint[];
  /** Prior-period sparkline, aligned to `trend` by index. */
  previousTrend?: TrendPoint[];

  /** One short clause of context — never a restatement of the number. */
  caption?: string;
  detail?: DetailRequest;
}
