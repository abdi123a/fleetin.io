import { create } from 'zustand';

import {
  CHECKLIST_COUNT,
  CRITICAL_THRESHOLD_MS,
  DEFAULT_EMPTY_RETURN_FILTERS,
  DISPATCH_FALLBACK_TRUCK,
  EMPTY_RETURN_EPOCH,
  EMPTY_RETURN_EXCEPTIONS,
  EMPTY_RETURN_ID_SEEDS,
  EMPTY_RETURN_STATUS_META,
  EMPTY_RETURN_TICK_MS,
  EMPTY_RETURN_TOAST_MS,
  HOUR_MS,
  INITIAL_EMPTY_RETURNS,
  INITIAL_FULL_LOAD_MISSIONS,
  MILESTONE_COUNT,
  RETURN_MILESTONE,
  WATCH_THRESHOLD_MS,
  milestoneLabel,
} from '@/data/emptyReturnData';
import { MOCK_MISSIONS } from '@/data/missionsData';
import { formatId } from '@/lib/ids';
import {
  isDeliveredContainerShipment,
  isOpenFullLoadShipment,
  parseMissionTimestamp,
  shipmentToEmptyReturnRecord,
  shipmentToFullLoadMission,
} from '@/lib/operations/shipmentBridge';
import { useShipmentStore } from '@/stores/shipment.store';
import type { Mission } from '@/types/mission';
import type {
  CycleChain,
  CycleCreationResult,
  EmptyReturnFilters,
  EmptyReturnKpis,
  EmptyReturnRecord,
  FullLoadMission,
  MatchingContext,
  MissionChip,
  MissionEligibility,
  ReturnRiskLevel,
  TransporterCycleStats,
} from '@/types/emptyReturn';

/**
 * The empty-return module's single source of truth.
 *
 * The five views are five routes, so nothing survives in a page component —
 * records, the mission pool, the filter bar, which row is open, which empty is
 * selected for matching and the ticking clock all live here. That is also the
 * fix for the demo's worst defect: with the state outside the tree, every view
 * and every atom is declared at module top level and the search input keeps its
 * caret between keystrokes.
 *
 * The seven business actions below are the whole state machine. It runs one way
 * — unloading → empty ready → preparing → ready → in progress → completed —
 * with no cancel and no undo, and the last transition closes the loop by
 * spawning the *next* record: the full load this cycle just delivered becomes an
 * empty waiting to be unloaded. A spawned record linked to a real shipment takes
 * its deadline from that shipment's return commitment; only an unlinked one
 * still arrives with no deadline.
 *
 * The module is fed by the Shipments store, not just by its own seeds: pending
 * containerized shipments arrive in the Matching pool via
 * `registerShipmentFullLoad`, delivered ones become records via
 * `registerShipmentEmptyReturn`, and when Matching consumes a shipment the
 * store calls back (`assignShipmentToCycle` / `completeShipmentFromCycle`) so
 * the shipment's own status moves with the cycle. Both directions are seeded at
 * boot from `MOCK_MISSIONS` below.
 *
 * Every derivation is a pure exported function taking `(records, …, now)`. They
 * are not store selectors because they are read from four different views with
 * four different argument shapes, and because a pure function is testable
 * against the acceptance table without mounting anything.
 */

/* ---------------------------------------------------------------------------
 * Pure helpers — risk, slack, formatting
 * ------------------------------------------------------------------------- */

/**
 * The record's deadline risk, or null when it has no deadline to be judged by.
 *
 * Two short-circuits carry the whole meaning. `protected` is checked *first* and
 * is permanent: once the box is back on or before its deadline nothing — not a
 * later clock, not a worse prediction — can make it read anything else. That is
 * why advancing past milestone 11 visibly flips the pill to solid teal.
 * `overdue` is checked before the slack maths and requires the box to still be
 * out; a box returned *late* falls through both and lands in the slack bands,
 * which is the demo's design and not an oversight.
 */
