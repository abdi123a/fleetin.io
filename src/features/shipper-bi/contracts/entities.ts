import { z } from 'zod';
import {
  cargoTypeSchema,
  chargeTypeSchema,
  containerStatusSchema,
  containerTypeSchema,
  delayOwnerSchema,
  stageKeySchema,
} from './enums';

/**
 * The source-of-truth entities behind the control tower.
 *
 * These schemas are the contract with the backend: `fleetin-backend` will
 * mirror them as Prisma models, and every BI endpoint is an aggregation over
 * them. They live in the frontend today only because the backend domain schema
 * does not exist yet — nothing here is display state.
 *
 * The design principle: **store events and money, derive everything else.**
 * On-time rate, delay root cause, detention exposure and empty-return cycle
 * time are not columns; they are functions of `ShipmentEvent`, `Charge` and the
 * planned timestamps, computed in `lib/bi/derive.ts`. Storing a metric would
 * mean it drifts from the events that justify it.
 *
 * Timestamps are ISO-8601 strings, not `Date`. They cross the wire and go into
 * URLs; a string that is parsed at the point of use has one representation, a
 * `Date` has three.
 */

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/* ---------------------------------------------------------------------------
 * Dimensions — the things a metric is sliced by
 * ------------------------------------------------------------------------ */

export const transporterSchema = z.object({
  id: z.string(),
  name: z.string(),
  fleetCode: z.string(),
  /** Contractual on-time target, if one is agreed. Drives the bullet charts. */
  slaOnTimeTarget: z.number().min(0).max(1).optional(),
});
export type Transporter = z.infer<typeof transporterSchema>;

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  originName: z.string(),
  /**
   * Null when the place name doesn't resolve to a known point. Real shipments
   * store their locations as free text, so the backend's gazetteer can miss —
   * and a miss must read as "unknown", not as a coordinate. The map skips a
   * leg it can't place rather than drawing it somewhere it isn't.
   */
  originLat: z.number().nullable(),
  originLng: z.number().nullable(),
  destinationName: z.string(),
  destinationLat: z.number().nullable(),
  destinationLng: z.number().nullable(),
  distanceKm: z.number().nonnegative(),
  /** Planning baseline. ETA drift is measured against the plan, not against this. */
  nominalTransitHours: z.number().nonnegative(),
});
export type Route = z.infer<typeof routeSchema>;

export const depotSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Null when unresolved — same reason as `routeSchema`'s coordinates. */
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type Depot = z.infer<typeof depotSchema>;

