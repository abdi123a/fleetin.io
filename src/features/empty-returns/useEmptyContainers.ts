import { useCallback, useMemo } from 'react';

import { useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';

import { useAvailableEmpties, useCycles, useOpenFullLoads } from './api/queries';
import { bookingToFullLoadMission, cycleToRow, emptyBookingToRow } from './mappers';
import { unclaimedLoads } from './matching';

/**
 * The module's single source of truth, assembled once.
 *
 * All five views — Control Tower, Calendar, Matching, Cycles, Dashboard — read
 * from here and nowhere else. That is the point: the Control Tower's "3
 * critical" and the Dashboard's "3 critical" are the same three rows out of the
 * same array, not two fetches that happened to agree. React Query dedupes the
 * three underlying requests across every mounted view, so the cost of sharing
 * is zero and the cost of *not* sharing was two screens quietly disagreeing.
 *
 * The container list is the union of two real sources — delivered bookings
 * nothing has claimed yet, and cycles — because that union is what an operator
 * means by "the containers I am managing". Neither table alone is that list.
 */
export interface EmptyContainersModel {
  /** Every container under management, unmatched and matched alike. */
  records: EmptyReturnRecord[];
  /** Containers still awaiting the pair-or-return decision. */
  awaiting: EmptyReturnRecord[];
  /**
   * Every container still OUT — undecided, or decided to go back alone.
   *
   * What the matching board lists. A container flagged "standalone" has had a
   * decision made about it, but it is still sitting in a yard racing its own
   * deadline and the operator is still allowed to change their mind — which is
   * the whole reason `markStandalone` is reversible. Dropping it from the board
   * the moment it was flagged meant the one screen for acting on empties went
   * blank while seven of them were still out.
   *
   * Paired and closed boxes are not here: a pairing has a cycle carrying it,
   * and a closed one is home.
   */
  onBoard: EmptyReturnRecord[];
  /** Open full loads nothing has claimed — the demand side of matching. */
  loads: FullLoadMission[];
  /** Wall clock, ticking. Every derived figure is measured against it. */
  now: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** One container by record id — the id the dialogs are keyed on. */
  byId: (recordId: string | null | undefined) => EmptyReturnRecord | undefined;
  /** One load by its `BKG-####`. */
  loadById: (loadId: string | null | undefined) => FullLoadMission | undefined;
}

export function useEmptyContainers(): EmptyContainersModel {
  const now = useEmptyReturnStore((state) => state.now);

  const cyclesQuery = useCycles();
  const availableQuery = useAvailableEmpties();
  const loadsQuery = useOpenFullLoads();

  const records = useMemo(() => {
    const fromCycles = (cyclesQuery.data ?? []).map((cycle) => cycleToRow(cycle, now));
    const fromBookings = (availableQuery.data ?? []).map((booking) =>
      emptyBookingToRow(booking, now),
    );
    /* A booking can appear on both sides for one render after a pairing is
     * confirmed — the cycles list refetches before the available-empties list
     * drops it — which would otherwise show the same box twice, once paired and
     * once still asking. The cycle is the newer truth, so it wins. */
    const cycled = new Set(fromCycles.map((record) => record.bookingReference));
    return [...fromCycles, ...fromBookings.filter((r) => !cycled.has(r.bookingReference))];
  }, [cyclesQuery.data, availableQuery.data, now]);

  const awaiting = useMemo(() => records.filter((r) => r.stage === 'empty'), [records]);

  const onBoard = useMemo(
    () => records.filter((r) => r.stage === 'empty' || r.stage === 'return_planned'),
    [records],
  );

  const loads = useMemo(
    () => unclaimedLoads((loadsQuery.data ?? []).map(bookingToFullLoadMission), records),
    [loadsQuery.data, records],
  );

  const byId = useCallback(
    (recordId: string | null | undefined) =>
      recordId ? records.find((record) => record.id === recordId) : undefined,
    [records],
  );

  const loadById = useCallback(
    (loadId: string | null | undefined) =>
      loadId ? loads.find((load) => load.id === loadId) : undefined,
    [loads],
  );

  const refetch = useCallback(() => {
    void cyclesQuery.refetch();
    void availableQuery.refetch();
    void loadsQuery.refetch();
  }, [cyclesQuery, availableQuery, loadsQuery]);

  return {
    records,
    awaiting,
    onBoard,
    loads,
    now,
    isLoading: cyclesQuery.isLoading || availableQuery.isLoading || loadsQuery.isLoading,
    isError: cyclesQuery.isError || availableQuery.isError || loadsQuery.isError,
    error:
      (cyclesQuery.error as Error | null) ??
      (availableQuery.error as Error | null) ??
      (loadsQuery.error as Error | null) ??
      null,
    refetch,
    byId,
    loadById,
  };
}