export function riskOf(record: EmptyReturnRecord, now: number): ReturnRiskLevel | null {
  if (record.returnedAt && record.deadline && record.returnedAt <= record.deadline) {
    return 'protected';
  }
  if (!record.deadline) return null;
  if (now > record.deadline && !record.returnedAt) return 'overdue';

  const slack = record.deadline - (record.predictedGateIn ?? now);
  if (slack < 0) return 'at_risk';
  if (slack < CRITICAL_THRESHOLD_MS) return 'critical';
  if (slack < WATCH_THRESHOLD_MS) return 'watch';
  return 'safe';
}

/**
 * Milliseconds of margin against the deadline. Null when there is no deadline.
 *
 * Note the asymmetry with `riskOf`, which is intentional: slack prefers the
 * *actual* return time, so a returned box reports the margin it achieved, while
 * risk uses the prediction, so an outstanding box reports the margin it is
 * forecast to achieve.
 */
export function slackOf(record: EmptyReturnRecord, now: number): number | null {
  if (!record.deadline) return null;
  return record.deadline - (record.returnedAt ?? record.predictedGateIn ?? now);
}

/** `+4h00` / `−1h30`. The sign is U+2212 MINUS, hours are uncapped, minutes padded. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const negative = ms < 0;
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / HOUR_MS);
  const minutes = Math.floor((abs % HOUR_MS) / 60_000);
  return `${negative ? '−' : '+'}${hours}h${String(minutes).padStart(2, '0')}`;
}

/** `14/08 17:42` — compact and 24-hour, the shape an ops screen is read at. */
export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const date = new Date(ts);
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/** `17:42` — the live clock in the page header. */
export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The two escalation sets, named once.
 *
 * "Critical" and "escalated" were each spelled out inline in three places with
 * three different orderings, which is how a KPI and the row that opens from it
 * drift apart. `isCritical` is what the KPI card and the `crit` filter count;
 * `isEscalated` adds `overdue` and is what the row detail treats as "the safety
 * cutoff is in play".
 */
export function isCritical(risk: ReturnRiskLevel | null): boolean {
  return risk === 'critical' || risk === 'at_risk';
}

export function isEscalated(risk: ReturnRiskLevel | null): boolean {
  return isCritical(risk) || risk === 'overdue';
}

export function countChecklistDone(record: EmptyReturnRecord): number {
  return record.checklist.filter(Boolean).length;
}

export function isChecklistComplete(record: EmptyReturnRecord): boolean {
  return record.checklist.every(Boolean);
}

/* ---------------------------------------------------------------------------
 * Pure derivations
 * ------------------------------------------------------------------------- */

export function selectKpis(records: EmptyReturnRecord[], now: number): EmptyReturnKpis {
  return {
    emptyReady: records.filter((r) => r.status === 'empty_ready' && !r.exception).length,
    assigned: records.filter((r) => r.status === 'ready' || r.status === 'in_progress').length,
    standalone: records.filter((r) => r.exception === EMPTY_RETURN_EXCEPTIONS.standaloneRequired)
      .length,
    critical: records.filter((r) => isCritical(riskOf(r, now)) && r.status !== 'completed').length,
    overdue: records.filter((r) => riskOf(r, now) === 'overdue').length,
  };
}

/**
 * The Cycles list: filtered, then sorted worst-slack-first.
 *
 * The sort is the editorial stance — this is a triage queue, not an id list.
 * Records with no deadline have no slack and therefore sort last, permanently.
 * The haystack includes `exception`, which the demo omitted and which is what
 * made its standalone KPI card land on an empty list.
 */
