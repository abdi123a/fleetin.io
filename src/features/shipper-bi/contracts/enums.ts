import { z } from 'zod';

/**
 * The vocabulary of the control tower.
 *
 * Every chart in the dashboard groups by one of these enums, so they are fixed
 * here once rather than restated per feature. They are also the enums the
 * backend will mirror in Prisma — changing a member here is a schema change,
 * not a display tweak.
 */

/* ---------------------------------------------------------------------------
 * Shipment lifecycle
 * ------------------------------------------------------------------------ */

/**
 * The operational stages a shipment passes through, in order.
 *
 * Used twice, deliberately: as the pipeline in Operations, and as the axis a
 * delay is attributed to in Delay Analytics. "Where did we lose the time?" and
 * "where is the shipment now?" have to be answerable in the same terms.
 *
 * Order is meaningful — `STAGE_ORDER` indexes it, and the ordinal chart ramp
 * colours by position. Never re-order without checking both.
 */
export const STAGE_KEYS = [
  'created',
  'documentation',
  'dispatched',
  'gate_in',
  'picked_up',
  'in_transit',
  'arrived',
  'unloading',
  'delivered',
  'empty_awaiting',
  'empty_returned',
] as const;

export const stageKeySchema = z.enum(STAGE_KEYS);
export type StageKey = z.infer<typeof stageKeySchema>;

/** Position of a stage in the lifecycle, for progress and dwell-time maths. */
export const STAGE_ORDER: Record<StageKey, number> = Object.fromEntries(
  STAGE_KEYS.map((key, index) => [key, index]),
) as Record<StageKey, number>;

export const STAGE_LABELS: Record<StageKey, string> = {
  created: 'Created',
  documentation: 'Documentation',
  dispatched: 'Dispatched',
  gate_in: 'Gate In',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  arrived: 'Arrived',
  unloading: 'Unloading',
  delivered: 'Delivered',
  empty_awaiting: 'Empty Awaiting',
  empty_returned: 'Empty Returned',
};

/** A shipment is "open" until the container comes back, not merely delivered. */
export const TERMINAL_STAGE: StageKey = 'empty_returned';

/* ---------------------------------------------------------------------------
 * Delay attribution
 * ------------------------------------------------------------------------ */

/**
 * Who owns a delay.
 *
 * The scoping sheet lists causes in prose ("shipper documentation, shipper
 * depotage, shipper communication, or transporter delays"); this normalises
 * them so responsibility can be summed, ranked and charged back.
 *
 * Attribution is a *stored decision* on `DelayAttribution`, never inferred at
 * query time — a delay report that changes when you re-run it cannot be used
 * to hold a transporter to account.
 */
export const DELAY_OWNERS = [
  'shipper_documentation',
  'shipper_depotage',
  'shipper_communication',
  'transporter',
  'customs',
  'port_terminal',
  'shipping_line',
  'force_majeure',
] as const;

export const delayOwnerSchema = z.enum(DELAY_OWNERS);
export type DelayOwner = z.infer<typeof delayOwnerSchema>;

export const DELAY_OWNER_LABELS: Record<DelayOwner, string> = {
  shipper_documentation: 'Shipper — Documentation',
  shipper_depotage: 'Shipper — Depotage',
  shipper_communication: 'Shipper — Communication',
  transporter: 'Transporter',
  customs: 'Customs',
  port_terminal: 'Port / Terminal',
  shipping_line: 'Shipping Line',
  force_majeure: 'Force Majeure',
};

/**
 * The side accountable for a delay owner.
 *
 * Only three parties operate in this system: the shipper (cargo owner), the
 * transporter (moves the freight), and Fleetin (owns and runs the platform).
 * Fine-grained owners still exist for drill-down; charts and the dashboard
 * roll them up to these three so "who caused the delay" stays answerable.
 */
export const DELAY_PARTIES = ['shipper', 'transporter', 'fleetin'] as const;

export const delayPartySchema = z.enum(DELAY_PARTIES);
export type DelayParty = z.infer<typeof delayPartySchema>;

