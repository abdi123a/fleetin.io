import { z } from 'zod';
import {
  categorySliceSchema,
  distributionSchema,
  drillDownSchema,
  dumbbellRowSchema,
  heatmapSchema,
  histogramSchema,
  kpiMetricSchema,
  scatterPointSchema,
  sectionMetaSchema,
  stackedSeriesSchema,
  timeSeriesSchema,
  waterfallStepSchema,
} from './metrics';
import {
  containerStatusSchema,
  delayOwnerSchema,
  deliveryOutcomeSchema,
  stageKeySchema,
} from './enums';

/**
 * The seven endpoint responses.
 *
 * One rule holds throughout: **responses are chart-ready, never raw rows.**
 * Every field here is something a chart renders directly. The panel does no
 * grouping, no percentage maths and no sorting for display, because the moment
 * it does, the browser and the backend own two copies of the same business
 * definition and they drift.
 *
 *   GET /shippers/:id/bi/overview
 *   GET /shippers/:id/bi/operations
 *   GET /shippers/:id/bi/cost
 *   GET /shippers/:id/bi/delays
 *   GET /shippers/:id/bi/empty-returns
 *   GET /shippers/:id/bi/performance
 *   GET /shippers/:id/bi/shipments
 */

/* ---------------------------------------------------------------------------
 * Shared — the map is used by both Overview and Operations
 * ------------------------------------------------------------------------ */

/**
 * A shipment as the tracking map sees it.
 *
 * Carries its own risk score and stage so a marker can be styled without a
 * second lookup, and its planned arrival so the popup can state the variance
 * rather than just a time.
 */
export const liveShipmentSchema = z.object({
  shipmentId: z.string(),
  reference: z.string(),
  stage: stageKeySchema,
  transporterName: z.string(),
  routeName: z.string(),
  vehiclePlate: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  headingDegrees: z.number().optional(),
  lastPingAt: z.string(),
  /** 0–100. Drives marker colour and the alert ordering. */
  riskScore: z.number().min(0).max(100),
  etaAt: z.string().optional(),
  plannedArrivalAt: z.string(),
});
export type LiveShipment = z.infer<typeof liveShipmentSchema>;

/**
 * Framing for the map, computed from the data rather than guessed.
 *
 * A hardcoded centre and zoom is wrong the moment a shipper works a different
 * corridor; fitting to the bounds keeps the view honest for any of them.
 */
export const mapBoundsSchema = z.object({
  minLat: z.number(),
  minLng: z.number(),
  maxLat: z.number(),
  maxLng: z.number(),
});
export type MapBounds = z.infer<typeof mapBoundsSchema>;

/* ---------------------------------------------------------------------------
 * 1. Control Tower Overview
 * ------------------------------------------------------------------------ */

/**
 * The one shipment the control tower leads with.
 *
 * "Latest" means most recently created and still open — the thing an operator
 * would want a status on without going looking. `progress` is the fraction of
 * the lifecycle completed, so the bar means the same on every shipment
 * regardless of route length.
 */
export const spotlightShipmentSchema = z.object({
  shipmentId: z.string(),
  reference: z.string(),
  stage: stageKeySchema,
  stageLabel: z.string(),
  destinationName: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  progress: z.number().min(0).max(1),
  etaAt: z.string().optional(),
  isLate: z.boolean(),
});
export type SpotlightShipment = z.infer<typeof spotlightShipmentSchema>;

/**
 * The transporter currently carrying the most of this shipper's work.
 *
 * A spotlight, not a ranking — the full league table lives in Performance. It
 * is here because the overview should answer "who is moving my freight right
 * now" without a second click.
 */
export const spotlightTransporterSchema = z.object({
  transporterId: z.string(),
  name: z.string(),
  fleetCode: z.string(),
  /** Company logo; initials fall back when absent. */
  logoUrl: z.string().optional(),
  totalFleet: z.number().int().nonnegative(),
  deliveries: z.number().int().nonnegative(),
  onTimeRate: z.number().min(0).max(1),
  distanceKm: z.number().nonnegative(),
  /** The vehicle and driver on their most recent active run. */
  activeVehiclePlate: z.string().optional(),
  activeShipmentStage: z.string().optional(),
  driverName: z.string(),
  driverPhone: z.string(),
});
export type SpotlightTransporter = z.infer<typeof spotlightTransporterSchema>;

