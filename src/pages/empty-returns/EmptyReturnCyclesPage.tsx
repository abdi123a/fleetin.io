import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/design-system';
import { Download, Plus } from '@/design-system/icons';
import { PageHeader } from '@/components';
import { riskOf, slackOf, selectFilteredRecords, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import { useAvailableEmpties, useChains as useRealChains, useCycles } from '@/features/empty-returns/api/queries';
import { chainToCycleChain, cycleToRow, emptyBookingToRow } from '@/features/empty-returns/mappers';
import type { EmptyReturnRecord, ReturnRiskLevel } from '@/types/emptyReturn';

import { ChainsTabPanel } from './components/ChainsTabPanel';
import { CycleDetailModal } from './components/CycleDetailModal';
import { CyclesBoard, type SortState } from './components/CyclesBoard';
import { DualTransactionsRecommendationsModal } from './components/DualTransactionsRecommendationsModal';
import { EmptyReturnCyclesTabNav, type CyclesTabKey } from './components/EmptyReturnCyclesTabNav';

/** Worst first — the order the Urgency column sorts ascending in. */
const URGENCY_SORT_RANK: Record<ReturnRiskLevel | 'none', number> = {
  overdue: 0,
  at_risk: 1,
  critical: 2,
  watch: 3,
  safe: 4,
  protected: 5,
  none: 6,
};

/**
 * Empty Return Cycles — the module's working list.
 *
 * The page owns data, filters and sort; `CyclesBoard` owns every control and
 * the list itself. That split is the point of the rewrite: the old page held
 * a filter panel, a count line, a 450-row table and both empty states inline,
 * and rendered every record it had in one uncut column.
 */
export function EmptyReturnCyclesPage() {
  const filters = useEmptyReturnStore((state) => state.filters);
  const now = useEmptyReturnStore((state) => state.now);
  const expandedId = useEmptyReturnStore((state) => state.expandedId);
  const storeSetFilters = useEmptyReturnStore((state) => state.setFilters);
  const resetFilters = useEmptyReturnStore((state) => state.resetFilters);
  const setExpanded = useEmptyReturnStore((state) => state.setExpanded);
  const setNow = useEmptyReturnStore((state) => state.setNow);
  const focusRecord = useEmptyReturnStore((state) => state.focusRecord);

  // Every empty return, live: matched cycles plus whatever's delivered and
  // still waiting for a match. Both queries return arrays already shaped for
  // display by @/features/empty-returns/mappers — no local id-minting here.
  const cyclesQuery = useCycles();
  const availableEmptiesQuery = useAvailableEmpties();
  const isLoading = cyclesQuery.isLoading || availableEmptiesQuery.isLoading;
  const isError = cyclesQuery.isError || availableEmptiesQuery.isError;
  const records = useMemo(
    () => [
      ...(cyclesQuery.data ?? []).map((cycle) => cycleToRow(cycle, now)),
      ...(availableEmptiesQuery.data ?? []).map((booking) => emptyBookingToRow(booking, now)),
    ],
    [cyclesQuery.data, availableEmptiesQuery.data, now],
  );
  const setFilters = useCallback(
    (patch: Partial<typeof filters>) => storeSetFilters(patch, records),
    [storeSetFilters, records],
  );

  // Cycles and Chains used to be separate routes; they're now one tab-switched
  // page. The tab lives in the URL (`?tab=chains`) so it stays linkable and
  // bookmarkable — the reason the two views were routes in the first place.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: CyclesTabKey = tabParam === 'chains' ? 'chains' : 'cycles';
  const chainsQuery = useRealChains();
  const chains = useMemo(
    () => (chainsQuery.data ?? []).map((chain) => chainToCycleChain(chain, now)),
    [chainsQuery.data, now],
  );

  const handleTabChange = useCallback(
    (tab: CyclesTabKey) => {
      setSearchParams(
        (prev) => {
          if (tab === 'cycles') {
            prev.delete('tab');
          } else {
            prev.set('tab', tab);
          }
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleOpenChainCycle = useCallback(
    (cycle: EmptyReturnRecord) => {
      // Narrow the Cycles tab to this cycle, then switch to it.
      focusRecord(cycle.id, cycle.cycleId ?? cycle.id);
      handleTabChange('cycles');
    },
    [focusRecord, handleTabChange],
  );

  const [sort, setSort] = useState<SortState>({ key: 'deadline', dir: 'asc' });
  const [partyFilter, setPartyFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(now);
  // The one matching workbench, everywhere a cycle gets created — see
  // DualTransactionsRecommendationsModal. The old standalone Matching route
  // is gone; every "create a match" entry point on this page opens this
  // instead.
  const [matchOpen, setMatchOpen] = useState(false);
  const openMatching = useCallback(() => setMatchOpen(true), []);

  const parties = useMemo(() => {
    const names = new Set<string>();
    for (const record of records) {
      names.add(record.client);
      names.add(record.transporter);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [records]);

  /*
   * Filter by location ID, but LABEL by yard name. The dropdown used to list
   * raw ids, which asked the reader to know that LOC-00003 is PK12 — the
   * record carries the name, so there is no reason to make them.
   */
  const locations = useMemo(() => {
    const byId = new Map<string, string>();
    for (const record of records) {
      if (!byId.has(record.locationId)) byId.set(record.locationId, record.locationName);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  /** Party and location narrow the list here; status, urgency and search in the store. */
  const narrow = useCallback(
    (list: EmptyReturnRecord[]) => {
      let out = list;
      if (partyFilter !== 'all') {
        out = out.filter((r) => r.client === partyFilter || r.transporter === partyFilter);
      }
      if (locationFilter !== 'all') {
        out = out.filter((r) => r.locationId === locationFilter);
      }
      return out;
    },
    [partyFilter, locationFilter],
  );

  /**
   * The list with everything applied except urgency — what the cut buttons
   * count against, so "Overdue 31" means 31 rows one click away.
   */
  const rowsBeforeRisk = useMemo(
    () => narrow(selectFilteredRecords(records, { ...filters, risk: 'all' }, now)),
    [records, filters, now, narrow],
  );

  const rows = useMemo(() => {
    const list = narrow(selectFilteredRecords(records, filters, now));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const sorted = [...list];

    sorted.sort((a, b) => {
      switch (sort.key) {
        case 'reference':
          return dir * (a.cycleId ?? a.id).localeCompare(b.cycleId ?? b.id);
        case 'party':
          return dir * a.client.localeCompare(b.client);
        case 'urgency': {
          const rank =
            URGENCY_SORT_RANK[riskOf(a, now) ?? 'none'] - URGENCY_SORT_RANK[riskOf(b, now) ?? 'none'];
          if (rank !== 0) return dir * rank;
          return dir * ((slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity));
        }
        case 'deadline':
        default:
          return dir * ((slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity));
      }
    });

    return sorted;
  }, [records, filters, now, narrow, sort]);

  /**
   * The cycle whose detail dialog is open. Looked up against the full record
   * list, not the filtered rows — a dialog opened from the Chains tab or the
   * dashboard stays up even while the board behind it is narrowed.
   */
  const expandedRecord = useMemo(
    () => records.find((record) => record.id === expandedId) ?? null,
    [records, expandedId],
  );

  const anyFilterActive =
    filters.q !== '' ||
    filters.status !== 'all' ||
    filters.risk !== 'all' ||
    partyFilter !== 'all' ||
    locationFilter !== 'all';

  const clearAllFilters = useCallback(() => {
    resetFilters();
    setPartyFilter('all');
    setLocationFilter('all');
  }, [resetFilters]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    Promise.all([cyclesQuery.refetch(), availableEmptiesQuery.refetch(), chainsQuery.refetch()]).finally(
      () => {
        const stamped = Date.now();
        setNow(stamped);
        setUpdatedAt(stamped);
        setIsRefreshing(false);
      },
    );
  }, [cyclesQuery, availableEmptiesQuery, chainsQuery, setNow]);

  const refreshLabel = useMemo(() => {
    const mins = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000));
    return mins <= 0 ? 'Updated just now' : `Updated ${mins}m ago`;
  }, [updatedAt]);

  useEffect(() => {
    setUpdatedAt(now);
  }, [now]);

  return (
    // `w-full min-w-0`: the app shell lays pages out as flex items, so this
    // wrapper is sized from its content unless told otherwise — without
    // `min-w-0` it takes its min-content width and scrolls a phone sideways,
    // and without `w-full` it takes its max-content width, which leaves the
    // Chains board sitting at half the screen on a desktop.
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 px-4 pb-12 sm:px-6">
      {/* Tabs sit above the title on purpose: they're the primary choice on
          this page (which dataset am I looking at), so they read first, and
          the title/description right under them belong to whichever tab is
          active rather than describing the page as a whole. */}
      <EmptyReturnCyclesTabNav
        active={activeTab}
        onChange={handleTabChange}
        chainsCount={chains.length}
      />

      <PageHeader
        title={activeTab === 'cycles' ? 'Empty Return Cycles' : 'Cycle Chains'}
        description={
          activeTab === 'cycles'
            ? 'Every empty going back, and the full load it carries out on the way. Pick an urgency cut, then work the page.'
            : 'Every chain as a pyramid, read top to bottom: where it started, each handover, and where it broke. A chain only ends when an empty comes back on its own.'
        }
        actions={
          activeTab === 'cycles' ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button" className="shadow-2xs">
                <Download className="size-4" aria-hidden />
                Export
              </Button>
              <Button size="sm" type="button" className="shadow-xs" onClick={openMatching}>
                <Plus className="size-4" aria-hidden />
                New Cycle
              </Button>
            </div>
          ) : undefined
        }
      />

      {activeTab === 'chains' && (
        <div id="cycles-panel-chains" role="tabpanel" aria-labelledby="cycles-tab-chains">
          <ChainsTabPanel
            chains={chains}
            onOpenCycle={handleOpenChainCycle}
            onOpenMatching={openMatching}
          />
        </div>
      )}

      {activeTab === 'cycles' && (
        <div id="cycles-panel-cycles" role="tabpanel" aria-labelledby="cycles-tab-cycles">
          <CyclesBoard
            records={records}
            rows={rows}
            rowsBeforeRisk={rowsBeforeRisk}
            now={now}
            filters={filters}
            onFiltersChange={setFilters}
            partyFilter={partyFilter}
            onPartyFilterChange={setPartyFilter}
            parties={parties}
            locationFilter={locationFilter}
            onLocationFilterChange={setLocationFilter}
            locations={locations}
            sort={sort}
            onSortChange={setSort}
            onClearFilters={clearAllFilters}
            anyFilterActive={anyFilterActive}
            isLoading={isLoading}
            isError={isError}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            refreshLabel={refreshLabel}
            expandedId={expandedId}
            onOpenRecord={setExpanded}
            onCreate={openMatching}
          />
        </div>
      )}

      {/* Cycle detail — opens over the board instead of pushing rows apart */}
      {activeTab === 'cycles' && (
        <CycleDetailModal
          record={expandedRecord}
          now={now}
          onClose={() => setExpanded(null)}
          onOpenMatching={openMatching}
        />
      )}

      <DualTransactionsRecommendationsModal open={matchOpen} onOpenChange={setMatchOpen} />
    </div>
  );
}

export default EmptyReturnCyclesPage;
