import { z } from 'zod';
import { biFiltersSchema } from './filters';

/**
 * The envelopes every section response is built from.
 *
 * There is one KPI shape and a small set of series shapes, so the panel needs
 * one `KpiCard` and one drill-down hook rather than twenty-one bespoke ones.
 * Adding a metric to a section then costs a row in an aggregator, not a
 * component.
 */

/* ---------------------------------------------------------------------------
 * Drill-down
 * ------------------------------------------------------------------------ */

/**
 * Where clicking a mark takes you.
 *
 * Carried *with* the data rather than wired up in the component, so the
 * aggregator — which knows exactly which shipments produced the number — also
 * decides what the drill-down shows. A component cannot reconstruct that from a
 * rendered value without re-implementing the aggregation.
 */
export const drillDownSchema = z.object({
  title: z.string(),
  /** Narrowing applied on top of the dashboard filters, not replacing them. */
  filters: biFiltersSchema.partial(),
  /** Explicit ids when the selection is not expressible as a filter. */
  shipmentIds: z.array(z.string()).optional(),
});
export type DrillDown = z.infer<typeof drillDownSchema>;

/* ---------------------------------------------------------------------------
 * KPI
 * ------------------------------------------------------------------------ */

export const metricUnitSchema = z.enum([
  'count',
  'percent',
  'currency',
  'days',
  'hours',
  'minutes',
]);
export type MetricUnit = z.infer<typeof metricUnitSchema>;

/**
 * Which direction is good.
 *
 * Cost going up and on-time rate going up are both "up", and colouring them the
 * same is how a dashboard ends up celebrating a demurrage spike. The aggregator
 * states the polarity; the card derives the colour from it.
 */
export const metricPolaritySchema = z.enum(['higher_is_better', 'lower_is_better', 'neutral']);
export type MetricPolarity = z.infer<typeof metricPolaritySchema>;

export const trendPointSchema = z.object({
  /** Bucket start, YYYY-MM-DD. */
  t: z.string(),
  v: z.number(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const kpiMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  unit: metricUnitSchema,
  polarity: metricPolaritySchema,

  /** Same metric over the comparison window. Absent when compare is off. */
  previousValue: z.number().optional(),
  /** Fractional change, e.g. 0.082 for +8.2%. Absent when the base is zero. */
  deltaPct: z.number().optional(),

  /** Sparkline series. Empty array renders the card without a plot. */
  trend: z.array(trendPointSchema),
  /** Prior-period sparkline, aligned to `trend` by index. */
  previousTrend: z.array(trendPointSchema).optional(),

  /** One short clause of context — never a restatement of the number. */
  caption: z.string().optional(),
  drillDown: drillDownSchema.optional(),
});
export type KpiMetric = z.infer<typeof kpiMetricSchema>;

/* ---------------------------------------------------------------------------
 * Series
 * ------------------------------------------------------------------------ */

/** One bar / slice / point: a label, a value, and where it came from. */
export const categorySliceSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  /**
   * Overrides the positional colour. Set only where the category *means*
   * something — an outcome, a status — so it wears the status scale instead of
   * a series hue. Left unset, the chart assigns by position.
   */
  intent: z.enum(['good', 'warning', 'critical', 'neutral']).optional(),
  drillDown: drillDownSchema.optional(),
});
export type CategorySlice = z.infer<typeof categorySliceSchema>;

/** A named series of time-bucketed points. */
export const timeSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  points: z.array(trendPointSchema),
});
export type TimeSeries = z.infer<typeof timeSeriesSchema>;

/** Rows of a stacked chart: one bucket, one value per series key. */
export const stackedPointSchema = z.object({
  t: z.string(),
  label: z.string(),
  values: z.record(z.string(), z.number()),
});
export type StackedPoint = z.infer<typeof stackedPointSchema>;

export const stackedSeriesSchema = z.object({
  seriesKeys: z.array(z.object({ key: z.string(), label: z.string() })),
  points: z.array(stackedPointSchema),
});
export type StackedSeries = z.infer<typeof stackedSeriesSchema>;

/**
 * A distribution summarised by its quantiles rather than its mean.
 *
 * Delay and dwell data is long-tailed: the mean sits below the P90 and reports
 * a healthy number while a tenth of shipments are catastrophic. Every duration
 * in this dashboard ships as a range, not an average.
 */
export const distributionSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  p50: z.number(),
  p90: z.number(),
  max: z.number(),
  mean: z.number(),
  drillDown: drillDownSchema.optional(),
});
export type Distribution = z.infer<typeof distributionSchema>;

/** A bucketed histogram, with an optional threshold worth drawing a line at. */
export const histogramSchema = z.object({
  bins: z.array(
    z.object({
      /** Bucket lower bound, inclusive. */
      from: z.number(),
      /** Upper bound, exclusive. `null` on the open-ended final bin. */
      to: z.number().nullable(),
      label: z.string(),
      count: z.number().int().nonnegative(),
      /** True once the bin sits past `thresholdValue`. */
      breach: z.boolean(),
    }),
  ),
  thresholdValue: z.number().optional(),
  thresholdLabel: z.string().optional(),
});
export type Histogram = z.infer<typeof histogramSchema>;

/** A point in a scatter / quadrant chart. */
export const scatterPointSchema = z.object({
  key: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  /** Bubble weight — volume, almost always. */
  size: z.number().nonnegative(),
  drillDown: drillDownSchema.optional(),
});
export type ScatterPoint = z.infer<typeof scatterPointSchema>;

/** One cell of a heatmap. */
export const heatCellSchema = z.object({
  row: z.string(),
  column: z.string(),
  value: z.number(),
  drillDown: drillDownSchema.optional(),
});
export type HeatCell = z.infer<typeof heatCellSchema>;

export const heatmapSchema = z.object({
  rows: z.array(z.object({ key: z.string(), label: z.string() })),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  cells: z.array(heatCellSchema),
  max: z.number(),
});
export type Heatmap = z.infer<typeof heatmapSchema>;

/**
 * One step of a waterfall.
 *
 * `start`/`end` are pre-computed rather than left to the chart: the running
 * balance is aggregation logic, and a component that recomputes it will
 * disagree with the totals shown elsewhere the moment a step is filtered out.
 */
export const waterfallStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  amount: z.number(),
  start: z.number(),
  end: z.number(),
  kind: z.enum(['base', 'increase', 'decrease', 'total']),
  drillDown: drillDownSchema.optional(),
});
export type WaterfallStep = z.infer<typeof waterfallStepSchema>;

/** Planned vs actual/predicted, as one row of a dumbbell chart. */
export const dumbbellRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  sublabel: z.string().optional(),
  plannedAt: z.string(),
  predictedAt: z.string(),
  /** Signed minutes: negative is ahead of plan. */
  varianceMinutes: z.number(),
  drillDown: drillDownSchema.optional(),
});
export type DumbbellRow = z.infer<typeof dumbbellRowSchema>;

/* ---------------------------------------------------------------------------
 * Section envelope
 * ------------------------------------------------------------------------ */

/**
 * Wraps every section response.
 *
 * `generatedAt` and `shipmentCount` let a card say what it is describing, and
 * make a stale or empty panel obvious instead of silently showing zeros.
 */
export const sectionMetaSchema = z.object({
  generatedAt: z.string(),
  shipmentCount: z.number().int().nonnegative(),
  comparisonApplied: z.boolean(),
});
export type SectionMeta = z.infer<typeof sectionMetaSchema>;
