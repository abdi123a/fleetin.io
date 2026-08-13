import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconChip, Input, Select, Skeleton, Tooltip } from '@/design-system';
import {
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Layers,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  ShieldCheck,
  X,
} from '@/design-system/icons';
import { PageHeader } from '@/components';
import { ROUTES } from '@/config/routes';
import {
  EMPTY_RETURN_RISK_FILTER_OPTIONS,
  EMPTY_RETURN_STATUS_FILTER_OPTIONS,
  WATCH_THRESHOLD_MS,
} from '@/data/emptyReturnData';
import {
  riskOf,
  selectFilteredRecords,
  slackOf,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type {
  EmptyReturnRecord,
  EmptyReturnRiskFilter,
  EmptyReturnStatusFilter,
  ReturnRiskLevel,
} from '@/types/emptyReturn';
import { cn } from '@/utils';

import { ChainsTabPanel, useChains } from './components/ChainsTabPanel';
import { CycleDetailModal } from './components/CycleDetailModal';
import { Mono } from './components/atoms';
import { EmptyReturnCyclesTabNav, type CyclesTabKey } from './components/EmptyReturnCyclesTabNav';
import {
  ContainerSwap,
  DeadlineCell,
  LifecycleChip,
  PartyCell,
  UrgencyBadge,
} from './components/ui';

type Density = 'comfortable' | 'compact';
type SortMode = 'deadline' | 'reference' | 'urgency';
type KpiKey = 'overdue' | 'at_risk' | 'due_12h' | 'protected' | null;
type PageStatus = 'ready' | 'loading' | 'error';

const URGENCY_SORT_RANK: Record<ReturnRiskLevel | 'none', number> = {
  overdue: 0,
  at_risk: 1,
  critical: 2,
  watch: 3,
  safe: 4,
  protected: 5,
  none: 6,
};

const ROW_H: Record<Density, string> = {
  comfortable: 'h-16',
  compact: 'h-12',
};

const QUICK_RISK_PILLS: { value: EmptyReturnRiskFilter; label: string; countKey?: 'overdue' | 'atRisk' | 'crit' }[] = [
  { value: 'all', label: 'All Risks' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'crit', label: 'Critical / At Risk' },
  { value: 'watch', label: 'Watch' },
  { value: 'safe', label: 'Safe' },
  { value: 'protected', label: 'Protected' },
];

/**
 * Empty Return Cycles — Unified, clean, responsive control-tower table.
 * All filters are placed at the top, and all rows are displayed clearly.
 */
export function EmptyReturnCyclesPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const records = useEmptyReturnStore((state) => state.records);
  const filters = useEmptyReturnStore((state) => state.filters);
  const now = useEmptyReturnStore((state) => state.now);
  const expandedId = useEmptyReturnStore((state) => state.expandedId);
  const setFilters = useEmptyReturnStore((state) => state.setFilters);
  const resetFilters = useEmptyReturnStore((state) => state.resetFilters);
  const setExpanded = useEmptyReturnStore((state) => state.setExpanded);
  const setNow = useEmptyReturnStore((state) => state.setNow);
  const focusRecord = useEmptyReturnStore((state) => state.focusRecord);

  // Cycles and Chains used to be separate routes; they're now one tab-switched
  // page. The tab lives in the URL (`?tab=chains`) so it stays linkable and
  // bookmarkable — the reason the two views were routes in the first place.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: CyclesTabKey = tabParam === 'chains' ? 'chains' : 'cycles';
  const chains = useChains();

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

  const [density, setDensity] = useState<Density>('comfortable');
  const [sortMode, setSortMode] = useState<SortMode>('deadline');
  const [partyFilter, setPartyFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [activeKpi, setActiveKpi] = useState<KpiKey>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>('ready');
  const [updatedAt, setUpdatedAt] = useState(now);

  const storeRows = useMemo(
    () => selectFilteredRecords(records, filters, now),
    [records, filters, now],
  );

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

  const kpis = useMemo(() => {
    let overdue = 0;
    let atRisk = 0;
    let due12h = 0;
    let protectedCount = 0;
    for (const record of records) {
      const risk = riskOf(record, now);
      if (risk === 'overdue') overdue += 1;
      if (risk === 'at_risk') atRisk += 1;
      if (risk === 'protected') protectedCount += 1;
      const slack = slackOf(record, now);
      if (slack != null && slack >= 0 && slack < WATCH_THRESHOLD_MS && risk !== 'protected') {
        due12h += 1;
      }
    }
    return { overdue, atRisk, due12h, protectedCount };
  }, [records, now]);

  const rows = useMemo(() => {
    let list = storeRows;

    if (partyFilter !== 'all') {
      list = list.filter(
        (r) => r.client === partyFilter || r.transporter === partyFilter,
      );
    }
    if (locationFilter !== 'all') {
      list = list.filter((r) => r.locationId === locationFilter);
    }
    if (activeKpi === 'due_12h') {
      list = list.filter((r) => {
        const slack = slackOf(r, now);
        const risk = riskOf(r, now);
        return slack != null && slack >= 0 && slack < WATCH_THRESHOLD_MS && risk !== 'protected';
      });
    }
    if (activeKpi === 'at_risk') {
      list = list.filter((r) => riskOf(r, now) === 'at_risk');
    }

    const sorted = [...list];
    if (sortMode === 'reference') {
      sorted.sort((a, b) => {
        const aRef = a.cycleId ?? a.id;
        const bRef = b.cycleId ?? b.id;
        return aRef.localeCompare(bRef);
      });
    } else if (sortMode === 'urgency') {
      sorted.sort((a, b) => {
        const aRank = URGENCY_SORT_RANK[riskOf(a, now) ?? 'none'];
        const bRank = URGENCY_SORT_RANK[riskOf(b, now) ?? 'none'];
        if (aRank !== bRank) return aRank - bRank;
        return (slackOf(a, now) ?? Infinity) - (slackOf(b, now) ?? Infinity);
      });
    }
    return sorted;
  }, [storeRows, partyFilter, locationFilter, activeKpi, sortMode, now]);

  /**
   * The cycle whose detail dialog is open. Looked up against the full record
   * list, not the filtered rows — a dialog opened from the Chains tab or the
   * dashboard stays up even while the board behind it is narrowed.
   */
  const expandedRecord = useMemo(
    () => records.find((record) => record.id === expandedId) ?? null,
    [records, expandedId],
  );

  const storeFiltered =
    filters.q !== '' || filters.status !== 'all' || filters.risk !== 'all';
  const viewFiltered =
    storeFiltered ||
    partyFilter !== 'all' ||
    locationFilter !== 'all' ||
    activeKpi != null;

  const clearAllFilters = useCallback(() => {
    resetFilters();
    setPartyFilter('all');
    setLocationFilter('all');
    setActiveKpi(null);
  }, [resetFilters]);

  const handleKpiClick = (key: KpiKey, riskPreset?: EmptyReturnRiskFilter) => {
    if (activeKpi === key) {
      setActiveKpi(null);
      if (riskPreset) setFilters({ risk: 'all' });
      return;
    }
    setActiveKpi(key);
    if (key === 'due_12h' || key === 'at_risk') {
      setFilters({ risk: 'all' });
      return;
    }
    if (riskPreset) setFilters({ risk: riskPreset });
  };

  const handleRefresh = () => {
    setPageStatus('loading');
    window.setTimeout(() => {
      const stamped = Date.now();
      setNow(stamped);
      setUpdatedAt(stamped);
      setPageStatus('ready');
    }, 320);
  };

  const updatedLabel = useMemo(() => {
    const mins = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000));
    if (mins <= 0) return 'Updated just now';
    return `Updated ${mins}m ago`;
  }, [updatedAt]);

  const activeFilterChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];
    if (filters.q) {
      chips.push({ id: 'q', label: `Search: "${filters.q}"`, onClear: () => setFilters({ q: '' }) });
    }
    if (filters.status !== 'all') {
      const opt = EMPTY_RETURN_STATUS_FILTER_OPTIONS.find((o) => o.value === filters.status);
      chips.push({
        id: 'status',
        label: `Status: ${opt?.label ?? filters.status}`,
        onClear: () => setFilters({ status: 'all' }),
      });
    }
    if (filters.risk !== 'all' && activeKpi !== 'due_12h') {
      const opt = EMPTY_RETURN_RISK_FILTER_OPTIONS.find((o) => o.value === filters.risk);
      chips.push({
        id: 'risk',
        label: `Risk: ${opt?.label ?? filters.risk}`,
        onClear: () => {
          setFilters({ risk: 'all' });
          setActiveKpi(null);
        },
      });
    }
    if (activeKpi === 'due_12h') {
      chips.push({
        id: 'due12',
        label: 'Window: Due < 12h',
        onClear: () => setActiveKpi(null),
      });
    }
    if (activeKpi === 'at_risk') {
      chips.push({
        id: 'atrisk',
        label: 'Window: At risk',
        onClear: () => setActiveKpi(null),
      });
    }
    if (partyFilter !== 'all') {
      chips.push({
        id: 'party',
        label: `Party: ${partyFilter}`,
        onClear: () => setPartyFilter('all'),
      });
    }
    if (locationFilter !== 'all') {
      chips.push({
        id: 'loc',
        // The name, matching the dropdown — never the raw id.
        label: `Location: ${
          locations.find((l) => l.id === locationFilter)?.name ?? locationFilter
        }`,
        onClear: () => setLocationFilter('all'),
      });
    }
    return chips;
  }, [filters, partyFilter, locationFilter, locations, activeKpi, setFilters]);

  useEffect(() => {
    setUpdatedAt(now);
  }, [now]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 pb-12 sm:px-6">
      {/* Tabs sit above the title on purpose: they're the primary choice on
          this page (which dataset am I looking at), so they read first, and
          the title/description right under them belong to whichever tab is
          active rather than describing the page as a whole. */}
      <EmptyReturnCyclesTabNav
        active={activeTab}
        onChange={handleTabChange}
        chainsCount={chains.length}
      />

      {/* Page Header — content is per-tab */}
      <PageHeader
        title={activeTab === 'cycles' ? 'Empty Return Cycles' : 'Cycle Chains'}
        description={
          activeTab === 'cycles'
            ? 'Monitor all empty container returns, chained dual-transactions, and deadline protection.'
            : 'Every repeating chain, read left to right: the full load one cycle delivers becomes the empty the next cycle brings back.'
        }
        actions={
          activeTab === 'cycles' ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button" className="shadow-2xs">
                <Download className="size-4" aria-hidden />
                Export
              </Button>
              <Button
                size="sm"
                type="button"
                className="shadow-xs"
                onClick={() => navigate(ROUTES.emptyReturnsMatching ?? '/empty-returns/matching')}
              >
                <Plus className="size-4" aria-hidden />
                New Cycle
              </Button>
            </div>
          ) : undefined
        }
      />

      {activeTab === 'chains' && (
        <div id="cycles-panel-chains" role="tabpanel" aria-labelledby="cycles-tab-chains">
          <ChainsTabPanel onOpenCycle={handleOpenChainCycle} />
        </div>
      )}

      {activeTab === 'cycles' && (
      <div id="cycles-panel-cycles" role="tabpanel" aria-labelledby="cycles-tab-cycles" className="space-y-5">
      {/* Top Level KPI Filter Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile
          label="Overdue Returns"
          value={kpis.overdue}
          subtitle="Immediate action required"
          urgency="overdue"
          icon={<AlertCircle className="size-4" />}
          active={activeKpi === 'overdue'}
          onClick={() => handleKpiClick('overdue', 'overdue')}
        />
        <KpiTile
          label="At Risk"
          value={kpis.atRisk}
          subtitle="Critical deadline breach"
          urgency="at_risk"
          icon={<AlertTriangle className="size-4" />}
          active={activeKpi === 'at_risk'}
          onClick={() => handleKpiClick('at_risk')}
        />
        <KpiTile
          label="Due < 12 Hours"
          value={kpis.due12h}
          subtitle="Upcoming return cutoffs"
          urgency="watch"
          icon={<Clock className="size-4" />}
          active={activeKpi === 'due_12h'}
          onClick={() => handleKpiClick('due_12h')}
        />
        <KpiTile
          label="Protected Returns"
          value={kpis.protectedCount}
          subtitle="Safeguarded & matched"
          urgency="protected"
          icon={<ShieldCheck className="size-4" />}
          active={activeKpi === 'protected'}
          onClick={() => handleKpiClick('protected', 'protected')}
        />
      </div>

      {/* Top Filter Bar with All Controls */}
      <div className="rounded-md border border-border/90 bg-card p-3.5 shadow-2xs space-y-3">
        {/* Main Search & Filter Row */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-lg">
            <Input
              inputSize="sm"
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              onClear={() => setFilters({ q: '' })}
              isClearable
              leadingIcon={<Search className="size-4 text-muted-foreground" aria-hidden />}
              placeholder="Search Container, Cycle ID, Party, or Line..."
              aria-label="Search empty returns"
              className="pr-14 bg-background"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </div>

          {/* Filter Dropdowns Cluster */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              selectSize="sm"
              containerClassName="w-[8.5rem] shrink-0"
              options={[...EMPTY_RETURN_STATUS_FILTER_OPTIONS]}
              value={filters.status}
              onChange={(event) =>
                setFilters({ status: event.target.value as EmptyReturnStatusFilter })
              }
              aria-label="Filter by status"
            />
            <Select
              selectSize="sm"
              containerClassName="w-[9.5rem] shrink-0"
              options={[
                { value: 'all', label: 'All parties' },
                ...parties.map((p) => ({ value: p, label: p })),
              ]}
              value={partyFilter}
              onChange={(event) => setPartyFilter(event.target.value)}
              aria-label="Filter by party"
            />
            <Select
              selectSize="sm"
              containerClassName="w-[8.5rem] shrink-0"
              options={[
                { value: 'all', label: 'All locations' },
                ...locations.map((l) => ({ value: l.id, label: l.name })),
              ]}
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              aria-label="Filter by location"
            />
            <Select
              selectSize="sm"
              containerClassName="w-[8.5rem] shrink-0"
              options={[...EMPTY_RETURN_RISK_FILTER_OPTIONS]}
              value={filters.risk}
              onChange={(event) => {
                setActiveKpi(null);
                setFilters({ risk: event.target.value as EmptyReturnRiskFilter });
              }}
              aria-label="Filter by urgency"
            />
          </div>

          {/* Sort & View Actions */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 lg:border-t-0 lg:pt-0">
            <Select
              selectSize="sm"
              containerClassName="w-[10.5rem]"
              options={[
                { value: 'deadline', label: 'Sort: Deadline' },
                { value: 'urgency', label: 'Sort: Urgency' },
                { value: 'reference', label: 'Sort: Reference' },
              ]}
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              aria-label="Sort rows"
            />

            <div className="flex items-center gap-1.5">
              <Tooltip content={density === 'comfortable' ? 'Compact density' : 'Comfortable density'}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-8 px-0"
                  aria-label="Toggle density"
                  onClick={() =>
                    setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))
                  }
                >
                  <Rows3 className="size-4" aria-hidden />
                </Button>
              </Tooltip>

              <Tooltip content="Refresh data">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-8 px-0"
                  aria-label="Refresh"
                  onClick={handleRefresh}
                >
                  <RefreshCw
                    className={cn('size-3.5', pageStatus === 'loading' && 'animate-spin')}
                    aria-hidden
                  />
                </Button>
              </Tooltip>

              <span className="hidden text-xs text-muted-foreground xl:inline pl-1">
                {updatedLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Urgency Filter Pills at Top */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          <span className="text-[11px] font-semibold text-muted-foreground mr-1">Urgency Quick Filter:</span>
          {QUICK_RISK_PILLS.map((pill) => {
            const isSelected = filters.risk === pill.value && activeKpi === null;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => {
                  setActiveKpi(null);
                  setFilters({ risk: pill.value });
                }}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-all',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60',
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Active Filter Chips with Clear All */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="size-3" />
              Active Filters ({activeFilterChips.length}):
            </span>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onClear}
                className="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-muted/50 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:border-border-strong"
              >
                <span>{chip.label}</span>
                <X className="size-3 text-muted-foreground hover:text-foreground" aria-hidden />
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={clearAllFilters}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </div>

      {/* Showing Record Count Summary Bar */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Showing <span className="font-bold text-foreground">{rows.length}</span> of{' '}
          <span className="font-bold text-foreground">{records.length}</span> empty return cycles
        </span>
        {viewFiltered && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-primary hover:underline font-medium"
          >
            Show all cycles ({records.length})
          </button>
        )}
      </div>

      {/* Main Table / Records Area */}
      <div className="overflow-hidden rounded-md border border-border/90 bg-card shadow-2xs">
        {pageStatus === 'loading' ? (
          <CyclesLoadingRows density={density} />
        ) : pageStatus === 'error' ? (
          <CyclesErrorCard onRetry={() => setPageStatus('ready')} />
        ) : rows.length === 0 ? (
          viewFiltered ? (
            <CyclesEmptyFiltered onClear={clearAllFilters} />
          ) : (
            <CyclesEmpty
              onCreate={() => navigate(ROUTES.emptyReturnsMatching ?? '/empty-returns/matching')}
            />
          )
        ) : (
          <>
            {/* Desktop & Tablet Unified Table (All Rows Visible) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full table-fixed caption-bottom border-collapse text-left">
                <caption className="sr-only">
                  All empty return cycles
                </caption>
                <thead>
                  <tr className="h-10 border-b border-border/80 bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="w-2 p-0" aria-hidden />
                    <th scope="col" className="w-9 px-2 text-center">
                      <span className="sr-only">Expand</span>
                    </th>
                    <SortableHead label="Containers (Swap)" className="min-w-[16rem]" />
                    <SortableHead
                      label="Location"
                      className="hidden w-28 xl:table-cell"
                    />
                    <SortableHead label="Deadline" className="w-36" />
                    <SortableHead label="Urgency" className="w-32" />
                    <th scope="col" className="w-12 text-center">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map((record) => (
                    <CycleTableRow
                      key={record.id}
                      record={record}
                      now={now}
                      open={expandedId === record.id}
                      onToggle={setExpanded}
                      density={density}
                      reduceMotion={!!reduceMotion}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / Narrow Card List (< lg) */}
            <div className="divide-y divide-border/80 lg:hidden">
              {rows.map((record) => (
                <CycleCard
                  key={record.id}
                  record={record}
                  now={now}
                  open={expandedId === record.id}
                  onToggle={setExpanded}
                />
              ))}
            </div>
          </>
        )}
      </div>
      </div>
      )}

      {/* Cycle detail — opens over the board instead of pushing rows apart */}
      {activeTab === 'cycles' && (
        <CycleDetailModal
          record={expandedRecord}
          now={now}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * KPI Tile (Elevated Design System styling)
 * ------------------------------------------------------------------------- */

function KpiTile({
  label,
  value,
  subtitle,
  urgency,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  subtitle: string;
  urgency: ReturnRiskLevel;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  const isOverdue = urgency === 'overdue';
  const isAtRisk = urgency === 'at_risk';
  const isWatch = urgency === 'watch';
  const isProtected = urgency === 'protected';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-md border bg-card p-4 text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-primary ring-2 ring-primary/20 bg-primary-subtle/20 shadow-sm'
          : 'border-border/80 shadow-2xs hover:border-border-strong',
      )}
    >
      {/* Top Accent Line */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-1 transition-all',
          isOverdue && 'bg-destructive',
          isAtRisk && 'bg-warning',
          isWatch && 'bg-info',
          isProtected && 'bg-primary',
          active && 'h-1.5',
        )}
      />

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <IconChip
            size={36}
            tint={
              isOverdue ? 'red' : isAtRisk ? 'amber' : isWatch ? 'blue' : 'teal'
            }
            className="transition-transform group-hover:scale-110"
          >
            {icon}
          </IconChip>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground tracking-tight">
            {value}
          </span>
          {active && (
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              Filtered
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] font-medium text-muted-foreground truncate">
        {subtitle}
      </p>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Sortable Table Header
 * ------------------------------------------------------------------------- */

function SortableHead({ label, className }: { label: string; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      <span>{label}</span>
    </th>
  );
}

/* ---------------------------------------------------------------------------
 * Desktop Table Row
 * ------------------------------------------------------------------------- */

interface CycleTableRowProps {
  record: EmptyReturnRecord;
  now: number;
  open: boolean;
  onToggle: (id: string | null) => void;
  density: Density;
  reduceMotion: boolean;
}

function CycleTableRow({
  record,
  now,
  open,
  onToggle,
  density,
  reduceMotion,
}: CycleTableRowProps) {
  const slack = slackOf(record, now);
  const risk = riskOf(record, now);
  const reference = record.cycleId ?? record.id;
  const isCycle = Boolean(record.cycleId);
  const alerts = record.exception ? [record.exception] : [];

  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle(open ? null : record.id);
    }
  };

  const isOverdue = risk === 'overdue';
  const isAtRisk = risk === 'at_risk';
  const isCritical = risk === 'critical';

  return (
    <tr
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        'group/row border-b border-border/60 transition-colors duration-150',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        ROW_H[density],
        isOverdue && 'bg-destructive/5 hover:bg-destructive/10',
        open && 'bg-muted/30',
      )}
    >
      {/* Leftmost Urgency Stripe */}
      <td className="relative w-2 p-0">
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1',
            isOverdue && 'bg-destructive',
            isAtRisk && 'bg-warning',
            isCritical && 'bg-warning',
            risk === 'watch' && 'bg-info',
            risk === 'safe' && 'bg-success',
            risk === 'protected' && 'bg-primary',
          )}
        />
      </td>

      {/* Detail Trigger */}
      <td className="w-9 px-2 text-center">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => onToggle(open ? null : record.id)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="sr-only">
            {open ? 'Close' : 'Open'} details for {reference}
          </span>
          <ChevronRight
            className={cn(
              'size-4 transition-transform duration-200',
              open && 'rotate-90 text-primary font-bold',
              reduceMotion && 'transition-none',
            )}
            aria-hidden
          />
        </button>
      </td>

      {/* Containers (Swap) Column — carries the reference/chain identity too */}
      <td className="px-3 min-w-0">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px]">
            <Mono className="font-bold text-foreground">{reference}</Mono>
            {isCycle && record.chainId ? (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <Mono className="text-muted-foreground">{record.chainId}</Mono>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Cycle {record.seq}</span>
              </>
            ) : null}
          </span>
          <ContainerSwap
            empty={record.container}
            full={record.nextFull?.container}
            onSelectTarget={() => onToggle(record.id)}
          />
        </div>
      </td>

      {/* Location Column */}
      <td className="hidden px-3 xl:table-cell min-w-0">
        <Tooltip content={record.locationName}>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-1 font-mono text-[11px] font-medium text-foreground">
            <MapPin className="size-3 text-muted-foreground" aria-hidden />
            {record.locationId}
          </span>
        </Tooltip>
      </td>

      {/* Deadline Column */}
      <td className="px-3 min-w-0">
        <DeadlineCell deadline={record.deadline} slack={slack} risk={risk} />
      </td>

      {/* Urgency Column */}
      <td className="px-3 min-w-0">
        <UrgencyBadge risk={risk} alerts={alerts} />
      </td>

      {/* Actions Dropdown */}
      <td className="px-2 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${reference}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onToggle(record.id)}>
              View full details
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * Mobile / Narrow Cycle Card (< lg screens)
 * ------------------------------------------------------------------------- */

