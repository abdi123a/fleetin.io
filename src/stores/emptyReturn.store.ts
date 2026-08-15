import { create } from 'zustand';

import {
  CRITICAL_THRESHOLD_MS,
  DEFAULT_EMPTY_RETURN_FILTERS,
  EMPTY_RETURN_EXCEPTIONS,
  EMPTY_RETURN_STATUS_META,
  EMPTY_RETURN_TICK_MS,
  EMPTY_RETURN_TOAST_MS,
  HOUR_MS,
  WATCH_THRESHOLD_MS,
} from '@/data/emptyReturnData';
import type {
  CycleChain,
  EmptyReturnFilters,
  EmptyReturnKpis,
  EmptyReturnRecord,
  ReturnRiskLevel,
  TransporterCycleStats,
} from '@/types/emptyReturn';

/**
 * The empty-return module's UI state: filters, which row is expanded, the
 * ticking clock, and the one-line confirmation toast. Everything the module
 * used to hold here as *domain* state — records, the mission pool, the id
 * counters, and the seven actions that mutated a cycle's own status — is
 * gone. A cycle's status is never set directly anymore; it is a live read of
 * `Booking`/`EmptyReturnCycle` via `@/features/empty-returns/api/queries`,
 * mapped to this module's display shapes by `@/features/empty-returns/mappers`.
 *
 * The pure derivations below (`riskOf`, `slackOf`, `selectKpis`, …) needed no
 * changes at all to make that split: they always took `EmptyReturnRecord[]`
 * as a plain argument, never read the store internally, so they work
 * identically whether that array came from mock seeds or a real API
 * response. They stay here because nothing about them is stateful — they are
 * kept beside the type they operate on, not promoted to `mappers.ts`, which
 * only holds the real-data → view-model conversion.
 */

/* ---------------------------------------------------------------------------
 * Pure helpers — risk, slack, formatting
 * ------------------------------------------------------------------------- */

/**
 * The record's deadline risk, or null when it has no deadline to be judged by.
 *
 * Two short-circuits carry the whole meaning. `protected` is checked *first* and
 * is permanent: once the box is back on or before its deadline nothing — not a
 * later clock, not a worse prediction — can make it read anything else.
 * `overdue` is checked before the slack maths and requires the box to still be
 * out; a box returned *late* falls through both and lands in the slack bands,
 * which is deliberate and not an oversight.
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

/**
 * `+6d 4h` / `−139d` / `−1h30`. The sign is U+2212 MINUS.
 *
 * Anything past a day reads in days: a deadline missed by `−3342h18` is a
 * number nobody converts in their head, and the slack on this module routinely
 * runs into the hundreds of hours. Under a day it stays in hours and minutes,
 * which is the resolution that matters when a gate-in is close.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const negative = ms < 0;
  const abs = Math.abs(ms);
  const sign = negative ? '−' : '+';

  const totalHours = Math.floor(abs / HOUR_MS);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours === 0 ? `${sign}${days}d` : `${sign}${days}d ${hours}h`;
  }

  const minutes = Math.floor((abs % HOUR_MS) / 60_000);
  return `${sign}${totalHours}h${String(minutes).padStart(2, '0')}`;
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
 * `isCritical` is what the KPI card and the `crit` filter count; `isEscalated`
 * adds `overdue` and is what the row detail treats as "the safety cutoff is
 * in play".
 */
export function isCritical(risk: ReturnRiskLevel | null): boolean {
  return risk === 'critical' || risk === 'at_risk';
}

export function isEscalated(risk: ReturnRiskLevel | null): boolean {
  return isCritical(risk) || risk === 'overdue';
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
 * Kept for any caller still deriving a chain from a flat `records` array
 * (e.g. a filtered subset); the Chains tab itself now prefers
 * `chainToCycleChain` over the real `GET /empty-returns/chains` response,
 * which resolves the same figures server-side instead of re-deriving them.
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
 * A chain is never "completed" — it is running or it is broken, and it breaks
 * exactly one way: an empty comes back on its own, leaving nothing to hand
 * forward. Two shapes say that. `active === null` is the one the data
 * actually produces: every link has finished and none was added after, which
 * means the last box came home alone. `!last.nextFull` is the explicit form —
 * a final link carrying no full load out — which appears once a standalone
 * return is recorded against the chain directly.
 *
 * Derived here rather than read off `statusLabel`, which describes the active
 * *cycle* and reads "Completed" — a state a chain cannot be in.
 */
export function isChainBroken(chain: CycleChain): boolean {
  const last = chain.cycles[chain.cycles.length - 1];
  return chain.active === null || (last ? !last.nextFull : false);
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

/* ---------------------------------------------------------------------------
 * Store — UI state only
 * ------------------------------------------------------------------------- */

interface EmptyReturnState {
  filters: EmptyReturnFilters;
  /** Record id whose detail row is open in the Cycles list. */
  expandedId: string | null;
  /** Wall clock, refreshed on a 30s tick so risk and slack stay live. */
  now: number;
  /** The one-line confirmation banner, or null. */
  toast: string | null;
}

interface EmptyReturnActions {
  /** Patch the filter bar. Closes an open row that the new filter would hide — needs the live record list to check against. */
  setFilters: (patch: Partial<EmptyReturnFilters>, records: EmptyReturnRecord[]) => void;
  resetFilters: () => void;
  /** Jump target for the KPI cards: replace all filters and collapse any open row. */
  applyFilterPreset: (preset: EmptyReturnFilters) => void;
  /** Jump target for the urgent rail and the chain cards: narrow, then open one row. */
  focusRecord: (recordId: string, query: string) => void;
  setExpanded: (recordId: string | null) => void;
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

export const useEmptyReturnStore = create<EmptyReturnStore>((set) => ({
  filters: DEFAULT_EMPTY_RETURN_FILTERS,
  expandedId: null,
  now: Date.now(),
  toast: null,

  setFilters: (patch, records) => {
    set((state) => {
      const filters = { ...state.filters, ...patch };
      // A row left open behind a filter that now hides it reappears unexpectedly
      // the next time the filter is cleared, so it is collapsed here instead.
      const stillVisible =
        state.expandedId !== null &&
        selectFilteredRecords(records, filters, state.now).some((r) => r.id === state.expandedId);
      return { filters, expandedId: stillVisible ? state.expandedId : null };
    });
  },

  resetFilters: () => set({ filters: DEFAULT_EMPTY_RETURN_FILTERS }),

  applyFilterPreset: (preset) => set({ filters: preset, expandedId: null }),

  focusRecord: (recordId, query) =>
    set({ filters: { q: query, status: 'all', risk: 'all' }, expandedId: recordId }),

  setExpanded: (recordId) => set({ expandedId: recordId }),

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