export function selectFilteredRecords(
  records: EmptyReturnRecord[],
  filters: EmptyReturnFilters,
  now: number,
): EmptyReturnRecord[] {
  const query = filters.q.trim().toLowerCase();

  return records
    .filter((record) => {
      if (filters.status !== 'all') {
        if (filters.status === 'assigned') {
          if (record.status !== 'ready' && record.status !== 'in_progress') return false;
        } else if (record.status !== filters.status) {
          return false;
        }
      }

      if (filters.risk !== 'all') {
        const risk = riskOf(record, now);
        if (filters.risk === 'crit') {
          if (!isCritical(risk)) return false;
        } else if (risk !== filters.risk) {
          return false;
        }
      }

      if (query) {
        const haystack = [
          record.container,
          record.nextFull?.container,
          record.client,
          record.transporter,
          record.cycleId,
          record.chainId,
          record.locationId,
          record.line,
          record.type,
          record.exception,
          record.shipmentId,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity));
}

/**
 * The dashboard's urgent rail — a different set from the Cycles list.
 *
 * Completed cycles, boxes already returned and records with no deadline are all
 * excluded: this rail answers "what will breach if nobody moves", and none of
 * those three can.
 */
export function selectUrgentRecords(
  records: EmptyReturnRecord[],
  now: number,
  limit = 5,
): EmptyReturnRecord[] {
  return records
    .filter((r) => r.status !== 'completed' && r.deadline && !r.returnedAt)
    .sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity))
    .slice(0, limit);
}

/**
 * Chains, in first-seen order, each with its four header figures resolved.
 *
 * `onTime` counts every record already returned within its deadline while the
 * denominator counts only completed cycles, so a chain with one finished cycle
 * and one in-flight-but-already-returned cycle prints `2/1`. That is the demo's
 * formula, reproduced verbatim so the two builds agree; it is a reporting quirk
 * worth raising, not a bug to silently correct here.
 */
export function selectChains(records: EmptyReturnRecord[]): CycleChain[] {
  const groups = new Map<string, EmptyReturnRecord[]>();

  for (const record of records) {
    if (!record.chainId) continue;
    const bucket = groups.get(record.chainId);
    if (bucket) bucket.push(record);
    else groups.set(record.chainId, [record]);
  }

  const chains: CycleChain[] = [];

  groups.forEach((bucket, id) => {
    const cycles = [...bucket].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const first = cycles[0];
    if (!first) return;

    const completed = cycles.filter((c) => c.status === 'completed').length;
    const active = cycles.find((c) => c.status !== 'completed') ?? null;
    const onTime = cycles.filter(
      (c) => c.returnedAt && c.deadline && c.returnedAt <= c.deadline,
    ).length;

    chains.push({
      id,
      cycles,
      first,
      completed,
      active,
      onTime,
      statusLabel: active ? EMPTY_RETURN_STATUS_META[active.status].label : 'Completed',
      maxSequence: cycles.reduce((max, c) => Math.max(max, c.seq ?? 0), 0),
    });
  });

  return chains;
}

/**
 * One row per transporter, in order of first appearance in `records`.
 *
 * `containers` counts every box the carrier has touched; the cycle figures count
 * only records that carry a cycle id. The asymmetry is the point — a carrier can
 * be holding three boxes and running no cycles at all, and the table should say
 * so.
 */
export function selectTransporterStats(records: EmptyReturnRecord[]): TransporterCycleStats[] {
  interface Accumulator extends Omit<TransporterCycleStats, 'containers' | 'onTimeLabel'> {
    containerSet: Set<string>;
  }

  const rows = new Map<string, Accumulator>();

  for (const record of records) {
    let row = rows.get(record.transporter);
    if (!row) {
      row = {
        name: record.transporter,
        total: 0,
        completed: 0,
        active: 0,
        longestChain: 0,
        withDeadline: 0,
        onTime: 0,
        standalone: 0,
        containerSet: new Set<string>(),
      };
      rows.set(record.transporter, row);
    }

    row.containerSet.add(record.container);

    if (record.cycleId) {
      row.total += 1;
      if (record.status === 'completed') {
        row.completed += 1;
        if (record.deadline) {
          row.withDeadline += 1;
          if (record.returnedAt && record.returnedAt <= record.deadline) row.onTime += 1;
        }
      } else {
        row.active += 1;
      }
      row.longestChain = Math.max(row.longestChain, record.seq ?? 0);
    }

    if (record.exception === EMPTY_RETURN_EXCEPTIONS.standaloneRequired) row.standalone += 1;
  }

  return Array.from(rows.values()).map(({ containerSet, ...row }) => ({
    ...row,
    containers: containerSet.size,
    onTimeLabel: row.withDeadline
      ? `${Math.round((row.onTime / row.withDeadline) * 100)}%`
      : '—',
  }));
}