export const overviewSectionSchema = z.object({
  meta: sectionMetaSchema,

  /** Rendered in order: the six headline cards. */
  kpis: z.object({
    totalShipments: kpiMetricSchema,
    activeShipments: kpiMetricSchema,
    emptyReturnPending: kpiMetricSchema,
    onTimeRate: kpiMetricSchema,
    totalCost: kpiMetricSchema,
    costPerShipment: kpiMetricSchema,
  }),

  /** Where the active shipments are sitting right now. */
  activeByStage: z.array(categorySliceSchema),

  /**
   * Early / on-time / late. Shipped alongside the on-time percentage because
   * the percentage alone cannot distinguish "ten minutes late" from "two days".
   */
  deliveryOutcomes: z.array(
    categorySliceSchema.extend({ outcome: deliveryOutcomeSchema }),
  ),

  /**
   * Free-time headroom for containers still out — the urgency behind the
   * pending count. Buckets run overdue -> due soon -> comfortable.
   */
  returnHeadroom: z.array(categorySliceSchema),

  /** Average cost per cargo type; a per-category metric has no single value. */
  costByCargoType: z.array(categorySliceSchema),
  /** Trend for whichever cargo type the user selects, plus the blended line. */
  costByCargoTypeTrend: z.array(timeSeriesSchema),

  /** Spend per bucket, for the column chart on the spend card. */
  spendByBucket: z.array(categorySliceSchema),

  /** Everything the map needs: open shipments and a frame that fits them. */
  liveShipments: z.array(liveShipmentSchema),
  mapBounds: mapBoundsSchema,

  latestShipment: spotlightShipmentSchema.optional(),
  /** Top transporters by shipment volume, ranked — the Fleet card slides through these. */
  spotlightTransporters: z.array(spotlightTransporterSchema),
});
export type OverviewSection = z.infer<typeof overviewSectionSchema>;

/* ---------------------------------------------------------------------------
 * 2. Operations Visibility
 * ------------------------------------------------------------------------ */