export const vehicleSchema = z.object({
  id: z.string(),
  plateNumber: z.string(),
  transporterId: z.string(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

/* ---------------------------------------------------------------------------
 * Shipment
 * ------------------------------------------------------------------------ */

export const shipmentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  shipperId: z.string(),
  transporterId: z.string(),
  routeId: z.string(),
  vehicleId: z.string().optional(),
  containerId: z.string().optional(),
  /**
   * The `MSN-#####` of the job this container belongs to. A BI "shipment" is
   * one container's journey — a real `Booking` — and this is what opens the
   * shipment it sits under. Without it a row could only link to itself, which
   * is how the shipper's list came to send `SHP-0034` to `/shipments/34`.
   */
  parentReference: z.string().optional(),
  cargoType: cargoTypeSchema,
  weightKg: z.number().nonnegative(),

  /** What was promised. The denominator of every punctuality metric. */
  plannedPickupAt: isoDateTime,
  plannedDeliveryAt: isoDateTime,

  /** What happened. Absent until it does. */
  actualPickupAt: isoDateTime.optional(),
  actualDeliveryAt: isoDateTime.optional(),

  /**
   * Denormalised head of the event stream — the current stage and when it was
   * entered. Redundant with `ShipmentEvent`, and worth it: the map and the
   * pipeline read it on every poll, and replaying an event log per shipment to
   * answer "where is it now" does not scale.
   */
  currentStage: stageKeySchema,
  currentStageAt: isoDateTime,

  createdAt: isoDateTime,
});
export type Shipment = z.infer<typeof shipmentSchema>;

/* ---------------------------------------------------------------------------
 * The event spine
 * ------------------------------------------------------------------------ */

export const shipmentEventSchema = z.object({
  id: z.string(),
  shipmentId: z.string(),
  /** Monotonic per shipment. Ordering by timestamp alone breaks on backdating. */
  seq: z.number().int().nonnegative(),
  stage: stageKeySchema,

  /**
   * `occurredAt` is when it happened in the world; `recordedAt` is when the
   * system heard about it. They differ whenever a driver reports late, and the
   * gap is itself a data-quality signal worth surfacing. Metrics use
   * `occurredAt`; audit uses both.
   */
  occurredAt: isoDateTime,
  recordedAt: isoDateTime,

  actorType: z.enum(['driver', 'transporter', 'shipper', 'system', 'ops']),
  actorId: z.string().optional(),
  locationName: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  note: z.string().optional(),
});
export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

/* ---------------------------------------------------------------------------
 * Container
 * ------------------------------------------------------------------------ */

export const containerSchema = z.object({
  id: z.string(),
  containerNo: z.string(),
  type: containerTypeSchema,
  shippingLine: z.string(),
  shipmentId: z.string(),
  status: containerStatusSchema,

  /** Left the terminal. Everything before this can accrue demurrage. */
  gateOutAt: isoDateTime.optional(),
  deliveredAt: isoDateTime.optional(),
  /**
   * End of free time. The single most important date in the empty-return
   * section: demurrage accrues past it inside the terminal, detention past it
   * outside. Set by the shipping line, not by us.
   */
  freeTimeExpiresAt: isoDateTime,
  returnedAt: isoDateTime.optional(),
  depotId: z.string().optional(),
});
export type Container = z.infer<typeof containerSchema>;

/* ---------------------------------------------------------------------------
 * Delay attribution
 * ------------------------------------------------------------------------ */

export const delayAttributionSchema = z.object({
  id: z.string(),
  shipmentId: z.string(),
  /** The event the delay was noticed at, when there is one. */
  eventId: z.string().optional(),
  /** Which stage lost the time. */
  stage: stageKeySchema,
  delayMinutes: z.number().nonnegative(),
  owner: delayOwnerSchema,
  reasonCode: z.string(),
  note: z.string().optional(),
  /** Who made the attribution call, and when. Delay reports get disputed. */
  attributedBy: z.string().optional(),
  attributedAt: isoDateTime,
});
export type DelayAttribution = z.infer<typeof delayAttributionSchema>;

/* ---------------------------------------------------------------------------
 * Cost ledger
 * ------------------------------------------------------------------------ */

export const chargeSchema = z.object({
  id: z.string(),
  shipmentId: z.string(),
  containerId: z.string().optional(),
  transporterId: z.string(),
  type: chargeTypeSchema,
  /** Minor units are overkill for DJF, which has no subunit in practice. */
  amount: z.number(),
  currency: z.literal('DJF'),

  /**
   * The window the charge accrued over. Accessorials are per-day rates, so a
   * charge that spans a period boundary has to be attributable to both — an
   * `incurredAt` instant would silently drop half of it.
   */
  incurredFrom: isoDateTime,
  incurredTo: isoDateTime,

  invoiceId: z.string().optional(),
  status: z.enum(['estimated', 'invoiced', 'disputed', 'settled']),
});
export type Charge = z.infer<typeof chargeSchema>;

/* ---------------------------------------------------------------------------
 * Tracking & ETA
 * ------------------------------------------------------------------------ */

export const trackingPositionSchema = z.object({
  shipmentId: z.string(),
  vehicleId: z.string(),
  lat: z.number(),
  lng: z.number(),
  speedKph: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  recordedAt: isoDateTime,
});
export type TrackingPosition = z.infer<typeof trackingPositionSchema>;

/**
 * A prediction, kept rather than overwritten.
 *
 * Storing only the latest ETA answers "when will it arrive"; storing the series
 * answers "how early did we know", which is the question that tells you whether
 * the prediction is worth acting on.
 */
export const etaSnapshotSchema = z.object({
  shipmentId: z.string(),
  predictedArrivalAt: isoDateTime,
  computedAt: isoDateTime,
  source: z.enum(['gps_projection', 'historical_median', 'manual']),
  confidence: z.number().min(0).max(1),
});
export type EtaSnapshot = z.infer<typeof etaSnapshotSchema>;

/* ---------------------------------------------------------------------------
 * The whole dataset, as one object
 * ------------------------------------------------------------------------ */

/**
 * What `derive.ts` consumes. The mock generator produces one of these; the
 * backend will produce the same shape from a set of joined queries.
 */
export const biDatasetSchema = z.object({
  asOf: isoDateTime,
  shipperId: z.string(),
  transporters: z.array(transporterSchema),
  routes: z.array(routeSchema),
  depots: z.array(depotSchema),
  vehicles: z.array(vehicleSchema),
  shipments: z.array(shipmentSchema),
  events: z.array(shipmentEventSchema),
  containers: z.array(containerSchema),
  delays: z.array(delayAttributionSchema),
  charges: z.array(chargeSchema),
  positions: z.array(trackingPositionSchema),
  etaSnapshots: z.array(etaSnapshotSchema),
});
export type BiDataset = z.infer<typeof biDatasetSchema>;

export { isoDate, isoDateTime };