/**
 * Everything the Matching view needs, resolved together.
 *
 * The selection self-heals: if the chosen record has moved out of `empty_ready`
 * — which happens the instant a cycle is created from it — the panel silently
 * falls back to the first eligible one rather than blanking.
 */
export function selectMatchingContext(
  records: EmptyReturnRecord[],
  missions: FullLoadMission[],
  matchSelectionId: string,
  sameLocationOnly: boolean,
): MatchingContext {
  const eligible = records.filter((r) => r.status === 'empty_ready');
  const selected =
    records.find((r) => r.id === matchSelectionId && r.status === 'empty_ready') ??
    eligible[0] ??
    null;
  const candidates = selected
    ? missions.filter((m) => !sameLocationOnly || m.locationId === selected.locationId)
    : [];

  return { eligible, selected, candidates };
}

/**
 * Whether this mission may become a cycle with this empty, and what to show.
 *
 * Only same-location and no-exception gate the button. A type mismatch does not
 * block. Missing Delivery Order, Booking or Release does not block. An
 * infeasible deadline does not block. The six chips exist to inform the decision
 * and the checklist enforces the documents afterwards — the system filters and
 * displays, Operations decides.
 */
export function evaluateMission(
  mission: FullLoadMission,
  selected: EmptyReturnRecord,
  now: number,
): MissionEligibility {
  const sameLocation = mission.locationId === selected.locationId;
  const typeCompatible = mission.type === selected.type;
  const deliveryOrderReady = mission.doStatus === 'verified';
  const bookingReady = mission.booking === 'confirmed';
  const releaseReady = mission.release === 'confirmed';
  const documentsComplete = deliveryOrderReady && bookingReady && releaseReady;
  const deadlineFeasible = selected.deadline
    ? (selected.predictedGateIn ?? now) < selected.deadline
    : false;
  const eligible = sameLocation && !selected.exception;

  const chips: MissionChip[] = [
    {
      id: 'location',
      ok: sameLocation,
      label: sameLocation ? 'Same Location ID' : `Different location (${mission.locationId})`,
    },
    { id: 'type', ok: typeCompatible, label: typeCompatible ? 'Type compatible' : 'Type mismatch' },
    { id: 'delivery-order', ok: deliveryOrderReady, label: 'Delivery Order' },
    { id: 'booking', ok: bookingReady, label: 'Booking' },
    { id: 'release', ok: releaseReady, label: 'Release' },
    {
      id: 'deadline',
      ok: deadlineFeasible,
      label: deadlineFeasible ? 'Deadline feasible' : 'Deadline not feasible',
    },
  ];

  return {
    eligible,
    blockedReason: eligible
      ? null
      : !sameLocation
        ? 'Different Location ID'
        : 'This empty is flagged for a standalone return',
    showDocumentsNote: !documentsComplete && sameLocation,
    chips,
  };
}

/**
 * The checklist a freshly created cycle starts from.
 *
 * Six boxes stay unticked because no system in this module can know them — the
 * chassis, the two return references, the pickup window, the terminal docs and
 * the transporter call. Note index 11 confirms the container type is *recorded*,
 * not that it matches; a 20GP empty paired with a 40HC full load still ticks it.
 */
function deriveChecklist(
  record: EmptyReturnRecord,
  mission: FullLoadMission,
  now: number,
): boolean[] {
  const risk = riskOf(record, now);

  return Array.from({ length: CHECKLIST_COUNT }, (_, index) => {
    switch (index) {
      case 0:
        return true;
      case 1:
        return mission.locationId === record.locationId;
      case 2:
        return true;
      case 4:
        return Boolean(record.deadline);
      case 5:
        return risk === 'safe' || risk === 'watch';
      case 8:
        return mission.booking === 'confirmed';
      case 9:
        return mission.doStatus === 'verified';
      case 10:
      case 11:
        return true;
      case 12:
        return mission.release === 'confirmed';
      default:
        return false;
    }
  });
}