export const pipelineStageSchema = z.object({
  stage: stageKeySchema,
  label: z.string(),
  count: z.number().int().nonnegative(),
  /** Cumulative count that has *ever* reached this stage, for funnel width. */
  reachedCount: z.number().int().nonnegative(),
  /** What makes a pipeline actionable: how long shipments sit here. */
  medianDwellHours: z.number().nonnegative(),
  p90DwellHours: z.number().nonnegative(),
  drillDown: drillDownSchema.optional(),
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const riskAlertSchema = z.object({
  shipmentId: z.string(),
  reference: z.string(),
  stage: stageKeySchema,
  transporterName: z.string(),
  routeName: z.string(),
  riskScore: z.number().min(0).max(100),
  severity: z.enum(['critical', 'warning', 'watch']),
  /** Why it is flagged, in the reader's words — not a rule id. */
  reason: z.string(),
  predictedDelayMinutes: z.number(),
  freeTimeHoursRemaining: z.number().optional(),
});
export type RiskAlert = z.infer<typeof riskAlertSchema>;

export const operationsSectionSchema = z.object({
  meta: sectionMetaSchema,
  pipeline: z.array(pipelineStageSchema),
  liveShipments: z.array(liveShipmentSchema),
  mapBounds: mapBoundsSchema,
  routePolylines: z.array(
    z.object({
      routeId: z.string(),
      label: z.string(),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
  ),
  /** Planned vs predicted arrival, one row per open shipment. */
  etaComparison: z.array(dumbbellRowSchema),
  etaSummary: z.object({
    onPlan: kpiMetricSchema,
    averageDriftMinutes: kpiMetricSchema,
  }),
  riskAlerts: z.array(riskAlertSchema),
  /** Counts by severity, for the strip above the table. */
  riskDistribution: z.array(categorySliceSchema),
});
export type OperationsSection = z.infer<typeof operationsSectionSchema>;

/* ---------------------------------------------------------------------------
 * 3. Cost Analytics
 * ------------------------------------------------------------------------ */

export const costSectionSchema = z.object({
  meta: sectionMetaSchema,
  kpis: z.object({
    totalCost: kpiMetricSchema,
    accessorialCost: kpiMetricSchema,
    detentionCost: kpiMetricSchema,
    demurrageCost: kpiMetricSchema,
  }),

  /** Cost over time, one series per charge type, plus the prior period. */
  costEvolution: z.array(timeSeriesSchema),
  costEvolutionPrevious: z.array(timeSeriesSchema).optional(),

  /** How the period's total is composed. */
  costBreakdown: z.array(waterfallStepSchema),
  /** The same money split by transporter, for comparison rather than anatomy. */
  costByTransporter: stackedSeriesSchema,

  /**
   * Detention and demurrage by transporter and week. A heatmap because the
   * question is "who does this to us repeatedly", which a total cannot answer.
   */
  detentionHeatmap: heatmapSchema,
  demurrageHeatmap: heatmapSchema,

  /** Cost of a late empty return against how late it was. */
  emptyReturnCostImpact: z.array(scatterPointSchema),
  emptyReturnCostTrend: z.array(timeSeriesSchema),
});
export type CostSection = z.infer<typeof costSectionSchema>;

/* ---------------------------------------------------------------------------
 * 4. Delay Analytics
 * ------------------------------------------------------------------------ */

export const paretoItemSchema = categorySliceSchema.extend({
  /** Running share of the total, 0–1. The line half of a Pareto chart. */
  cumulativeShare: z.number().min(0).max(1),
});
export type ParetoItem = z.infer<typeof paretoItemSchema>;

export const delaySectionSchema = z.object({
  meta: sectionMetaSchema,
  kpis: z.object({
    delayedShipments: kpiMetricSchema,
    totalDelayHours: kpiMetricSchema,
    medianDelayHours: kpiMetricSchema,
  }),

  /** Ranked causes with the cumulative line — the classic 80/20 read. */
  rootCauses: z.array(paretoItemSchema),
  /** Delay minutes by party over time; toggled absolute vs 100% in the UI. */
  responsibility: stackedSeriesSchema,
  /** Per owner, and per party — both offered, the chart picks one. */
  responsibilityTotals: z.array(
    categorySliceSchema.extend({ owner: delayOwnerSchema }),
  ),

  /** Duration as P50/P90/max per category. Averages hide the tail. */
  durationByOwner: z.array(distributionSchema),
  durationByStage: z.array(distributionSchema),

  delayTrend: z.array(timeSeriesSchema),
  delayTrendPrevious: z.array(timeSeriesSchema).optional(),
});
export type DelaySection = z.infer<typeof delaySectionSchema>;

/* ---------------------------------------------------------------------------
 * 5. Empty Return
 * ------------------------------------------------------------------------ */

export const emptyReturnSectionSchema = z.object({
  meta: sectionMetaSchema,
  kpis: z.object({
    pendingReturns: kpiMetricSchema,
    overdueReturns: kpiMetricSchema,
    medianCycleDays: kpiMetricSchema,
    onTimeReturnRate: kpiMetricSchema,
  }),

  statusCards: z.array(
    categorySliceSchema.extend({ status: containerStatusSchema }),
  ),
  /** Backlog over time — a static count cannot show a queue growing. */
  statusOverTime: stackedSeriesSchema,

  /** Cycle days with the free-time line drawn on it. */
  cycleTimeHistogram: histogramSchema,
  cycleTimeTrend: z.array(timeSeriesSchema),
  cycleTimeByRoute: z.array(distributionSchema),

  delayReasons: z.array(
    categorySliceSchema.extend({ owner: delayOwnerSchema }),
  ),
});
export type EmptyReturnSection = z.infer<typeof emptyReturnSectionSchema>;

/* ---------------------------------------------------------------------------
 * 6. Performance Analytics
 * ------------------------------------------------------------------------ */

export const transporterScorecardSchema = z.object({
  transporterId: z.string(),
  name: z.string(),
  fleetCode: z.string(),
  rank: z.number().int().positive(),
  shipments: z.number().int().nonnegative(),
  onTimeRate: z.number().min(0).max(1),
  /** Contractual target, when agreed — the marker on the bullet chart. */
  slaTarget: z.number().min(0).max(1).optional(),
  delayRate: z.number().min(0).max(1),
  medianDelayHours: z.number().nonnegative(),
  costPerShipment: z.number().nonnegative(),
  accessorialShare: z.number().min(0).max(1),
  drillDown: drillDownSchema.optional(),
});
export type TransporterScorecard = z.infer<typeof transporterScorecardSchema>;

export const performanceSectionSchema = z.object({
  meta: sectionMetaSchema,
  leaderboard: z.array(transporterScorecardSchema),
  /** x = on-time rate, y = cost per shipment, size = volume. */
  costVsReliability: z.array(scatterPointSchema),
  /** Median split, so the quadrant labels mean something for this dataset. */
  quadrantOrigin: z.object({ x: z.number(), y: z.number() }),
});
export type PerformanceSection = z.infer<typeof performanceSectionSchema>;

/* ---------------------------------------------------------------------------
 * 7. Reporting
 * ------------------------------------------------------------------------ */

export const shipmentRowSchema = z.object({
  shipmentId: z.string(),
  reference: z.string(),
  stage: stageKeySchema,
  stageLabel: z.string(),
  transporterName: z.string(),
  routeName: z.string(),
  containerNo: z.string().optional(),
  containerType: z.string().optional(),
  cargoType: z.string(),
  plannedDeliveryAt: z.string(),
  actualDeliveryAt: z.string().optional(),
  deliveryOutcome: deliveryOutcomeSchema.optional(),
  deliveryVarianceMinutes: z.number().optional(),
  totalDelayMinutes: z.number(),
  primaryDelayOwner: delayOwnerSchema.optional(),
  emptyReturnCycleDays: z.number().optional(),
  totalCost: z.number(),
  accessorialCost: z.number(),
  riskScore: z.number().optional(),
});
export type ShipmentRow = z.infer<typeof shipmentRowSchema>;

export const shipmentsSectionSchema = z.object({
  meta: sectionMetaSchema,
  rows: z.array(shipmentRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
});
export type ShipmentsSection = z.infer<typeof shipmentsSectionSchema>;
