/**
 * Closed vocabularies of the transporter domain.
 *
 * The same role `shipper-bi/contracts/enums.ts` plays for the shipper suite,
 * but seen from the carrier's seat: a trip lifecycle instead of a container
 * lifecycle, delay causes named after what a dispatcher has to go fix, and the
 * fleet states the utilisation maths stands on.
 *
 * Plain const tuples rather than zod: the mock generator is the only producer
 * today, and schemas can arrive with the backend contract without changing a
 * single consumer of these types.
 */

/* ---------------------------------------------------------------------------
 * Trip lifecycle
 * ------------------------------------------------------------------------ */

export const TRIP_STATUSES = [
  'scheduled',
  'loading',
  'enroute',
  'at_destination',
  'returning',
  'completed',
  'cancelled',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  scheduled: 'Scheduled',
  loading: 'Loading',
  enroute: 'En Route',
  at_destination: 'At Destination',
  returning: 'Returning',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Statuses that mean the vehicle is committed to the job right now. */
export const OPEN_TRIP_STATUSES: readonly TripStatus[] = [
  'scheduled',
  'loading',
  'enroute',
  'at_destination',
  'returning',
];

/* ---------------------------------------------------------------------------
 * Delay causes and responsibility
 * ------------------------------------------------------------------------ */

export const DELAY_CAUSES = [
  'port_congestion',
  'customs_clearance',
  'loading_slot',
  'unloading_slot',
  'documentation',
  'mechanical',
  'traffic',
  'weather',
] as const;
export type DelayCause = (typeof DELAY_CAUSES)[number];

export const DELAY_CAUSE_LABELS: Record<DelayCause, string> = {
  port_congestion: 'Port congestion',
  customs_clearance: 'Customs clearance',
  loading_slot: 'Loading slot',
  unloading_slot: 'Unloading slot',
  documentation: 'Documentation',
  mechanical: 'Mechanical',
  traffic: 'Road & traffic',
  weather: 'Weather',
};

export const DELAY_PARTIES = ['transporter', 'port', 'customs', 'customer', 'other'] as const;
export type DelayParty = (typeof DELAY_PARTIES)[number];

export const DELAY_PARTY_LABELS: Record<DelayParty, string> = {
  transporter: 'Transporter (us)',
  port: 'Port',
  customs: 'Customs',
  customer: 'Customer',
  other: 'Other / external',
};

/**
 * Who answers for each cause when the delay review happens. Kept as data so
 * the responsibility split and the root-cause chart can never disagree.
 */
export const DELAY_CAUSE_PARTY: Record<DelayCause, DelayParty> = {
  port_congestion: 'port',
  customs_clearance: 'customs',
  loading_slot: 'customer',
  unloading_slot: 'customer',
  documentation: 'other',
  mechanical: 'transporter',
  traffic: 'other',
  weather: 'other',
};

/* ---------------------------------------------------------------------------
 * Waiting locations
 * ------------------------------------------------------------------------ */

export const WAITING_LOCATIONS = ['port', 'border', 'loading_site', 'unloading_site'] as const;
export type WaitingLocation = (typeof WAITING_LOCATIONS)[number];

export const WAITING_LOCATION_LABELS: Record<WaitingLocation, string> = {
  port: 'Port gate & yard',
  border: 'Galafi border',
  loading_site: 'Loading site',
  unloading_site: 'Unloading site',
};

/* ---------------------------------------------------------------------------
 * Equipment
 * ------------------------------------------------------------------------ */

export const CONTAINER_TYPES = ['dry_20', 'dry_40', 'hc_40', 'reefer_40', 'flatbed'] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  dry_20: "20' Dry",
  dry_40: "40' Dry",
  hc_40: "40' High Cube",
  reefer_40: "40' Reefer",
  flatbed: 'Flatbed',
};

export const TRUCK_TYPES = ['container', 'flatbed', 'reefer'] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

export const TRUCK_TYPE_LABELS: Record<TruckType, string> = {
  container: 'Container truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
};

/* ---------------------------------------------------------------------------
 * Fleet states — what a vehicle-day was spent on
 * ------------------------------------------------------------------------ */

export const FLEET_STATES = ['active', 'idle', 'maintenance'] as const;
export type FleetState = (typeof FLEET_STATES)[number];

export const FLEET_STATE_LABELS: Record<FleetState, string> = {
  active: 'Active',
  idle: 'Idle',
  maintenance: 'Maintenance',
};

/* ---------------------------------------------------------------------------
 * Backhaul — how the return leg ended (or is about to)
 * ------------------------------------------------------------------------ */

export const BACKHAUL_STATUSES = ['matched', 'empty', 'pending'] as const;
export type BackhaulStatus = (typeof BACKHAUL_STATUSES)[number];

export const BACKHAUL_STATUS_LABELS: Record<BackhaulStatus, string> = {
  matched: 'Backhaul matched',
  empty: 'Returned empty',
  pending: 'No return load yet',
};

/* ---------------------------------------------------------------------------
 * Payments
 * ------------------------------------------------------------------------ */

export const PAYMENT_STATUSES = ['paid', 'pending', 'overdue'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
};

/**
 * Receivables aging, bucketed by days past due. `current` is not yet due —
 * outstanding but healthy — so the aging chart separates "waiting" from
 * "chasing".
 */
export const AGING_BUCKETS = ['current', 'b1_15', 'b16_30', 'b31_45', 'b46_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: 'Not yet due',
  b1_15: '1–15 days overdue',
  b16_30: '16–30 days overdue',
  b31_45: '31–45 days overdue',
  b46_plus: '46+ days overdue',
};

/* ---------------------------------------------------------------------------
 * Load offers
 * ------------------------------------------------------------------------ */

export const OFFER_OUTCOMES = ['accepted', 'declined', 'expired'] as const;
export type OfferOutcome = (typeof OFFER_OUTCOMES)[number];

export const OFFER_OUTCOME_LABELS: Record<OfferOutcome, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};