/* ---------------------------------------------------------------------------
 * Boot-time derivation from the Shipments module
 * ------------------------------------------------------------------------- */

/**
 * Delivered containerized shipments, already speaking this module's dialect.
 *
 * Ids start at ERT-00201 — clear of the hand-crafted seeds (ERT-001xx) and of
 * the runtime counter (ERT-00120+), so a derived record is recognisable in a
 * bug report at a glance.
 */
const SHIPMENT_SEEDED_RETURNS: EmptyReturnRecord[] = MOCK_MISSIONS.filter(
  isDeliveredContainerShipment,
).flatMap((mission, index) => {
  const record = shipmentToEmptyReturnRecord(
    mission,
    formatId('emptyReturn', 201 + index),
    EMPTY_RETURN_EPOCH,
  );
  return record ? [record] : [];
});

/** Pending containerized shipments — the Matching pool's live half. */
const SHIPMENT_SEEDED_POOL: FullLoadMission[] = MOCK_MISSIONS.filter(isOpenFullLoadShipment)
  .map(shipmentToFullLoadMission)
  .filter((mission): mission is FullLoadMission => mission !== null);

/* ---------------------------------------------------------------------------
 * Store
 * ------------------------------------------------------------------------- */

interface EmptyReturnState {
  /** Every empty return, live. Completion appends; nothing is ever removed. */
  records: EmptyReturnRecord[];
  /** Open full-load missions. A consumable pool — creating a cycle removes one for good. */
  missions: FullLoadMission[];
  filters: EmptyReturnFilters;
  /** Record id whose detail row is open in the Cycles list. */
  expandedId: string | null;
  /** Record id pre-selected in the Matching view. Self-heals if it leaves `empty_ready`. */
  matchSelectionId: string;
  /** Matching: restrict candidate missions to the empty's own Location ID. */
  sameLocationOnly: boolean;
  /** Wall clock, refreshed on a 30s tick so risk and slack stay live. */
  now: number;
  /** The one-line confirmation banner, or null. */
  toast: string | null;
  cycleCounter: number;
  chainCounter: number;
  recordCounter: number;
}

interface EmptyReturnActions {
  /**
   * A pending containerized shipment joins the Matching pool as an open full
   * load. Idempotent by shipment id — safe to call on every shipment mutation.
   */
  registerShipmentFullLoad: (mission: Mission) => void;
  /** The shipment found a truck some other way (or was cancelled) — leave the pool. */
  withdrawShipmentFullLoad: (shipmentId: string) => void;
  /**
   * A delivered containerized shipment becomes an empty at its delivery yard,
   * starting at `unloading`. Idempotent by shipment id and by live container.
   */
  registerShipmentEmptyReturn: (mission: Mission) => void;
  /**
   * Unloading finished — the box is available. Does not clear an existing
   * exception. `emptyReadyAt` lets the caller log when it actually happened
   * (the confirmation click often comes after the fact) — defaults to now.
   */
  markEmptyReady: (recordId: string, emptyReadyAt?: number) => void;
  /** Safety cutoff hit: matching stops for this container, status is unchanged. */
  markStandaloneRequired: (recordId: string) => void;
  /** Weld an empty to a full load. Returns the new ids so the caller can navigate. */
  createCycle: (recordId: string, mission: FullLoadMission) => CycleCreationResult | null;
  toggleChecklistItem: (recordId: string, index: number) => void;
  confirmCycle: (recordId: string) => void;
  dispatchTruck: (recordId: string) => void;
  /** One milestone forward. At 11 the box is stamped returned; at 16 the loop closes. */
  advanceMilestone: (recordId: string) => void;
  /** Patch the filter bar. Closes an open row that the new filter would hide. */
  setFilters: (patch: Partial<EmptyReturnFilters>) => void;
  resetFilters: () => void;
  /** Jump target for the KPI cards: replace all filters and collapse any open row. */
  applyFilterPreset: (preset: EmptyReturnFilters) => void;
  /** Jump target for the urgent rail and the chain cards: narrow, then open one row. */
  focusRecord: (recordId: string, query: string) => void;
  setExpanded: (recordId: string | null) => void;
  setMatchSelection: (recordId: string) => void;
  setSameLocationOnly: (value: boolean) => void;
  setNow: (timestamp: number) => void;
  notify: (message: string) => void;
  dismissToast: () => void;
}