export const DELAY_OWNER_PARTY: Record<DelayOwner, DelayParty> = {
  shipper_documentation: 'shipper',
  shipper_depotage: 'shipper',
  shipper_communication: 'shipper',
  transporter: 'transporter',
  // Platform / coordination side — Fleetin owns the system that attributes
  // and remediates these, so they sit on Fleetin's share of delay.
  customs: 'fleetin',
  port_terminal: 'fleetin',
  shipping_line: 'fleetin',
  force_majeure: 'fleetin',
};

export const DELAY_PARTY_LABELS: Record<DelayParty, string> = {
  shipper: 'Shipper',
  transporter: 'Transporter',
  fleetin: 'Fleetin',
};

/* ---------------------------------------------------------------------------
 * Cost
 * ------------------------------------------------------------------------ */

/**
 * Charge lines on a shipment.
 *
 * `detention` and `demurrage` are separate members on purpose — the scoping
 * sheet treats them as one line, but they accrue in different places, are owed
 * to different parties, and are avoided by different fixes:
 *
 *   demurrage — container still *inside* the terminal past its free days,
 *               billed by the shipping line
 *   detention — container *outside* the terminal past its free time, i.e. held
 *               at the consignee or in transit back to the depot
 *
 * Merging them hides which of the two is actually bleeding money.
 */
export const CHARGE_TYPES = [
  'base_freight',
  'waiting',
  'detention',
  'demurrage',
  'storage',
  'handling',
  'extra',
] as const;

export const chargeTypeSchema = z.enum(CHARGE_TYPES);
export type ChargeType = z.infer<typeof chargeTypeSchema>;

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  base_freight: 'Base Freight',
  waiting: 'Waiting',
  detention: 'Detention',
  demurrage: 'Demurrage',
  storage: 'Storage',
  handling: 'Handling',
  extra: 'Extra Charges',
};

/** Charges the shipper could have avoided — the ones worth a dashboard. */
export const PENALTY_CHARGE_TYPES: ChargeType[] = [
  'waiting',
  'detention',
  'demurrage',
  'storage',
];

/* ---------------------------------------------------------------------------
 * Container
 * ------------------------------------------------------------------------ */

export const CONTAINER_STATUSES = [
  'in_transit',
  'delivered',
  'awaiting_return',
  'return_in_progress',
  'returned',
] as const;

export const containerStatusSchema = z.enum(CONTAINER_STATUSES);
export type ContainerStatus = z.infer<typeof containerStatusSchema>;

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  in_transit: 'In Transit',
  delivered: 'Delivered',
  awaiting_return: 'Awaiting Return',
  return_in_progress: 'Return In Progress',
  returned: 'Returned',
};

export const CONTAINER_TYPES = ['20GP', '40GP', '40HC', '20RF', '40RF', 'FLATBED'] as const;

export const containerTypeSchema = z.enum(CONTAINER_TYPES);
export type ContainerType = z.infer<typeof containerTypeSchema>;

/* ---------------------------------------------------------------------------
 * Delivery outcome
 * ------------------------------------------------------------------------ */

/**
 * Three buckets, not two.
 *
 * A single on-time percentage hides whether the misses are ten minutes or two
 * days, and hides chronic *early* arrival — which sounds harmless but means
 * trucks waiting at a closed gate, which is what waiting charges are.
 */
export const DELIVERY_OUTCOMES = ['early', 'on_time', 'late'] as const;

export const deliveryOutcomeSchema = z.enum(DELIVERY_OUTCOMES);
export type DeliveryOutcome = z.infer<typeof deliveryOutcomeSchema>;

export const DELIVERY_OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  early: 'Early',
  on_time: 'On Time',
  late: 'Late',
};

/* ---------------------------------------------------------------------------
 * Cargo
 * ------------------------------------------------------------------------ */

export const CARGO_TYPES = [
  'General Cargo',
  'Refrigerated',
  'Hazardous',
  'Bulk',
  'Bulky Goods',
  'Vehicles',
  'Construction',
] as const;

export const cargoTypeSchema = z.enum(CARGO_TYPES);
export type CargoType = z.infer<typeof cargoTypeSchema>;
