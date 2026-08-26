import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import {
  detentionRateCurrency,
  detentionRatePerContainerDay,
  onTimeGraceMinutes,
  returnHeadroomBands,
} from '@/lib/bi/config';
import { displayShipmentStatus } from '@/lib/shipmentStatus';
import { deriveAttribution, type DelayAttribution } from './delayVocabulary';
import {
  MISSION_STAGES,
  missionEventsFromTimeline,
  type MissionEvents,
  type MissionPhase,
  type MissionStageKey,
} from './missionLifecycle';
import { DAY, HOUR, MIN, toMs } from './reportFormat';

/**
 * The mission report — one container's run, end to end.
 *
 * Every figure is derived from recorded event timestamps: the booking's status
 * timeline, the empty-return cycle's own two events, and the shipping line's
 * return deadline. There is no manual KPI entry anywhere in this file, which is
 * the property that lets the report be generated automatically the moment a
 * mission closes and still be defensible in an argument about detention.
 *
 * Section order follows the specification's output structure:
 * Mission Overview → Timeline → Transport KPIs → Container Return →
 * Detention / Exceptions.
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * Status vocabularies
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * §9 — the whole visual status system, and deliberately nothing else.
 *
 * - `ontime`    everything completed within expected operational targets
 * - `attention` still inside every deadline, but an indicator wants a look
 * - `delayed`   an operational or empty-return deadline has been exceeded
 */
export type MissionPerformanceStatus = 'ontime' | 'attention' | 'delayed';

/** §6 — the empty return against its deadline. */
export type ReturnStatus =
  | 'ontime'
  | 'delayed'
  /** Inside the due-soon window with the box still out. */
  | 'due_soon'
  /** Out, deadline comfortably ahead. */
  | 'awaiting'
  /** No container, or the line never set a deadline — nothing to be late against. */
  | 'not_applicable';

export type ReportBadgeStatus = MissionPerformanceStatus | ReturnStatus;

/* ═══════════════════════════════════════════════════════════════════════════
 * Exception policy (§15)
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * What counts as an exception worth printing.
 *
 * The specification is explicit that unnecessary alerts are worse than none, so
 * each threshold sits clearly *above* ordinary operations on the Djibouti
 * corridor rather than near the average — a flag on half the book is not a flag.
 * Calibrated against the real account: typical total waiting runs under three
 * hours, unloading around three, dépotage three and a half days, a whole mission
 * four. Every value below is roughly double its norm, which is what makes it
 * exceptional.
 *
 * They live together, named, because the moment a shipper disputes a flag this
 * is the list the conversation is about.
 *
 * The empty-return warning window is not here: "how close to free time is too
 * close" is already an operator-tunable policy (`returnDueSoonHours`), and a
 * second copy of it would drift.
 */
export const EXCEPTION_THRESHOLDS = {
  /** Both gates together. Beyond this the truck is paid for and not moving. */
  waitingMs: 6 * HOUR,
  /** A container load that takes longer than this was not a loading problem. */
  loadingMs: 4 * HOUR,
  unloadingMs: 6 * HOUR,
  /** Dépotage past this is most of the free time spent at the client's yard. */
  depotageMs: 5 * DAY,
  /** A door-to-depot mission longer than this is not an ordinary corridor run. */
  missionMs: 10 * DAY,
} as const;