export type EmptyReturnStore = EmptyReturnState & EmptyReturnActions;

/**
 * Held outside the store because it is a browser handle, not state.
 *
 * The demo re-scheduled without clearing, so two confirmations inside 4.2s made
 * the second one vanish early. Clearing first is the whole fix.
 */
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useEmptyReturnStore = create<EmptyReturnStore>((set, get) => ({
  records: [...INITIAL_EMPTY_RETURNS, ...SHIPMENT_SEEDED_RETURNS],
  missions: [...INITIAL_FULL_LOAD_MISSIONS, ...SHIPMENT_SEEDED_POOL],
  filters: DEFAULT_EMPTY_RETURN_FILTERS,
  expandedId: null,
  matchSelectionId: 'ERT-00106',
  sameLocationOnly: true,
  now: Date.now(),
  toast: null,
  cycleCounter: EMPTY_RETURN_ID_SEEDS.cycle,
  chainCounter: EMPTY_RETURN_ID_SEEDS.chain,
  recordCounter: EMPTY_RETURN_ID_SEEDS.record,

  registerShipmentFullLoad: (mission) => {
    const state = get();
    if (state.missions.some((m) => m.shipmentId === mission.id)) return;
    const fullLoad = shipmentToFullLoadMission(mission);
    if (!fullLoad) return;
    set({ missions: [...state.missions, fullLoad] });
    get().notify(
      `Shipment ${mission.id} added to Matching as an open full load for ${fullLoad.locationName}.`,
    );
  },

  withdrawShipmentFullLoad: (shipmentId) => {
    set((state) =>
      state.missions.some((m) => m.shipmentId === shipmentId)
        ? { missions: state.missions.filter((m) => m.shipmentId !== shipmentId) }
        : state,
    );
  },

  registerShipmentEmptyReturn: (mission) => {
    const state = get();
    const container = mission.containerNumber;
    // Once per shipment — and never a second live record for the same box,
    // which also covers the cycle-completion spawn racing this registration.
    const alreadyTracked = state.records.some(
      (record) =>
        record.shipmentId === mission.id ||
        (Boolean(container) && record.container === container && record.status !== 'completed'),
    );
    if (alreadyTracked) return;

    const record = shipmentToEmptyReturnRecord(
      mission,
      formatId('emptyReturn', state.recordCounter),
      Date.now(),
    );
    if (!record) return;
    set({ records: [...state.records, record], recordCounter: state.recordCounter + 1 });
    get().notify(
      `Shipment ${mission.id} delivered — container ${record.container} is now an empty return at ${record.locationName} (Unloading).`,
    );
  },

  markEmptyReady: (recordId, emptyReadyAt) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === recordId
          ? { ...record, status: 'empty_ready', milestone: 3, emptyReadyAt: emptyReadyAt ?? Date.now() }
          : record,
      ),
    }));
    get().notify(
      'Empty ready confirmed — task "Prepare the next full load mission" created for Operations.',
    );
  },

  markStandaloneRequired: (recordId) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === recordId
          ? { ...record, exception: EMPTY_RETURN_EXCEPTIONS.standaloneRequired }
          : record,
      ),
    }));
    get().notify(
      'Safety cutoff reached: a standalone empty return is required. Matching is stopped for this container.',
    );
  },

  createCycle: (recordId, mission) => {
    // `get()` is the live store, not a render-time snapshot — the chain lookup
    // below always sees the current records even if two clicks land together.
    const state = get();
    const record = state.records.find((r) => r.id === recordId);
    if (!record) return null;

    const cycleId = formatId('cycle', state.cycleCounter);

    // A new cycle joins an existing chain only when that chain still has a live
    // cycle for the same transporter at the same location. Anything else — a
    // different carrier, a different yard, a chain that has finished — mints a
    // new chain, which is exactly how a chain "closes".
    const existing = state.records.find(
      (r) =>
        r.chainId &&
        r.transporter === record.transporter &&
        r.locationId === record.locationId &&
        r.status !== 'completed' &&
        r.id !== recordId,
    );
    const chainId = existing?.chainId ?? formatId('chain', state.chainCounter);

    // Sequence counts every cycle this carrier has run at this location,
    // completed ones included, so it keeps climbing across a chain's lifetime.
    const sequence =
      state.records.filter(
        (r) =>
          r.chainId &&
          r.transporter === record.transporter &&
          r.locationId === record.locationId,
      ).length + 1;

    set({
      records: state.records.map((r) =>
        r.id === recordId
          ? {
              ...r,
              status: 'preparing',
              milestone: 4,
              cycleId,
              chainId,
              seq: sequence,
              nextFull: {
                container: mission.container,
                type: mission.type,
                missionId: mission.id,
                client: mission.client,
                shipmentId: mission.shipmentId,
              },
              checklist: deriveChecklist(record, mission, state.now),
            }
          : r,
      ),
      missions: state.missions.filter((m) => m.id !== mission.id),
      cycleCounter: state.cycleCounter + 1,
      chainCounter: existing ? state.chainCounter : state.chainCounter + 1,
      // Filters are cleared and the new row opened so the cycle is visible the
      // moment the caller lands on the Cycles view.
      filters: DEFAULT_EMPTY_RETURN_FILTERS,
      expandedId: recordId,
    });

    get().notify(
      `Cycle ${cycleId} created in chain ${chainId} — manual selection confirmed by Operations.`,
    );

    // A pool entry that is a real shipment moves with the cycle: the returning
    // truck becomes its vehicle and its status flips to Assigned.
    if (mission.shipmentId) {
      useShipmentStore
        .getState()
        .assignShipmentToCycle(mission.shipmentId, cycleId, record.transporter, record.truck);
    }

    return { cycleId, chainId, sequence };
  },

  toggleChecklistItem: (recordId, index) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              checklist: record.checklist.map((value, i) => (i === index ? !value : value)),
            }
          : record,
      ),
    }));
  },

  confirmCycle: (recordId) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === recordId ? { ...record, status: 'ready', milestone: 7 } : record,
      ),
    }));
    get().notify('Checklist complete — cycle ready to dispatch.');
  },

  dispatchTruck: (recordId) => {
    set((state) => ({
      records: state.records.map((record) =>
        record.id === recordId
          ? {
              ...record,
              status: 'in_progress',
              milestone: 8,
              truck: record.truck || DISPATCH_FALLBACK_TRUCK,
            }
          : record,
      ),
    }));
    get().notify('Truck dispatched — the cycle is now running.');
  },

  advanceMilestone: (recordId) => {
    const state = get();
    const record = state.records.find((r) => r.id === recordId);
    if (!record) return;

    const next = record.milestone + 1;

    if (next >= MILESTONE_COUNT) {
      const completed: EmptyReturnRecord = {
        ...record,
        milestone: MILESTONE_COUNT,
        status: 'completed',
      };
      const label = record.cycleId ?? record.id;

      // A cycle can in principle be pushed to the end with no linked full load;
      // there is then nothing to spawn, so the loop simply does not close.
      if (!record.nextFull) {
        set({ records: state.records.map((r) => (r.id === recordId ? completed : r)) });
        get().notify(`Cycle ${label} completed.`);
        return;
      }

      // A spawned record linked to a real shipment inherits that shipment's
      // return commitment — the deadline was captured at booking time, so the
      // loop no longer has to close with a "deadline missing" exception.
      const linkedShipmentId = record.nextFull.shipmentId;
      const linkedShipment = linkedShipmentId
        ? useShipmentStore.getState().missions.find((m) => m.id === linkedShipmentId)
        : undefined;
      const spawnDeadline = parseMissionTimestamp(linkedShipment?.containerReturn?.deadline);

      const spawnedId = formatId('emptyReturn', state.recordCounter);
      const spawned: EmptyReturnRecord = {
        id: spawnedId,
        // The full load this cycle delivered is the next empty, once unloaded.
        container: record.nextFull.container,
        type: record.nextFull.type,
        // The line is carried over from the old record rather than the new box —
        // a demo quirk kept deliberately so the two builds agree.
        line: record.line,
        // The new empty belongs to whoever received the full load; only an
        // unlinked mission with no client on record keeps the old cycle's.
        client: record.nextFull.client ?? record.client,
        locationId: record.locationId,
        locationName: record.locationName,
        transporter: record.transporter,
        truck: null,
        emptyReadyAt: null,
        deadline: spawnDeadline,
        deadlineStatus: spawnDeadline ? 'unverified' : 'missing',
        predictedGateIn: Date.now() + 18 * HOUR_MS,
        returnedAt: null,
        status: 'unloading',
        // Not auto-chained: the next chain link is minted when Operations
        // actually picks a full load for it.
        chainId: null,
        cycleId: null,
        seq: null,
        nextFull: null,
        milestone: 2,
        checklist: Array<boolean>(CHECKLIST_COUNT).fill(false),
        exception: spawnDeadline ? null : EMPTY_RETURN_EXCEPTIONS.deadlineMissing,
        shipmentId: linkedShipmentId,
      };

      set({
        records: [...state.records.map((r) => (r.id === recordId ? completed : r)), spawned],
        recordCounter: state.recordCounter + 1,
      });
      get().notify(
        `Cycle ${label} completed — loop: new record ${spawnedId} created for ${record.nextFull.container} (status Unloading${spawnDeadline ? '' : ', deadline to be captured'}).`,
      );

      // The cycle's full load was a real shipment — its delivery is this
      // completion, so the shipment closes with it.
      if (linkedShipmentId) {
        useShipmentStore.getState().completeShipmentFromCycle(linkedShipmentId, label);
      }
      return;
    }

    const returnedAt = next === RETURN_MILESTONE ? Date.now() : record.returnedAt;
    set({
      records: state.records.map((r) =>
        r.id === recordId ? { ...r, milestone: next, returnedAt } : r,
      ),
    });
    get().notify(
      `Milestone reached: ${milestoneLabel(next - 1)}${
        next === RETURN_MILESTONE ? ' — deadline protected, timestamp + GPS captured.' : ''
      }`,
    );
  },

  setFilters: (patch) => {
    const state = get();
    const filters = { ...state.filters, ...patch };
    // A row left open behind a filter that now hides it reappears unexpectedly
    // the next time the filter is cleared, so it is collapsed here instead.
    const stillVisible =
      state.expandedId !== null &&
      selectFilteredRecords(state.records, filters, state.now).some(
        (r) => r.id === state.expandedId,
      );
    set({ filters, expandedId: stillVisible ? state.expandedId : null });
  },

  resetFilters: () => set({ filters: DEFAULT_EMPTY_RETURN_FILTERS }),

  applyFilterPreset: (preset) => set({ filters: preset, expandedId: null }),

  focusRecord: (recordId, query) =>
    set({ filters: { q: query, status: 'all', risk: 'all' }, expandedId: recordId }),

  setExpanded: (recordId) => set({ expandedId: recordId }),

  setMatchSelection: (recordId) => set({ matchSelectionId: recordId }),

  setSameLocationOnly: (value) => set({ sameLocationOnly: value }),

  setNow: (timestamp) => set({ now: timestamp }),

  notify: (message) => {
    if (toastTimer !== null) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => {
      toastTimer = null;
      set({ toast: null });
    }, EMPTY_RETURN_TOAST_MS);
  },

  dismissToast: () => {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },
}));

/**
 * Starts the 30-second clock that keeps risk and slack honest.
 *
 * Returns its own cleanup so a view can hand it straight to `useEffect`:
 * `useEffect(() => startEmptyReturnClock(), [])`.
 */
export function startEmptyReturnClock(intervalMs: number = EMPTY_RETURN_TICK_MS): () => void {
  useEmptyReturnStore.getState().setNow(Date.now());
  const timer = setInterval(() => {
    useEmptyReturnStore.getState().setNow(Date.now());
  }, intervalMs);
  return () => clearInterval(timer);
}
