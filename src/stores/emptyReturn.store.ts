import { create } from 'zustand';

import {
  CRITICAL_THRESHOLD_MS,
  DAY_MS,
  DEFAULT_CALENDAR_FILTERS,
  DEFAULT_EMPTY_RETURN_FILTERS,
  DEFAULT_PERFORMANCE_FILTERS,
  EMPTY_RETURN_EXCEPTIONS,
  EMPTY_RETURN_TICK_MS,
  EMPTY_RETURN_TOAST_MS,
  HOUR_MS,
  WATCH_THRESHOLD_MS,
} from '@/data/emptyReturnData';
import type {
  CalendarFilters,
  CycleChain,
  EmptyReturnFilters,
  EmptyReturnKpis,
  EmptyReturnRecord,
  PerformanceFilters,
  ReturnRiskLevel,
  TransporterCycleStats,
} from '@/types/emptyReturn';

/**
 * Empty Container Management's UI state, and the pure arithmetic every view
 * reads its numbers out of.
 *
 * The split matters. Everything above the store is a function of
 * `EmptyReturnRecord[]` and a timestamp — no view fetches, no view derives its
 * own risk, and two screens cannot disagree about how many containers are
 * overdue because there is exactly one function that counts them. The store
 * itself holds only what the server has no opinion about: which filters are
 * set, which container is selected, which suggestions the operator waved away
 * this session, the ticking clock and the toast.
 *
 * Domain state is not here and must not come back. Containers, cycles, chains
 * and the full-load pool are live reads of `Booking` / `EmptyReturnCycle`
 * through `@/features/empty-returns/api/queries`, shaped by
 * `@/features/empty-returns/mappers`.
 */

/* ---------------------------------------------------------------------------
 * Pure helpers — risk, margins, formatting
 * ------------------------------------------------------------------------- */

/**
 * The container's deadline risk, or null when it has no deadline to be judged by.
 *
 * `protected` is checked first and is permanent. A container is protected the
 * moment its decision is made and the deadline still holds: paired before the
 * deadline (the empty leaves under a different full load, so it can never
 * accrue detention) or physically back inside it. Nothing later — not a slower
 * clock, not a worse forecast — can pull it back into a live band.
 *
 * Everything else is the plain distance to the deadline. Deliberately not a
 * forecast: an operator acts on how long they have left to decide.
 */
export function riskOf(record: EmptyReturnRecord, now: number): ReturnRiskLevel | null {
  if (!record.deadline) return null;

  if (record.returnedAt && record.returnedAt <= record.deadline) return 'protected';
  if (record.stage === 'paired' && record.nextFull) {
    // Pairing only protects the deadline if the full load is actually collected
    // before it — a pairing scheduled past the deadline protects nothing.
    const pickupAt = record.nextFull.pickupAt;
    if (pickupAt !== null && pickupAt <= record.deadline) return 'protected';
  }
  if (record.stage === 'closed') {
    // Closed and not protected means it came back late; it stays overdue-coloured
    // rather than dropping into a live band it can no longer move within.
    return 'overdue';
  }

  const remaining = record.deadline - now;
  if (remaining < 0) return 'overdue';
  if (remaining < CRITICAL_THRESHOLD_MS) return 'critical';
  if (remaining < WATCH_THRESHOLD_MS) return 'watch';
  return 'safe';
}

/**
 * The decision window in milliseconds — how long is left to pair or plan.
 *
 * Negative once the deadline has passed. Prefers the moment the container was
 * actually resolved, so a finished record reports the margin it achieved
 * rather than a margin that keeps shrinking after the fact.
 */
export function slackOf(record: EmptyReturnRecord, now: number): number | null {
  if (!record.deadline) return null;
  const resolvedAt = record.returnedAt ?? record.nextFull?.pickupAt ?? null;
  return record.deadline - (resolvedAt ?? now);
}

/**
 * How long the container sat empty before somebody decided what to do with it.
 *
 * The module's own efficiency measure: everything between "the box is free"
 * and "the box has a plan" is dead time nobody is paid for. Open containers
 * report the time elapsed so far, which is the honest reading — the clock has
 * not stopped just because the decision has not been made.
 */