function CycleCard({
  record,
  now,
  open,
  onToggle,
}: {
  record: EmptyReturnRecord;
  now: number;
  open: boolean;
  onToggle: (id: string | null) => void;
}) {
  const slack = slackOf(record, now);
  const risk = riskOf(record, now);
  const reference = record.cycleId ?? record.id;
  const alerts = record.exception ? [record.exception] : [];
  const isOverdue = risk === 'overdue';

  return (
    <div className="relative border-b border-border/60 bg-card">
      <div
        className={cn(
          'flex flex-col gap-3 p-4 text-left transition-colors',
          isOverdue && 'bg-destructive/5',
        )}
      >
        {/* Top bar: Reference & Urgency */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mono className="text-sm font-bold text-foreground">{reference}</Mono>
            {record.chainId && (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {record.chainId}
              </span>
            )}
          </div>
          <UrgencyBadge risk={risk} alerts={alerts} />
        </div>

        {/* Container Swap */}
        <div>
          <ContainerSwap
            empty={record.container}
            full={record.nextFull?.container}
            onSelectTarget={() => onToggle(record.id)}
          />
        </div>

        {/* Parties */}
        <div>
          <PartyCell
            company={record.client}
            counterparty={record.transporter}
            locationSuffix={record.locationId}
          />
        </div>

        {/* Footer: Lifecycle + Deadline + Expand Trigger */}
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
          <div className="flex items-center gap-2">
            <LifecycleChip status={record.status} />
          </div>

          <div className="flex items-center gap-3">
            <DeadlineCell deadline={record.deadline} slack={slack} risk={risk} />
            <Button
              size="sm"
              variant={open ? 'secondary' : 'outline'}
              className="h-7 text-xs font-semibold"
              aria-haspopup="dialog"
              onClick={() => onToggle(open ? null : record.id)}
            >
              Details
              <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Loading & Empty States
 * ------------------------------------------------------------------------- */

function CyclesLoadingRows({ density }: { density: Density }) {
  return (
    <div className="divide-y divide-border/60 p-2" aria-busy="true" aria-label="Loading empty returns">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={cn('flex items-center justify-between gap-4 px-4', ROW_H[density])}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-4 rounded-sm" shape="block" />
            <Skeleton className="h-4 w-28 rounded-sm" shape="text" />
            <Skeleton className="h-7 w-48 rounded-md" shape="block" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-32 rounded-sm" shape="text" />
            <Skeleton className="h-6 w-20 rounded-md" shape="block" />
            <Skeleton className="h-6 w-24 rounded-md" shape="block" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CyclesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <IconChip icon={Layers} className="shadow-xs" />
      <h3 className="text-base font-bold text-foreground">No Empty Return Cycles Active</h3>
      <p className="max-w-md text-xs text-muted-foreground">
        When shipments finish unloading or new container returns are logged, they will appear here
        for intelligent pairing and chained return cycles.
      </p>
      <Button type="button" size="sm" className="mt-2 shadow-xs" onClick={onCreate}>
        <Plus className="size-4" aria-hidden />
        New Return Cycle
      </Button>
    </div>
  );
}

function CyclesEmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <IconChip icon={Filter} tint="neutral" />
      <h3 className="text-base font-bold text-foreground">No cycles match your filters</h3>
      <p className="max-w-sm text-xs text-muted-foreground">
        Try widening the search keyword or clearing urgency, status, and party filter criteria.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onClear}>
        Reset all filters
      </Button>
    </div>
  );
}

function CyclesErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-4 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-destructive shrink-0" />
        <div>
          <p className="text-sm font-semibold text-destructive">
            Could not load empty return cycles.
          </p>
          <p className="text-xs text-destructive/80">Please check your network and try again.</p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export default EmptyReturnCyclesPage;
