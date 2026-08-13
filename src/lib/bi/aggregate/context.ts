import type {
  BiDataset,
  BiFilters,
  DrillDown,
  KpiMetric,
  MetricPolarity,
  MetricUnit,
  SectionMeta,
  TimeSeries,
  TrendPoint,
} from '@/features/shipper-bi/contracts';
import type { ShipmentFact } from '../derive';
import { deriveFacts } from '../derive';
import { deltaPct } from '../stats';
import {
  bucketKey,
  bucketLabel,
  chooseGranularity,
  eachBucket,
  isWithin,
  previousPeriod,
  type Granularity,
  type Period,
} from '../time';

/**
 * The shared machinery every section aggregator sits on.
 *
 * Two jobs. First, apply the dashboard filters once and hand each section the
 * same narrowed fact set — otherwise two cards can disagree about what "this
 * period" contains. Second, provide the KPI and trend builders, so that a
 * number, its comparison, its sparkline and its drill-down are always
 * constructed together rather than assembled ad hoc per card.
 */

export interface BiContext {
  dataset: BiDataset;
  filters: BiFilters;
  period: Period;
  comparison?: Period;
  granularity: Granularity;
  /** Facts inside the current period, after filters. */
  facts: ShipmentFact[];
  /** Facts inside the comparison period, after filters. Empty when off. */
  previousFacts: ShipmentFact[];
  /** Every fact after dimension filters, ignoring the date range. */
  allFacts: ShipmentFact[];
  /** Dimension lookups, so aggregators emit labels rather than ids. */
  transporterName: (id: string) => string;
  routeName: (id: string) => string;
}

/**
 * Narrow by dimension, not by date.
 *
 * Split from the date filter because the two are applied at different points:
 * dimensions constrain the population, the period selects which slice of it a
 * given card is describing. The live map, for instance, wants dimension filters
 * but must not be limited to shipments *created* in the window.
 */
export function applyDimensionFilters(
  facts: ShipmentFact[],
  filters: BiFilters,
): ShipmentFact[] {
  return facts.filter((fact) => {
    if (filters.routeIds.length && !filters.routeIds.includes(fact.routeId)) return false;
    if (filters.transporterIds.length && !filters.transporterIds.includes(fact.transporterId)) {
      return false;
    }
    if (filters.stages.length && !filters.stages.includes(fact.currentStage)) return false;
    if (
      filters.containerTypes.length &&
      (!fact.containerType || !filters.containerTypes.includes(fact.containerType))
    ) {
      return false;
    }
    if (filters.cargoTypes.length && !filters.cargoTypes.includes(fact.cargoType)) return false;
    if (
      filters.delayOwners.length &&
      !filters.delayOwners.some((owner) => (fact.delayByOwner[owner] ?? 0) > 0)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * A shipment belongs to the period it was created in.
 *
 * One anchor for the whole dashboard, chosen so that a shipment does not move
 * between periods as it progresses — anchoring on delivery would make last
 * month's totals change every time an old shipment finally arrives.
 */
export function inPeriod(facts: ShipmentFact[], period: Period): ShipmentFact[] {
  return facts.filter((fact) => isWithin(period, fact.createdAt));
}

export function buildContext(dataset: BiDataset, filters: BiFilters): BiContext {
  const period: Period = { from: filters.from, to: filters.to };
  const comparison = filters.compare ? previousPeriod(period) : undefined;

  const allFacts = applyDimensionFilters(deriveFacts(dataset), filters);
  const transporters = new Map(dataset.transporters.map((t) => [t.id, t.name]));
  const routes = new Map(dataset.routes.map((r) => [r.id, r.name]));

  return {
    dataset,
    filters,
    period,
    comparison,
    granularity: chooseGranularity(period),
    facts: inPeriod(allFacts, period),
    previousFacts: comparison ? inPeriod(allFacts, comparison) : [],
    allFacts,
    transporterName: (id) => transporters.get(id) ?? id,
    routeName: (id) => routes.get(id) ?? id,
  };
}

export function buildMeta(context: BiContext): SectionMeta {
  return {
    generatedAt: context.dataset.asOf,
    shipmentCount: context.facts.length,
    comparisonApplied: Boolean(context.comparison),
  };
}

/* ---------------------------------------------------------------------------
 * KPI construction
 * ------------------------------------------------------------------------ */

export interface KpiInput {
  key: string;
  label: string;
  unit: MetricUnit;
  polarity: MetricPolarity;
  /** Reduces a fact set to the headline number. */
  compute: (facts: ShipmentFact[]) => number;
  /**
   * Reduces one time bucket to a point. Defaults to `compute`, which is right
   * for counts and sums but wrong for rates — a rate over a bucket is not the
   * rate over the period, so anything averaged passes its own reducer.
   */
  bucket?: (facts: ShipmentFact[]) => number;
  caption?: string;
  drillDown?: DrillDown;
}

/**
 * Build a KPI with its comparison, sparkline and drill-down in one place.
 *
 * The alternative — each card computing its own delta — is how a dashboard ends
 * up with two cards that disagree about last month.
 */
export function buildKpi(context: BiContext, input: KpiInput): KpiMetric {
  const value = input.compute(context.facts);
  const previousValue = context.comparison
    ? input.compute(context.previousFacts)
    : undefined;

  const reducer = input.bucket ?? input.compute;

  return {
    key: input.key,
    label: input.label,
    value,
    unit: input.unit,
    polarity: input.polarity,
    previousValue,
    deltaPct: deltaPct(value, previousValue),
    trend: bucketSeries(context, context.facts, context.period, reducer),
    previousTrend: context.comparison
      ? bucketSeries(context, context.previousFacts, context.comparison, reducer)
      : undefined,
    caption: input.caption,
    drillDown: input.drillDown,
  };
}

/** Bucket facts by creation date and reduce each bucket to a point. */
export function bucketSeries(
  context: BiContext,
  facts: ShipmentFact[],
  period: Period,
  reduce: (facts: ShipmentFact[]) => number,
): TrendPoint[] {
  const buckets = new Map<string, ShipmentFact[]>();
  for (const fact of facts) {
    const key = bucketKey(fact.createdAt, context.granularity);
    const existing = buckets.get(key);
    if (existing) existing.push(fact);
    else buckets.set(key, [fact]);
  }

  // Empty buckets are emitted, not skipped: a gap in a trend line means "no
  // data", and dropping the point instead draws a straight line through it.
  return eachBucket(period, context.granularity).map((key) => ({
    t: key,
    v: reduce(buckets.get(key) ?? []),
  }));
}

/** Bucket facts into one named series. */
export function toTimeSeries(
  context: BiContext,
  key: string,
  label: string,
  facts: ShipmentFact[],
  period: Period,
  reduce: (facts: ShipmentFact[]) => number,
): TimeSeries {
  return { key, label, points: bucketSeries(context, facts, period, reduce) };
}

export function labelBucket(context: BiContext, key: string): string {
  return bucketLabel(key, context.granularity);
}

/** A drill-down that narrows the dashboard filters rather than replacing them. */
export function drillTo(title: string, filters: Partial<BiFilters>): DrillDown {
  return { title, filters };
}

/** A drill-down pinned to an explicit set of shipments. */
export function drillToShipments(title: string, facts: ShipmentFact[]): DrillDown {
  return { title, filters: {}, shipmentIds: facts.map((fact) => fact.shipmentId) };
}
