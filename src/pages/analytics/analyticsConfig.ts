import type { BiFilters } from '@/features/shipper-bi/contracts';
import { bucketKey, bucketLabel, chooseGranularity, eachBucket } from '@/lib/bi/time';
import type { ShipmentFact } from '@/lib/bi/derive';

/**
 * Shared thresholds and series helpers for the analytics tabs.
 *
 * These lived as loose literals inside three different section files, which is
 * how the tab badge and the table it links to came to disagree about what "at
 * risk" meant.
 */

/** Risk score at or above which an open shipment is worth a call today. */
export const RISK_ALERT_THRESHOLD = 40;

/** Risk score at or above which the row is drawn as critical rather than warning. */
export const RISK_CRITICAL_THRESHOLD = 70;

/**
 * Bucket facts onto a real calendar series.
 *
 * The delay trend and the empty-return cycle-time trend used to be
 * `facts.slice(0, 30)` labelled "Day 1…Day 30" — thirty rows in whatever order
 * the array happened to be in, drawn as a time series. It sloped, so it read as
 * a trend, but the x-axis meant nothing: re-sorting the array changed the
 * "trend" without a single shipment changing.
 *
 * This buckets by an actual date on each fact, at the same granularity the
 * filter bar's range implies, and keeps empty buckets so a quiet week is a gap
 * in the line rather than a missing point that shortens the axis.
 */
export function buildTrendSeries({
  facts,
  filters,
  dateOf,
  valueOf,
  aggregate = 'mean',
}: {
  facts: ShipmentFact[];
  filters: BiFilters;
  /** Which date puts a fact in a bucket. Return undefined to leave it out. */
  dateOf: (fact: ShipmentFact) => string | undefined;
  /** The measure being trended. Return undefined to leave the fact out. */
  valueOf: (fact: ShipmentFact) => number | undefined;
  aggregate?: 'sum' | 'mean';
}): { points: Array<{ t: string; v: number }>; formatBucket: (key: string) => string } {
  const period = { from: filters.from, to: filters.to };
  const granularity = chooseGranularity(period);

  const totals = new Map<string, { sum: number; count: number }>();
  for (const fact of facts) {
    const date = dateOf(fact);
    if (!date) continue;
    const value = valueOf(fact);
    if (value === undefined || Number.isNaN(value)) continue;

    const key = bucketKey(date, granularity);
    const entry = totals.get(key) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    totals.set(key, entry);
  }

  const points = eachBucket(period, granularity).map((key) => {
    const entry = totals.get(key);
    if (!entry || entry.count === 0) return { t: key, v: 0 };
    return {
      t: key,
      v: aggregate === 'sum' ? entry.sum : Math.round((entry.sum / entry.count) * 10) / 10,
    };
  });

  return { points, formatBucket: (key: string) => bucketLabel(key, granularity) };
}
