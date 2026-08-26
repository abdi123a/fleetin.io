import type { ShipmentTimelineStepRecord } from '@/features/shipments/api/shipmentsService';

/**
 * The mission lifecycle the shipper's reports are written in.
 *
 * One canonical ladder, taken from the reporting specification:
 *
 * ```
 * Mission Assigned → Left for Loading → Arrived at Pickup → Loading Started →
 * Loading Completed → Left for Drop-off → Arrived at Drop-off →
 * Unloading Started → Unloading Completed / Container Delivered → Dépotage →
 * Empty Ready → Empty Picked Up → Empty Return (the mission ends here)
 * ```
 *
 * Every rung is a **recorded event**, so every duration in either report is a
 * subtraction of two timestamps rather than a figure somebody typed. Dépotage
 * is deliberately not a rung of its own: it is the interval between the
 * container being delivered and the empty being ready, which is why
 * `EMPTY_READY` carries `intervalLabel: 'Dépotage'` — the gap into that row
 * *is* the client's dépotage time.
 *
 * The operational ladder the system actually runs on is the booking's status
 * timeline (`timeline[].key`); this module is the single translation between
 * the two vocabularies, so a rename on either side has exactly one edit site.
 */

export type MissionStageKey =
  | 'assigned'
  | 'left_for_loading'
  | 'arrived_pickup'
  | 'loading_started'
  | 'loading_completed'
  | 'left_for_dropoff'
  | 'arrived_dropoff'
  | 'unloading_started'
  | 'container_delivered'
  | 'empty_ready'
  | 'empty_picked_up'
  | 'empty_returned'
  | 'mission_closed';

/**
 * Which chapter of the job a rung belongs to.
 *
 * Four, not twelve: a reader takes in "the pickup leg took four hours" long
 * before they take in eight timestamps, so the report groups the ladder and
 * lets the milestones sit underneath their own chapter.
 */
export type MissionPhase = 'pickup' | 'transit' | 'delivery' | 'container';

export const MISSION_PHASE_LABELS: Record<MissionPhase, string> = {
  pickup: 'Pickup leg',
  transit: 'Transit',
  delivery: 'Delivery',
  container: 'Container cycle',
};

/** Chapter order, for grouping a timeline without sorting strings. */
export const MISSION_PHASE_ORDER: readonly MissionPhase[] = [
  'pickup',
  'transit',
  'delivery',
  'container',
] as const;

export interface MissionStageDefinition {
  key: MissionStageKey;
  label: string;
  /** Read under the label where the plain name needs the specification's wording. */
  note?: string;
  /**
   * The party the stage waits on. Only named where accountability is real: a
   * truck's departure is the transporter's, dépotage is the client's, and
   * nobody "owns" the moment a mission is closed in the system.
   */
  responsible?: string;
  phase: MissionPhase;
  /**
   * Names the interval that *ends* at this rung, where the specification gives
   * that interval its own name. The only one is dépotage.
   */
  intervalLabel?: string;
  /** Containerized missions only — a flatbed never owes an empty back. */
  containerOnly?: boolean;
}

export const MISSION_STAGES: readonly MissionStageDefinition[] = [
  { key: 'assigned', label: 'Mission Assigned', phase: 'pickup' },
  { key: 'left_for_loading', label: 'Left for Loading', responsible: 'Transporter', phase: 'pickup' },
  { key: 'arrived_pickup', label: 'Arrived at Pickup', responsible: 'Transporter', phase: 'pickup' },
  { key: 'loading_started', label: 'Loading Started', responsible: 'Port / Terminal', phase: 'pickup' },
  { key: 'loading_completed', label: 'Loading Completed', responsible: 'Port / Terminal', phase: 'pickup' },
  { key: 'left_for_dropoff', label: 'Left for Drop-off', responsible: 'Transporter', phase: 'transit' },
  { key: 'arrived_dropoff', label: 'Arrived at Drop-off', responsible: 'Transporter', phase: 'transit' },
  { key: 'unloading_started', label: 'Unloading Started', responsible: 'Client / Shipper', phase: 'delivery' },
  {
    key: 'container_delivered',
    label: 'Container Delivered',
    note: 'unloading completed',
    responsible: 'Client / Shipper',
    phase: 'delivery',
  },
  {
    key: 'empty_ready',
    label: 'Empty Ready',
    note: 'dépotage completed',
    responsible: 'Client / Shipper',
    phase: 'container',
    intervalLabel: 'Dépotage',
    containerOnly: true,
  },
  {
    /* The truck has the empty and is running it back. Recorded on the booking
       since 2026-08-26 ("Empty Picked Up"); without a stage of its own the
       report folded the whole return into one interval and could not say how
       much of it was the box waiting versus the box travelling. */
    key: 'empty_picked_up',
    label: 'Empty Picked Up',
    responsible: 'Transporter',
    phase: 'container',
    intervalLabel: 'Empty waiting',
    containerOnly: true,
  },
  {
    key: 'empty_returned',
    label: 'Empty Return',
    responsible: 'Transporter',
    phase: 'container',
    containerOnly: true,
  },
  { key: 'mission_closed', label: 'Mission Closed', phase: 'container' },
] as const;

