/**
 * The small statistics the dashboard needs.
 *
 * Quantiles rather than means, mostly. Delay and dwell distributions are
 * long-tailed: a mean of 3 hours over shipments that are usually punctual and
 * occasionally three days late describes neither group, and it is the tail that
 * costs money.
 */

/**
 * Linear-interpolated quantile. `q` is 0–1.
 *
 * Interpolating rather than picking the nearest rank matters on the small
 * samples a single route or transporter produces, where nearest-rank makes P90
 * jump between two observations as one shipment is added.
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lowerValue = sorted[Math.floor(position)] ?? 0;
  const upperValue = sorted[Math.ceil(position)] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - Math.floor(position));
}

export function median(values: number[]): number {
  return quantile(values, 0.5);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

export interface QuantileSummary {
  count: number;
  p50: number;
  p90: number;
  max: number;
  mean: number;
}

export function summarise(values: number[]): QuantileSummary {
  return {
    count: values.length,
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    max: max(values),
    mean: mean(values),
  };
}

/**
 * Fractional change from `previous` to `current`.
 *
 * Returns `undefined` rather than Infinity when the base is zero. A card that
 * receives `undefined` renders "no prior data"; one that receives Infinity
 * renders "+∞%", which is both wrong and alarming — going from zero delayed
 * shipments to one is news, but it is not an infinite increase.
 */
export function deltaPct(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous === 0) return undefined;
  return (current - previous) / Math.abs(previous);
}

/** Safe ratio: zero denominator yields 0, not NaN. */
export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Clamp into a range. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Group items by a derived key, preserving encounter order within each group. */
export function groupBy<T, K extends string>(
  items: readonly T[],
  keyOf: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Sum a numeric field per group. */
export function sumBy<T, K extends string>(
  items: readonly T[],
  keyOf: (item: T) => K,
  valueOf: (item: T) => number,
): Map<K, number> {
  const totals = new Map<K, number>();
  for (const item of items) {
    const key = keyOf(item);
    totals.set(key, (totals.get(key) ?? 0) + valueOf(item));
  }
  return totals;
}

/**
 * Rank descending and attach the running share of the total.
 *
 * The line half of a Pareto chart. Computed here rather than in the component
 * because "the top three causes are 80% of the delay" is a claim about the
 * data, and it has to agree with the totals shown elsewhere.
 */
export function withCumulativeShare<T extends { value: number }>(
  items: T[],
): (T & { cumulativeShare: number })[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sum(sorted.map((item) => item.value));
  let running = 0;
  return sorted.map((item) => {
    running += item.value;
    return { ...item, cumulativeShare: total === 0 ? 0 : running / total };
  });
}