export function emptyDwellOf(record: EmptyReturnRecord, now: number): number {
  if (!record.emptyReadyAt) return 0;
  const end = record.matchedAt ?? record.plannedReturnAt ?? record.returnedAt ?? now;
  return Math.max(0, end - record.emptyReadyAt);
}

/**
 * `2d 7h` / `10h 31m`. Magnitude only — the caller says overdue or remaining.
 *
 * Anything past a day reads in days: a deadline missed by `55h` is a number
 * nobody converts in their head. Under a day it drops to hours and minutes,
 * which is the resolution that matters when a deadline is close.
 */
export function formatSpan(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const abs = Math.abs(ms);
  const days = Math.floor(abs / DAY_MS);
  const hours = Math.floor((abs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((abs % HOUR_MS) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/** `+6d 4h` / `−1h30`. The signed form, where the direction is the point. U+2212 MINUS. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${ms < 0 ? '−' : '+'}${formatSpan(ms)}`;
}

/** `14/08 17:42` — compact and 24-hour, the shape an ops screen is read at. */
export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const date = new Date(ts);
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

/** `24/08/2026 · 07:30` — the full stamp, for a deadline being quoted rather than scanned. */
export function formatStamp(ts: number | null | undefined): string {
  if (!ts) return '—';
  const date = new Date(ts);
  return `${date.toLocaleDateString('en-GB')} · ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** `17:42` — the live clock in the page header, and a calendar card's own time. */
export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** `Mon 24 Aug` — a calendar column head. */
export function formatDayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/** `Monday, 24 August 2026` — a day drill-down's title. */
export function formatFullDay(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/* ---------------------------------------------------------------------------
 * Escalation sets
 * ------------------------------------------------------------------------- */

/**
 * Is this container actually costing money right now?
 *
 * The one question every "overdue" figure on screen is really asking, and the
 * reason it is a function rather than `now > deadline`. A paired container
 * whose full load was collected *before* the deadline is finished with — the
 * box left under that truck, no detention can be charged, and the calendar
 * rolling past the deadline afterwards changes nothing. Comparing the raw
 * clock instead put "6d 21h overdue · detention 112 000 DJF" on the same row as
 * a "Deadline Protected" badge, which is the screen contradicting itself.
 *
 * Detention accrues only where `riskOf` says `overdue`: still out, deadline
 * gone, nothing decided that beat it.
 */
export function isAccruingDetention(record: EmptyReturnRecord, now: number): boolean {
  return riskOf(record, now) === 'overdue' && !record.returnedAt;
}

/**
 * The margin a resolved container actually achieved, in milliseconds.
 *
 * Positive means it beat its deadline. Null when there is nothing resolved to
 * measure — an open container has a *window*, not a margin, and `slackOf` is
 * the function for that.
 */
export function achievedMarginOf(record: EmptyReturnRecord): number | null {
  if (!record.deadline) return null;
  const resolvedAt = record.returnedAt ?? record.nextFull?.pickupAt ?? null;
  return resolvedAt === null ? null : record.deadline - resolvedAt;
}

/** What the Critical KPI counts. Kept as a predicate so the band can widen without a sweep. */
export function isCritical(risk: ReturnRiskLevel | null): boolean {
  return risk === 'critical';
}

/** Critical or already past — the "act now" set the Control Tower puts on top. */
export function isEscalated(risk: ReturnRiskLevel | null): boolean {
  return isCritical(risk) || risk === 'overdue';
}

/** A container that still needs a decision from somebody. */
export function isOpen(record: EmptyReturnRecord): boolean {
  return record.stage !== 'closed';
}

/** A container waiting on the one decision this module exists to make. */
export function isAwaitingDecision(record: EmptyReturnRecord): boolean {
  return record.stage === 'empty';
}

/* ---------------------------------------------------------------------------
 * Pure derivations
 * ------------------------------------------------------------------------- */

export function selectKpis(records: EmptyReturnRecord[], now: number): EmptyReturnKpis {
  return {
    emptyReady: records.filter((r) => r.stage === 'empty').length,
    assigned: records.filter((r) => r.stage === 'paired').length,
    standalone: records.filter((r) => r.stage === 'return_planned').length,
    critical: records.filter((r) => isOpen(r) && isCritical(riskOf(r, now))).length,
    overdue: records.filter((r) => isOpen(r) && riskOf(r, now) === 'overdue').length,
  };
}

/** Everything a query string on this module is allowed to reach. */
function haystackOf(record: EmptyReturnRecord): string {
  return [
    record.id,
    record.bookingReference,
    record.container,
    record.client,
    record.transporter,
    record.line,
    record.size,
    record.locationName,
    record.returnDepot,
    record.prevLoad,
    record.shipmentReference,
    record.cycleId,
    record.chainId,
    record.exception,
    record.nextFull?.container,
    record.nextFull?.missionId,
    record.nextFull?.shipmentReference,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}

/**
 * The Control Tower queue: filtered, then sorted by decision window.
 *
 * The sort is the editorial stance — this is a triage queue, not an id list.
 * Containers with no deadline have no window and therefore sort last,
 * permanently.
 */
export function selectFilteredRecords(
  records: EmptyReturnRecord[],
  filters: EmptyReturnFilters,
  now: number,
): EmptyReturnRecord[] {
  const query = filters.q.trim().toLowerCase();

  return records
    .filter((record) => {
      if (filters.stage !== 'all' && record.stage !== filters.stage) return false;
      if (filters.risk === 'action' || filters.risk === 'on_track') {
        /* Roll-ups, not levels — see `EmptyReturnRiskFilter`. These have to
           agree exactly with the bands the Control Tower renders, or a segment
           opens a different set from the one it counted. */
        const level = riskOf(record, now);
        const inBand =
          filters.risk === 'action'
            ? level === 'overdue' || level === 'critical'
            : level === 'safe' || level === 'protected' || level === null;
        if (!inBand) return false;
      } else if (filters.risk !== 'all' && riskOf(record, now) !== filters.risk) {
        return false;
      }
      if (query && !haystackOf(record).includes(query)) return false;
      return true;
    })
    .sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity));
}

/** Search alone, ignoring the stage/risk selects — for a header search box. */
export function matchesQuery(record: EmptyReturnRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystackOf(record).includes(needle);
}

/**
 * The urgent rail — a different set from the queue.
 *
 * Closed containers and ones with no deadline are excluded: this answers "what
 * will breach if nobody moves", and neither of those can.
 */
export function selectUrgentRecords(
  records: EmptyReturnRecord[],
  now: number,
  limit = 5,
): EmptyReturnRecord[] {
  return records
    .filter((r) => isOpen(r) && r.deadline && !r.returnedAt)
    .sort((a, b) => (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity))
    .slice(0, limit);
}

/**
 * Chains, newest first, with their header figures resolved.
 *
 * A chain is a lineage, not a grouping: link *n+1* exists because its container
 * is the full load link *n* went out to collect, which the backend records as
 * `chainId` + `seq`. Grouping is by that id alone — the module used to infer
 * chains from "same transporter, same yard", which invented links that were
 * never operationally connected.
 *
 * `pairings` is the number the whole product is measured by: every link that
 * ended in a pairing is one empty return that was never driven.
 */
export function selectChains(records: EmptyReturnRecord[], now: number = Date.now()): CycleChain[] {
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
    const last = cycles[cycles.length - 1];
    if (!first || !last) return;

    const pairings = cycles.filter((c) => Boolean(c.nextFull)).length;
    const completed = cycles.filter((c) => c.stage === 'closed').length;
    const active = cycles.find((c) => c.stage !== 'closed') ?? null;
    const onTime = cycles.filter((c) => riskOf(c, now) === 'protected').length;
    const averageEmptyMs =
      cycles.reduce((total, c) => total + emptyDwellOf(c, now), 0) / cycles.length;

    chains.push({
      id,
      cycles,
      first,
      last,
      pairings,
      completed,
      active,
      onTime,
      // The chain ends where a box came home alone — nothing was handed forward.
      closedChain: last.stage === 'closed' && !last.nextFull,
      maxSequence: cycles.reduce((max, c) => Math.max(max, c.seq ?? 0), 0),
      averageEmptyMs,
      /* Fleetin Impact is judged server-side and rides on each row; only the
         link that carries the count has a figure, so adding the links never
         adds one trip twice. A row with no record adds nothing. */
      avoidedKm: Math.round(cycles.reduce((total, c) => total + (c.avoidedKm ?? 0), 0) * 10) / 10,
      avoidedCo2Kg: Math.round(cycles.reduce((total, c) => total + (c.avoidedCo2Kg ?? 0), 0) * 10) / 10,
      actualCo2Kg:
        Math.round(cycles.reduce((total, c) => total + (c.co2EmissionsKg ?? 0), 0) * 10) / 10,
      realizedLinks: cycles.filter((c) => c.impactStatus === 'realized').length,
      /* Counted separately: a realized link with two different trucks has no
         factor to price its saving with, so the kg figure understates it. */
      unpricedLinks: cycles.filter(
        (c) => c.impactStatus === 'realized' && c.impactCounted && c.avoidedCo2Kg === null,
      ).length,
    });
  });

  return chains.sort((a, b) => b.cycles.length - a.cycles.length);
}

/**
 * A chain is never "completed". It is in one of three states.
 *
 * | State        | What is true                                                  |
 * |--------------|---------------------------------------------------------------|
 * | `running`    | a link is still open — somebody owes this chain a decision     |
 * | `handed_on`  | every link closed, and the last one paired out — the box it handed forward has not been emptied yet |
 * | `closed`     | the last empty went back to the depot alone — nothing to hand forward |
 *
 * The distinction matters because only `closed` is an *ending*. `handed_on`
 * looks identical in the data (no active link) and is the opposite thing: the
 * chain is alive and waiting on a container that is still loaded. Calling that
 * "closed at the depot" told the operator a box had come home when it had not,
 * and printed a final return of 0 directly beside the claim.
 */
export type ChainState = 'running' | 'handed_on' | 'closed';

export function chainStateOf(chain: CycleChain): ChainState {
  if (chain.active !== null) return 'running';
  return chain.closedChain ? 'closed' : 'handed_on';
}

/**
 * The chain has stopped handing boxes forward.
 *
 * True for both `handed_on` and `closed` — the admin console counts "running
 * chains" and neither of those is one. Use `chainStateOf` when the difference
 * between waiting and finished matters.
 */
export function isChainBroken(chain: CycleChain): boolean {
  return chainStateOf(chain) !== 'running';
}

/**
 * One row per transporter, in order of first appearance.
 *
 * `containers` counts every box the carrier has touched; the cycle figures
 * count only records that carry a cycle id. The asymmetry is the point — a
 * carrier can be holding three boxes and running no cycles at all.
 */
export function selectTransporterStats(
  records: EmptyReturnRecord[],
  now: number = Date.now(),
): TransporterCycleStats[] {
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

    if (record.container) row.containerSet.add(record.container);

    if (record.cycleId) {
      row.total += 1;
      if (record.stage === 'closed') {
        row.completed += 1;
        if (record.deadline) {
          row.withDeadline += 1;
          if (riskOf(record, now) === 'protected') row.onTime += 1;
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
    onTimeLabel: row.withDeadline ? `${Math.round((row.onTime / row.withDeadline) * 100)}%` : '—',
  }));
}

/* ---------------------------------------------------------------------------
 * Store — UI state only
 * ------------------------------------------------------------------------- */

/**
 * Suggestions the operator has waved away, keyed by full load.
 *
 * Session-scoped on purpose. "Not this one" is a judgement about right now —
 * the yard changes, the deadline moves, and a rejection that outlived the shift
 * would quietly hide the only option a critical container has left. Clearing on
 * reload is the honest default.
 */
type RejectionMap = Record<string, string[]>;

interface EmptyReturnState {
  filters: EmptyReturnFilters;
  calendarFilters: CalendarFilters;
  performanceFilters: PerformanceFilters;
  /** The container whose detail dialog is open, by record id. */
  openRecordId: string | null;
  /** `select` opens that dialog straight on the Find Full Load step. */
  openRecordIntent: 'detail' | 'select' | 'return' | null;
  /** The container selected in the Matching workbench's left column. */
  selectedEmptyId: string | null;
  /** `{ [loadId]: recordId[] }` — rejected pairings for this session. */
  rejected: RejectionMap;
  /** Wall clock, refreshed on a 30s tick so risk stays live. */
  now: number;
  /** The one-line confirmation banner, or null. */
  toast: string | null;
}

interface EmptyReturnActions {
  setFilters: (patch: Partial<EmptyReturnFilters>) => void;
  resetFilters: () => void;
  applyFilterPreset: (preset: EmptyReturnFilters) => void;
  setCalendarFilters: (patch: Partial<CalendarFilters>) => void;
  setPerformanceFilters: (patch: Partial<PerformanceFilters>) => void;
  /** Jump target from anywhere: narrow the queue, then open one container. */
  focusRecord: (recordId: string, query: string) => void;
  openRecord: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  closeRecord: () => void;
  selectEmpty: (recordId: string | null) => void;
  rejectPairing: (loadId: string, recordId: string) => void;
  restorePairing: (loadId: string, recordId: string) => void;
  setNow: (timestamp: number) => void;
  notify: (message: string) => void;
  dismissToast: () => void;
}

export type EmptyReturnStore = EmptyReturnState & EmptyReturnActions;

/**
 * Held outside the store because it is a browser handle, not state.
 *
 * Rescheduling without clearing made two confirmations inside 5.6s cancel each
 * other, so the second one vanished early. Clearing first is the whole fix.
 */
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useEmptyReturnStore = create<EmptyReturnStore>((set) => ({
  filters: DEFAULT_EMPTY_RETURN_FILTERS,
  calendarFilters: DEFAULT_CALENDAR_FILTERS,
  performanceFilters: DEFAULT_PERFORMANCE_FILTERS,
  openRecordId: null,
  openRecordIntent: null,
  selectedEmptyId: null,
  rejected: {},
  now: Date.now(),
  toast: null,

  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_EMPTY_RETURN_FILTERS }),
  applyFilterPreset: (preset) => set({ filters: preset, openRecordId: null, openRecordIntent: null }),

  setCalendarFilters: (patch) =>
    set((state) => ({ calendarFilters: { ...state.calendarFilters, ...patch } })),
  setPerformanceFilters: (patch) =>
    set((state) => ({ performanceFilters: { ...state.performanceFilters, ...patch } })),

  focusRecord: (recordId, query) =>
    set({
      filters: { q: query, stage: 'all', risk: 'all' },
      openRecordId: recordId,
      openRecordIntent: 'detail',
    }),

  openRecord: (recordId, intent = 'detail') =>
    set({ openRecordId: recordId, openRecordIntent: intent }),
  closeRecord: () => set({ openRecordId: null, openRecordIntent: null }),

  selectEmpty: (recordId) => set({ selectedEmptyId: recordId }),

  rejectPairing: (loadId, recordId) =>
    set((state) => ({
      rejected: { ...state.rejected, [loadId]: [...(state.rejected[loadId] ?? []), recordId] },
    })),
  restorePairing: (loadId, recordId) =>
    set((state) => ({
      rejected: {
        ...state.rejected,
        [loadId]: (state.rejected[loadId] ?? []).filter((id) => id !== recordId),
      },
    })),

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
 * The full loads this container has been waved away from, this session.
 *
 * A selector rather than a raw read because the rejection map is keyed the
 * other way round — by load, since that is how the operator rejects — and every
 * caller wants it per container.
 */
export function rejectedLoadsFor(rejected: RejectionMap, recordId: string): string[] {
  return Object.entries(rejected)
    .filter(([, ids]) => ids.includes(recordId))
    .map(([loadId]) => loadId);
}

/**
 * Starts the 30-second clock that keeps risk honest.
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