export const MISSION_STAGE_BY_KEY: ReadonlyMap<MissionStageKey, MissionStageDefinition> = new Map(
  MISSION_STAGES.map((stage) => [stage.key, stage]),
);

/**
 * Booking-timeline keys that stamp each rung, in fallback order.
 *
 * `assigned` accepts three: the ladder stamps the vehicle and the driver
 * separately, and a booking created with both already attached only has its
 * creation step — all three mean "the mission became somebody's job".
 */
const TIMELINE_KEYS: Record<MissionStageKey, readonly string[]> = {
  assigned: ['vehicle_assignment', 'driver_assignment', 'creation'],
  left_for_loading: ['left_for_pickup'],
  arrived_pickup: ['gate_in'],
  loading_started: ['loading_start'],
  loading_completed: ['pickup'],
  left_for_dropoff: ['departure'],
  arrived_dropoff: ['arrival'],
  unloading_started: ['unloading_start'],
  container_delivered: ['pod_upload'],
  // Both come from the empty-return cycle, never from the booking's ladder.
  empty_ready: [],
  empty_picked_up: ['empty_picked_up'],
  empty_returned: [],
  mission_closed: ['completion'],
};

/** Epoch milliseconds per rung. Absent key = the event has not happened. */
export type MissionEvents = Partial<Record<MissionStageKey, number>>;

const toMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * First recorded timestamp per timeline key.
 *
 * First, not last: a booking that Empty Returns re-forces to "Assigned" runs
 * the ladder a second time, and the mission this report describes is the
 * original pass.
 */
function firstTimestampByKey(steps: readonly ShipmentTimelineStepRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const step of steps) {
    if (!step.timestamp) continue;
    const existing = map.get(step.key);
    if (!existing || step.timestamp < existing) map.set(step.key, step.timestamp);
  }

  /*
   * Legacy shim: before the ladder tracked the pickup leg, the "Unloading"
   * status stamped a `gate_in` step — which reads as waiting at the pickup
   * terminal for time actually spent unloading at the destination. A gate-in
   * recorded *after* the arrival event can only be that old mapping.
   */
  const gateIn = map.get('gate_in');
  const arrival = map.get('arrival');
  if (gateIn && arrival && gateIn > arrival) {
    if (!map.has('unloading_start')) map.set('unloading_start', gateIn);
    map.delete('gate_in');
  }
  return map;
}

export interface MissionEventSources {
  timeline?: readonly ShipmentTimelineStepRecord[];
  /** The empty-return cycle's own two events — the container half of the mission. */
  emptyReadyAt?: string | null;
  returnedAt?: string | null;
  /** Closing stamp on the booking itself, when the ladder has no `completion` step. */
  completedAt?: string | null;
}

/**
 * Recorded events → the lifecycle's twelve rungs.
 *
 * The cycle's timestamps are written last and unconditionally: they belong to
 * the same clock as the ladder's, and they are the only record of the empty
 * ever being ready or coming back.
 */
export function missionEventsFromTimeline(sources: MissionEventSources): MissionEvents {
  const byKey = firstTimestampByKey(sources.timeline ?? []);
  const events: MissionEvents = {};

  for (const stage of MISSION_STAGES) {
    for (const key of TIMELINE_KEYS[stage.key]) {
      const at = toMs(byKey.get(key) ?? null);
      if (at !== null) {
        events[stage.key] = at;
        break;
      }
    }
  }

  const emptyReadyAt = toMs(sources.emptyReadyAt);
  if (emptyReadyAt !== null) events.empty_ready = emptyReadyAt;
  const returnedAt = toMs(sources.returnedAt);
  if (returnedAt !== null) events.empty_returned = returnedAt;
  if (events.mission_closed === undefined) {
    const completedAt = toMs(sources.completedAt);
    if (completedAt !== null) events.mission_closed = completedAt;
  }

  return events;
}
