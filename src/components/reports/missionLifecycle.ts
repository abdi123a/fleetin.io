import type { ShipmentTimelineStepRecord } from '@/features/shipments/api/shipmentsService';
import { SHIPMENT_STEPS, shipmentStepsFor } from '@/lib/shipmentStatus';

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

/* ═══════════════════════════════════════════════════════════════════════════
 * The journey — the shipment's own steps
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * What the report draws, as opposed to what it measures.
 *
 * The thirteen rungs above are the measuring instrument: every KPI in the
 * report is a subtraction of two of them. They are **not** thirteen recorded
 * events. Since the user cut the picker to the steps in `SHIPMENT_STEPS`
 * (2026-08-26) an operator reports one step and `ladderPathTo` walks the rungs
 * underneath it, writing every one at *the same instant* — so "Left for
 * Loading", "Arrived at Pickup" and "Loading Started" are three rows carrying
 * one timestamp and two zero-length gaps, and on a mission still early in its
 * life they are ten greyed-out `pending` rows under one real one.
 *
 * So the journey is drawn on the vocabulary the operator actually records:
 * one row per step of `SHIPMENT_STEPS`, stamped by the rung that tops its
 * group — which is the rung the step writes, and therefore the only one in the
 * group whose timestamp means anything.
 */
export type JourneyStepKey =
  | 'created'
  | 'picked_up'
  | 'delivered'
  | 'depotage'
  | 'empty_ready'
  | 'empty_picked_up'
  | 'empty_returned';



export interface JourneyStepDefinition {
  key: JourneyStepKey;
  /** The step's name, taken verbatim from the picker the operator uses. */
  label: string;
  /** The stage whose timestamp stamps this step. */
  stage: MissionStageKey;
  /** A second stage accepted when the first was never written. */
  fallbackStage?: MissionStageKey;
  /** What the step means, in the shipper's words — read under the label. */
  caption: string;
  /** Who the step waits on, where accountability is real. */
  responsible?: string;
  /** Names the interval that *ends* here, where it has a name of its own. */
  intervalLabel?: string;
  /** Containerized missions only — a flatbed never owes an empty back. */
  containerOnly?: boolean;
  /**
   * How the step reads on a load carrying no container. Only the closing step
   * needs it: a flatbed still finishes, it just finishes by being delivered
   * rather than by a box coming home, so its name, its meaning and the name of
   * the interval into it are all different.
   */
  withoutContainer?: Partial<
    Pick<JourneyStepDefinition, 'label' | 'caption' | 'responsible' | 'intervalLabel'>
  >;
}

/**
 * Ladder rung (`SHIPMENT_STEPS[].rung`) → everything the journey knows about
 * that step, bar its name.
 *
 * Keyed by rung rather than by label or by position. By label, because the user
 * has renamed these once already and a rename would silently unhook the table;
 * by position, because an earlier cut of this paired `SHIPMENT_STEPS[i]` with
 * `Object.keys(detail)[i]` and would have re-labelled every step from the
 * insertion point on if either list were ever reordered. The rung is the one
 * value on both sides that is a stable identifier.
 */
const JOURNEY_BY_RUNG: Record<
  string,
  Omit<JourneyStepDefinition, 'label'> | undefined
> = {
  Pending: { key: 'created', stage: 'assigned', caption: 'booking assigned to a transporter' },
  Loaded: {
    key: 'picked_up',
    stage: 'loading_completed',
    caption: 'container loaded and off the terminal',
    responsible: 'Transporter',
    intervalLabel: 'Pickup leg',
  },
  Arrived: {
    key: 'delivered',
    stage: 'arrived_dropoff',
    caption: 'truck at the consignee',
    responsible: 'Transporter',
    intervalLabel: 'Transit',
  },
  'POD Submitted': {
    key: 'depotage',
    stage: 'container_delivered',
    caption: 'POD submitted — stripping starts',
    responsible: 'Client / Shipper',
    intervalLabel: 'Unloading',
  },
  'Empty Ready': {
    key: 'empty_ready',
    stage: 'empty_ready',
    caption: 'box stripped — the detention clock is running',
    responsible: 'Client / Shipper',
    intervalLabel: 'Dépotage',
    containerOnly: true,
  },
  'Empty Picked Up': {
    key: 'empty_picked_up',
    stage: 'empty_picked_up',
    caption: 'a truck has the empty and is running it back',
    responsible: 'Transporter',
    intervalLabel: 'Empty waiting',
    containerOnly: true,
  },
  /* Not `containerOnly`: this is the step every mission ends on. A box comes
     home and the rung is `empty_returned`; a flatbed has no box to bring back,
     so the same step is stamped by `mission_closed` and reads as "Completed" —
     which is what `displayShipmentStatus` already calls it at shipment level. */
  Completed: {
    key: 'empty_returned',
    stage: 'empty_returned',
    /* A load with no container closes on `Completed` itself, which the
       lifecycle records as `mission_closed`, never as an empty coming back. */
    fallbackStage: 'mission_closed',
    caption: 'box back at the depot — the mission is over',
    responsible: 'Transporter',
    intervalLabel: 'Return leg',
    withoutContainer: {
      /* Bulk cargo is finished when it is tipped — the picker's last rung is
         "Delivered" and it writes `Completed`, so the journey says the same. */
      label: 'Delivered',
      caption: 'cargo delivered — the mission is over',
      /* Nobody "owns" the moment a mission is closed in the system — printing
         TRANSPORTER against it names a party for a piece of bookkeeping. */
      responsible: undefined,
      /* No box, no return leg — the gap into the close is just the gap, and
         naming it after a leg that does not exist would be a small lie. */
      intervalLabel: undefined,
    },
  },
};

/**
 * The steps, in the order the operator walks them, named by the picker itself.
 *
 * Built per load rather than once, because the two kinds of load walk different
 * ladders: a containerized booking has seven steps and ends when the box is
 * home, a bulk one has three and ends when it is delivered. Reading the journey
 * off whichever list the picker offered is what keeps the report describing the
 * job the operator actually recorded.
 *
 * A rung with no entry in `JOURNEY_BY_RUNG` is dropped rather than rendered
 * nameless — that is what would happen if a step were added to the picker and
 * not here, and a missing row is a far cheaper failure than a row labelled
 * `undefined`.
 */
export function missionJourneySteps(hasContainer: boolean): readonly JourneyStepDefinition[] {
  return shipmentStepsFor(hasContainer).flatMap((step) => {
    const detail = JOURNEY_BY_RUNG[step.rung];
    if (!detail) return [];
    const spoken = hasContainer ? detail : { ...detail, ...detail.withoutContainer };
    return [{ ...spoken, label: step.label }];
  });
}

/** The containerized ladder — the long one, kept for callers that want it whole. */
export const MISSION_JOURNEY_STEPS: readonly JourneyStepDefinition[] = SHIPMENT_STEPS.flatMap(
  (step) => {
    const detail = JOURNEY_BY_RUNG[step.rung];
    return detail ? [{ ...detail, label: step.label }] : [];
  },
);