export interface MissionException {
  /** Stable identity, so the monthly report can count exception kinds. */
  code:
    | 'excessive_waiting'
    | 'long_loading'
    | 'long_unloading'
    | 'long_depotage'
    | 'return_due_soon'
    | 'return_deadline_exceeded'
    | 'detention_triggered'
    | 'long_mission'
    | 'late_delivery';
  level: 'attention' | 'delayed';
  label: string;
  /** The measured figure that tripped the threshold, in ms — or a count for detention. */
  detail: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The report
 * ═══════════════════════════════════════════════════════════════════════ */

export interface MissionTimelineRow {
  key: MissionStageKey;
  label: string;
  note?: string;
  responsible?: string;
  /** Which chapter of the journey the rung belongs to. */
  phase: MissionPhase;
  /** Names the interval ending at this row where it has a name of its own (dépotage). */
  intervalLabel?: string;
  /** Epoch ms, or null while the stage has not happened. */
  at: number | null;
  /** Time since the previous recorded event. Null on the first row and pending rows. */
  durationMs: number | null;
  /** The bottleneck — the longest single interval of the mission. */
  isLongest: boolean;
}

export interface MissionKpis {
  /** §4 — Mission Closed − Mission Assigned. Null until the mission closes. */
  totalMs: number | null;
  /** Assigned → now, for a mission still running. */
  elapsedMs: number | null;
  /** Arrival at destination − departure from pickup. */
  transitMs: number | null;
  /** Loading started − arrival at pickup. */
  waitPickupMs: number | null;
  loadingMs: number | null;
  /** Unloading started − arrival at drop-off. */
  waitDropMs: number | null;
  unloadingMs: number | null;
  /** Pickup waiting + drop-off waiting. */
  waitTotalMs: number | null;
  /** Empty ready − container delivered: how long the client took to empty the box. */
  depotageMs: number | null;
  /** Empty returned − empty ready: the restitution trip. */
  returnLegMs: number | null;
  /** Share of the assigned → delivered span not spent waiting at a gate. */
  activePct: number | null;
}

export interface MissionContainerReturn {
  hasContainer: boolean;
  deliveredAt: number | null;
  emptyReadyAt: number | null;
  deadlineAt: number | null;
  returnedAt: number | null;
  freeDays: number | null;
  depot: string | null;
  status: ReturnStatus;
  /**
   * Signed milliseconds against the deadline — negative is margin, positive is
   * overrun. Measured from the actual return once it happens, and from `now`
   * while the box is still out.
   */
  deltaMs: number | null;
  detention: boolean;
  detentionDays: number;
  detentionFees: number;
  detentionCurrency: string;
  detentionRatePerDay: number;
  cycleReference: string | null;
}

/**
 * One measured interval of the mission, ready to draw.
 *
 * This is the §4 KPI list and the "where did the time go" chart in one object:
 * the same seven numbers, each carrying its share of the total and whether it
 * was time *working* or time *waiting* — which is the only distinction a shipper
 * needs to read a ribbon in one second.
 */
export interface MissionTimeSegment {
  key: 'wait_pickup' | 'loading' | 'transit' | 'wait_dropoff' | 'unloading' | 'depotage' | 'return_leg';
  label: string;
  ms: number;
  /** Share of the measured total, 0–100. */
  share: number;
  /** `waiting` is time nobody was working — the report's one orange. */
  tone: 'active' | 'waiting';
  /** Slot in the design system's ordinal chart ramp (1–5). Waiting segments ignore it. */
  step: 1 | 2 | 3 | 4 | 5;
  /** The single largest interval — the bottleneck. */
  isLongest: boolean;
}

export interface MissionOverview {
  missionId: string;
  containerNumber: string | null;
  containerType: string;
  shippingLine: string | null;
  shipperName: string;
  /**
   * The shipment's own customer/consignee — who the cargo actually belongs to.
   * An account like a freight forwarder books missions on behalf of many of
   * these, so this stays distinct from `shipperName` (the report's addressee)
   * even though the two are often the same company for a direct shipper.
   */
  customerCompany: string;
  /** The contact person at `customerCompany` — same field `ShipmentCard` calls `createdBy` elsewhere in the app. */
  customerContactName: string;
  transporter: string;
  pickup: string;
  dropoff: string;
  truck: string;
  driver: string;
  cargo: string;
  missionStartAt: number | null;
  deliveredAt: number | null;
  emptyReturnedAt: number | null;
  closedAt: number | null;
  /** The lifecycle's own word for where the mission stands, in plain language. */
  lifecycleStatus: string;
  /** Cancelled or Failed — a mission with no performance to report. */
  isTerminated: boolean;
}

export type DeliveryOutcome = 'early' | 'on_time' | 'late';

export interface MissionReport {
  bookingId: string;
  overview: MissionOverview;
  events: MissionEvents;
  /** Recorded rows then pending rows, in lifecycle order. */
  timeline: MissionTimelineRow[];
  maxDurationMs: number;
  kpis: MissionKpis;
  /** The measured intervals, in lifecycle order, with their shares. */
  breakdown: MissionTimeSegment[];
  /** Sum of every measured interval — the denominator of `share`. */
  measuredMs: number;
  containerReturn: MissionContainerReturn;
  status: MissionPerformanceStatus;
  /** Set only where the mission carries a promised delivery date. */
  deliveryOutcome: DeliveryOutcome | null;
  plannedDeliveryAt: number | null;
  exceptions: MissionException[];
  attribution: DelayAttribution | null;
  /** True once the mission has closed — what makes it eligible for the monthly report. */
  isClosed: boolean;
}

export interface MissionReportInput {
  booking: BookingRecord;
  cycle?: EmptyReturnCycleRecord;
  now: number;
  /**
   * The promised delivery instant, where the account has one. Supplied by the
   * caller because the promise lives on the parent shipment's route estimate,
   * not on the booking — see the BI dataset's `plannedDeliveryAt`.
   */
  plannedDeliveryAt?: string | null;
  /**
   * The account the report is addressed to.
   *
   * A shipment stores its own `customerCompany`, which is the contact the
   * consignment was booked under and is not always the account's legal name.
   * On a report a shipper reads about themselves, the account name wins; the
   * operations-side copy passes nothing and keeps the shipment's own field.
   */
  shipperName?: string;
}

const CONTAINER_TYPE_LABELS: Record<string, string> = {
  container_20: "20' Container",
  container_40: "40' Container",
  containerized: 'Containerized',
  bulk: 'Bulk cargo',
  bulky_goods: 'Bulky goods',
  machinery: 'Machinery',
  special: 'Special equipment',
};

const containerTypeLabel = (booking: BookingRecord): string => {
  const category = booking.shipmentCategory ?? '';
  if (CONTAINER_TYPE_LABELS[category]) return CONTAINER_TYPE_LABELS[category];
  return booking.containerNumber ? 'Container' : 'Not containerized';
};

export function computeMissionReport({
  booking,
  cycle,
  now,
  plannedDeliveryAt,
  shipperName,
}: MissionReportInput): MissionReport {
  const hasContainer = Boolean(booking.containerNumber);
  const events = missionEventsFromTimeline({
    timeline: booking.timeline,
    emptyReadyAt: cycle?.emptyReadyAt ?? null,
    returnedAt: cycle?.returnedAt ?? null,
    completedAt: booking.completedAt,
  });

  const isTerminated = booking.status === 'Cancelled' || booking.status === 'Failed';
  const timeline = buildTimeline(events, hasContainer, isTerminated);
  const maxDurationMs = timeline.reduce((max, row) => Math.max(max, row.durationMs ?? 0), 0);
  for (const row of timeline) {
    row.isLongest = maxDurationMs > 0 && row.durationMs === maxDurationMs;
  }

  const kpis = computeKpis(events, now, hasContainer);
  const { breakdown, measuredMs } = computeBreakdown(kpis);
  const containerReturn = computeContainerReturn({ booking, cycle, events, now, hasContainer });

  const planned = toMs(plannedDeliveryAt ?? null);
  const delivered = events.container_delivered ?? null;
  const deliveryOutcome =
    planned !== null && delivered !== null ? classifyDelivery(planned, delivered) : null;

  const exceptions = computeExceptions({ kpis, containerReturn, deliveryOutcome });
  const status = computeStatus({ containerReturn, exceptions, isTerminated });

  const attribution = deriveAttribution({
    deadlineAt: containerReturn.deadlineAt,
    emptyReadyAt: containerReturn.emptyReadyAt,
    returnedAt: containerReturn.returnedAt,
    isLate: containerReturn.status === 'delayed',
    standaloneReturnNote: booking.emptyReturnException,
  });

  const shipment = booking.shipment;

  return {
    bookingId: booking.id,
    overview: {
      missionId: booking.reference,
      containerNumber: booking.containerNumber,
      containerType: containerTypeLabel(booking),
      shippingLine: booking.shippingLine,
      shipperName: shipperName || shipment?.customerCompany || shipment?.customerName || '—',
      customerCompany: shipment?.customerCompany || shipment?.customerName || '—',
      customerContactName: shipment?.customerName || '—',
      transporter: booking.partner?.companyLegalName ?? 'Unassigned',
      pickup: shipment?.pickupLocationName ?? '—',
      dropoff: shipment?.deliveryLocationName ?? '—',
      truck: booking.vehicle
        ? `${booking.vehicle.plateNumber} · ${booking.vehicle.truckType}`
        : 'Unassigned',
      driver: booking.driver?.fullName ?? 'Unassigned',
      cargo: booking.cargoType,
      missionStartAt: events.assigned ?? toMs(booking.createdAt),
      deliveredAt: events.container_delivered ?? null,
      emptyReturnedAt: events.empty_returned ?? null,
      closedAt: events.mission_closed ?? null,
      lifecycleStatus: displayShipmentStatus(booking.status),
      isTerminated,
    },
    events,
    timeline,
    maxDurationMs,
    kpis,
    breakdown,
    measuredMs,
    containerReturn,
    status,
    deliveryOutcome,
    plannedDeliveryAt: planned,
    exceptions,
    attribution,
    /* Finished when the box is home — for a load with no box, when the
       mission closed. Same rule the total mission time measures to. */
    isClosed: hasContainer
      ? events.empty_returned !== undefined
      : events.mission_closed !== undefined,
  };
}

/* ── Timeline ──────────────────────────────────────────────────────────── */

/**
 * The twelve rungs as a time register: recorded rows in the order they
 * happened, each carrying the gap since the previous one.
 *
 * Rows are sorted by timestamp rather than by catalogue position, which keeps
 * every duration non-negative even when a cycle event lands after the booking
 * itself was closed. Pending rows follow in lifecycle order — but only the ones
 * that can still happen: a pickup leg never recorded is not going to be, once
 * the truck is already at the destination. The empty-return tail is the one
 * exception; it stays possible until the box is back.
 */
function buildTimeline(
  events: MissionEvents,
  hasContainer: boolean,
  isTerminated: boolean,
): MissionTimelineRow[] {
  /* A containerized booking has no separate closing milestone: it is finished
     when the empty is back, so "Mission Closed" would be a second, redundant
     rung stamped at roughly the same instant — and on real rows the two
     disagreed, printing a close that read hours before the return. A load with
     no box keeps it, because it has no return leg to end on. */
  const catalog = MISSION_STAGES.filter(
    (stage) =>
      (hasContainer || !stage.containerOnly) && !(hasContainer && stage.key === 'mission_closed'),
  );

  const recorded = catalog
    .filter((stage) => events[stage.key] !== undefined)
    .map((stage) => ({
      key: stage.key,
      label: stage.label,
      note: stage.note,
      responsible: stage.responsible,
      phase: stage.phase,
      intervalLabel: stage.intervalLabel,
      at: events[stage.key] as number,
      durationMs: null as number | null,
      isLongest: false,
    }))
    .sort((a, b) => a.at - b.at);

  recorded.forEach((row, index) => {
    const previous = recorded[index - 1];
    if (previous) row.durationMs = row.at - previous.at;
  });

  const lastRecordedIndex = catalog.reduce(
    (last, stage, index) => (events[stage.key] !== undefined ? index : last),
    -1,
  );
  const pending: MissionTimelineRow[] = isTerminated
    ? []
    : catalog
        .filter(
          (stage, index) =>
            events[stage.key] === undefined &&
            (index > lastRecordedIndex || stage.key === 'empty_ready' || stage.key === 'empty_returned'),
        )
        .map((stage) => ({
          key: stage.key,
          label: stage.label,
          note: stage.note,
          responsible: stage.responsible,
          phase: stage.phase,
          intervalLabel: stage.intervalLabel,
          at: null,
          durationMs: null,
          isLongest: false,
        }));

  return [...recorded, ...pending];
}

/* ── KPIs (§4, §14) ────────────────────────────────────────────────────── */

function computeKpis(events: MissionEvents, now: number, hasContainer: boolean): MissionKpis {
  /**
   * When the mission ended.
   *
   * For a container that is the moment the empty came back — the user's rule,
   * 2026-08-26: the booking is finished when the box is home, so there is no
   * separate closing event to measure to. `mission_closed` is kept as the
   * fallback for a bulk or machinery load, which has no box and therefore no
   * empty return to end on, and as a backstop for a container whose return was
   * never stamped.
   */
  const endKey: MissionStageKey =
    hasContainer && events.empty_returned !== undefined ? 'empty_returned' : 'mission_closed';
  const endedAt = events[endKey];

  const span = (from: MissionStageKey, to: MissionStageKey): number | null => {
    const a = events[from];
    const b = events[to];
    return a !== undefined && b !== undefined && b >= a ? b - a : null;
  };

  const waitPickupMs = span('arrived_pickup', 'loading_started');
  const waitDropMs = span('arrived_dropoff', 'unloading_started');
  const assigned = events.assigned ?? null;
  const delivered = events.container_delivered ?? null;

  const kpis: MissionKpis = {
    /**
     * Assigned → the empty back at the depot. Measuring to delivery instead
     * would report a two-day job for a box that was out for a week — and the
     * container half of the cycle is the half that costs money.
     */
    totalMs: span('assigned', endKey),
    elapsedMs: assigned !== null && endedAt === undefined ? now - assigned : null,
    transitMs: span('left_for_dropoff', 'arrived_dropoff'),
    waitPickupMs,
    loadingMs: span('loading_started', 'loading_completed'),
    waitDropMs,
    unloadingMs: span('unloading_started', 'container_delivered'),
    waitTotalMs:
      waitPickupMs === null && waitDropMs === null ? null : (waitPickupMs ?? 0) + (waitDropMs ?? 0),
    depotageMs: span('container_delivered', 'empty_ready'),
    returnLegMs: span('empty_ready', 'empty_returned'),
    activePct: null,
  };

  const transportSpan = assigned !== null && delivered !== null ? delivered - assigned : null;
  if (transportSpan !== null && transportSpan > 0 && kpis.waitTotalMs !== null) {
    kpis.activePct = Math.max(0, Math.round(100 - (kpis.waitTotalMs / transportSpan) * 100));
  }

  return kpis;
}

/* ── Where the time went (§4 as one drawable object) ───────────────────── */

/**
 * The seven measured intervals, in lifecycle order, each with its share.
 *
 * Colour carries meaning rather than identity: the two gate waits are `waiting`
 * (the report's one orange — time paid for and not moving), and the five
 * operational intervals take the design system's ordinal teal ramp in the order
 * they happen. An interval that was never recorded is left out entirely instead
 * of drawn as zero.
 */
function computeBreakdown(kpis: MissionKpis): {
  breakdown: MissionTimeSegment[];
  measuredMs: number;
} {
  const candidates: Array<{
    key: MissionTimeSegment['key'];
    label: string;
    ms: number | null;
    tone: MissionTimeSegment['tone'];
    step: MissionTimeSegment['step'];
  }> = [
    { key: 'wait_pickup', label: 'Pickup waiting', ms: kpis.waitPickupMs, tone: 'waiting', step: 1 },
    { key: 'loading', label: 'Loading', ms: kpis.loadingMs, tone: 'active', step: 1 },
    { key: 'transit', label: 'Transit', ms: kpis.transitMs, tone: 'active', step: 2 },
    { key: 'wait_dropoff', label: 'Drop-off waiting', ms: kpis.waitDropMs, tone: 'waiting', step: 1 },
    { key: 'unloading', label: 'Depotage', ms: kpis.unloadingMs, tone: 'active', step: 3 },
    { key: 'depotage', label: 'Dépotage (client)', ms: kpis.depotageMs, tone: 'active', step: 4 },
    { key: 'return_leg', label: 'Empty return', ms: kpis.returnLegMs, tone: 'active', step: 5 },
  ];

  const measured = candidates.filter(
    (candidate): candidate is typeof candidate & { ms: number } =>
      candidate.ms !== null && candidate.ms > 0,
  );
  const measuredMs = measured.reduce((sum, candidate) => sum + candidate.ms, 0);
  const longest = measured.reduce((max, candidate) => Math.max(max, candidate.ms), 0);

  return {
    measuredMs,
    breakdown: measured.map((candidate) => ({
      key: candidate.key,
      label: candidate.label,
      ms: candidate.ms,
      share: measuredMs > 0 ? (candidate.ms / measuredMs) * 100 : 0,
      tone: candidate.tone,
      step: candidate.step,
      isLongest: longest > 0 && candidate.ms === longest,
    })),
  };
}

/* ── Container return (§5, §6) ─────────────────────────────────────────── */

function computeContainerReturn({
  booking,
  cycle,
  events,
  now,
  hasContainer,
}: {
  booking: BookingRecord;
  cycle: EmptyReturnCycleRecord | undefined;
  events: MissionEvents;
  now: number;
  hasContainer: boolean;
}): MissionContainerReturn {
  const deadlineAt = toMs(booking.containerReturnDeadline);
  const deliveredAt = events.container_delivered ?? null;
  const emptyReadyAt = events.empty_ready ?? null;
  const returnedAt = events.empty_returned ?? null;

  const ratePerDay = detentionRatePerContainerDay();
  const currency = detentionRateCurrency();
  const dueSoonMs = returnHeadroomBands().dueSoon * HOUR;

  let status: ReturnStatus = 'not_applicable';
  let deltaMs: number | null = null;
  let detentionDays = 0;

  if (hasContainer && deadlineAt !== null) {
    if (returnedAt !== null) {
      deltaMs = returnedAt - deadlineAt;
      status = deltaMs <= 0 ? 'ontime' : 'delayed';
    } else {
      deltaMs = now - deadlineAt;
      if (deltaMs > 0) status = 'delayed';
      else status = deadlineAt - now <= dueSoonMs ? 'due_soon' : 'awaiting';
    }
    if (deltaMs > 0) detentionDays = Math.ceil(deltaMs / DAY);
  } else if (hasContainer && returnedAt !== null) {
    // Back at the depot, but the line never set a deadline: nothing to be late against.
    status = 'ontime';
  } else if (hasContainer) {
    status = 'awaiting';
  }

  return {
    hasContainer,
    deliveredAt,
    emptyReadyAt,
    deadlineAt,
    returnedAt,
    freeDays: booking.containerReturnFreeDays,
    depot: booking.containerReturnDepot,
    status,
    deltaMs,
    detention: detentionDays > 0,
    detentionDays,
    detentionFees: detentionDays * ratePerDay,
    detentionCurrency: currency,
    detentionRatePerDay: ratePerDay,
    cycleReference: cycle?.reference ?? null,
  };
}

/* ── Delivery against the promise ──────────────────────────────────────── */

export function classifyDelivery(plannedAt: number, deliveredAt: number): DeliveryOutcome {
  const varianceMs = deliveredAt - plannedAt;
  if (varianceMs > onTimeGraceMinutes() * MIN) return 'late';
  if (varianceMs < -24 * HOUR) return 'early';
  return 'on_time';
}

/* ── Exceptions (§15) ──────────────────────────────────────────────────── */

function computeExceptions({
  kpis,
  containerReturn,
  deliveryOutcome,
}: {
  kpis: MissionKpis;
  containerReturn: MissionContainerReturn;
  deliveryOutcome: DeliveryOutcome | null;
}): MissionException[] {
  const out: MissionException[] = [];
  const hours = (ms: number) => `${Math.round((ms / HOUR) * 10) / 10}h`;
  const days = (ms: number) => `${Math.round((ms / DAY) * 10) / 10}d`;

  if (kpis.waitTotalMs !== null && kpis.waitTotalMs > EXCEPTION_THRESHOLDS.waitingMs) {
    out.push({
      code: 'excessive_waiting',
      level: 'attention',
      label: 'Excessive waiting time',
      detail: `${hours(kpis.waitTotalMs)} waiting at the gates — threshold ${hours(EXCEPTION_THRESHOLDS.waitingMs)}`,
    });
  }
  if (kpis.loadingMs !== null && kpis.loadingMs > EXCEPTION_THRESHOLDS.loadingMs) {
    out.push({
      code: 'long_loading',
      level: 'attention',
      label: 'Long loading time',
      detail: `${hours(kpis.loadingMs)} at the loading point`,
    });
  }
  if (kpis.unloadingMs !== null && kpis.unloadingMs > EXCEPTION_THRESHOLDS.unloadingMs) {
    out.push({
      code: 'long_unloading',
      level: 'attention',
      label: 'Long unloading time',
      detail: `${hours(kpis.unloadingMs)} at the drop-off point`,
    });
  }
  if (kpis.depotageMs !== null && kpis.depotageMs > EXCEPTION_THRESHOLDS.depotageMs) {
    out.push({
      code: 'long_depotage',
      level: 'attention',
      label: 'Long dépotage time',
      detail: `${days(kpis.depotageMs)} between delivery and the empty being ready`,
    });
  }
  if (containerReturn.status === 'due_soon' && containerReturn.deltaMs !== null) {
    out.push({
      code: 'return_due_soon',
      level: 'attention',
      label: 'Empty return approaching deadline',
      detail: `${hours(Math.abs(containerReturn.deltaMs))} of free time left and the empty is not back`,
    });
  }
  if (containerReturn.status === 'delayed' && containerReturn.deltaMs !== null) {
    out.push({
      code: 'return_deadline_exceeded',
      level: 'delayed',
      label: 'Empty return deadline exceeded',
      detail: containerReturn.returnedAt
        ? `Returned ${days(containerReturn.deltaMs)} past the deadline`
        : `${days(containerReturn.deltaMs)} past the deadline and still out`,
    });
  }
  if (containerReturn.detention) {
    out.push({
      code: 'detention_triggered',
      level: 'delayed',
      label: 'Detention triggered',
      detail: `${containerReturn.detentionDays} detention day${containerReturn.detentionDays === 1 ? '' : 's'} · ${containerReturn.detentionFees.toLocaleString()} ${containerReturn.detentionCurrency}`,
    });
  }

  const missionSpan = kpis.totalMs ?? kpis.elapsedMs;
  if (missionSpan !== null && missionSpan > EXCEPTION_THRESHOLDS.missionMs) {
    out.push({
      code: 'long_mission',
      level: 'attention',
      label: 'Unusually long mission duration',
      detail: `${days(missionSpan)} from assignment${kpis.totalMs === null ? ' and still running' : ' to the empty coming back'}`,
    });
  }
  if (deliveryOutcome === 'late') {
    out.push({
      code: 'late_delivery',
      level: 'delayed',
      label: 'Delivered after the promised date',
      detail: 'Container delivered past the planned delivery window',
    });
  }

  return out;
}

/* ── Mission performance status (§9) ───────────────────────────────────── */

function computeStatus({
  containerReturn,
  exceptions,
  isTerminated,
}: {
  containerReturn: MissionContainerReturn;
  exceptions: MissionException[];
  isTerminated: boolean;
}): MissionPerformanceStatus {
  if (isTerminated) return 'attention';
  if (containerReturn.status === 'delayed') return 'delayed';
  if (exceptions.some((exception) => exception.level === 'delayed')) return 'delayed';
  if (exceptions.length > 0) return 'attention';
  return 'ontime';
}
