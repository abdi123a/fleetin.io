import { useCallback, useMemo, useState } from 'react';
import { chooseGranularity, previousPeriod } from '@/lib/bi/time';
import {
  emptyRiskAlert,
  applyFilters,
  deriveTripFacts,
  peekTransporterDataset,
  useDetailChannel,
  useTransporterFilters,
  useTransporterOverview,
} from '@/features/transporter-bi';
import { TransporterFilterBar } from '@/features/transporter-bi/filters/TransporterFilterBar';
import { DetailSheet } from '@/features/transporter-bi/detail/DetailSheet';
import { cn, formatDate } from '@/utils';
import { TransporterTabNav, type TransporterTabKey } from './components/TransporterTabNav';
import { KpiStrip } from './sections/KpiStrip';
import { OverviewSection } from './sections/OverviewSection';
import { OperationsSection } from './sections/OperationsSection';
import { DelaysSection } from './sections/DelaysSection';
import { DriversSection } from './sections/DriversSection';
import { PaymentsSection } from './sections/PaymentsSection';
import { NetworkSection } from './sections/NetworkSection';
import { TripsSection } from './sections/TripsSection';
import type { TransporterSectionProps } from './sectionContract';

/**
 * The full command center for one transporter.
 *
 * **Shape: constant context, switchable detail** — the same architecture as
 * `ShipperAnalyticsSuite`. The filter bar and six headline KPIs never leave
 * the screen; the detail below them is split into seven subject tabs ruled by
 * *one subject, one tab, one card*.
 *
 * Deliberately transporter-agnostic and chrome-free: the portal page renders
 * it for the signed-in carrier, an admin partner page could render it for any
 * record, and each host owns its own frame and heading.
 */

export interface TransporterAnalyticsSuiteProps {
  /** Which transporter's book of work the suite renders. */
  transporterId: string;
  /** Injected so the suite is reproducible in tests and never reads the clock. */
  now?: Date;
  /**
   * Controlled tab, for hosts that own a `?tab=` search param. Omit both to
   * let the suite keep the tab in local state.
   */
  tab?: TransporterTabKey;
  onTabChange?: (tab: TransporterTabKey) => void;
  /** Sticky offset for the subject tab bar under the host's own bars. */
  subjectNavTopClass?: string;
}

export function TransporterAnalyticsSuite({
  transporterId,
  now,
  tab: controlledTab,
  onTabChange,
  subjectNavTopClass = 'top-header',
}: TransporterAnalyticsSuiteProps) {
  // Pinned to the mount: a `new Date()` per render would invalidate every
  // query key on every keystroke.
  const asOf = useMemo(() => now ?? new Date(), [now]);

  const filterState = useTransporterFilters(asOf);
  const detail = useDetailChannel();
  const { filters, period } = filterState;

  const dataset = useMemo(() => peekTransporterDataset(transporterId, asOf), [transporterId, asOf]);
  const allFacts = useMemo(() => deriveTripFacts(dataset), [dataset]);
  const facts = useMemo(() => applyFilters(allFacts, filters), [allFacts, filters]);
  const overview = useTransporterOverview({ transporterId, filters, now: asOf });

  const [localTab, setLocalTab] = useState<TransporterTabKey>('overview');
  const tab = controlledTab ?? localTab;
  const setTab = onTabChange ?? setLocalTab;

  // Session-local backhaul reservations: the board and the detail sheet share
  // this optimistic state so "Reserved" reads the same everywhere.
  const [reservedIds, setReservedIds] = useState<ReadonlySet<string>>(new Set());
  const reserveOpportunity = useCallback((opportunityId: string) => {
    setReservedIds((current) => new Set(current).add(opportunityId));
  }, []);

  // Counts the tab bar wears as badges.
  const emptyRiskCount = useMemo(
    () => facts.filter((fact) => fact.emptyReturnRisk >= emptyRiskAlert()).length,
    [facts],
  );
  const overdue = useMemo(
    () => facts.filter((fact) => fact.payment?.status === 'overdue'),
    [facts],
  );
  const overdueAmount = useMemo(
    () => overdue.reduce((sum, fact) => sum + (fact.payment?.outstanding ?? 0), 0),
    [overdue],
  );

  const prior = useMemo(() => previousPeriod(period), [period]);
  const granularity = useMemo(() => chooseGranularity(period), [period]);

  const sectionProps: TransporterSectionProps = {
    dataset,
    facts,
    allFacts,
    filters,
    period,
    previousPeriod: prior,
    granularity,
    compare: filters.compare,
    onOpenDetail: detail.open,
  };

  return (
    <div className="flex flex-col gap-5">
      <TransporterFilterBar
        state={filterState}
        dataset={dataset}
        actions={
          <span className="text-[11px] text-muted-foreground">
            {formatDate(filters.from, 'date')} — {formatDate(filters.to, 'date')}
          </span>
        }
      />

      {/* ── The six headline numbers, above the tabs and never hidden ──── */}
      <KpiStrip data={overview.data} overdueAmount={overdueAmount} onOpenDetail={detail.open} />

      {/* ── Subject tabs ───────────────────────────────────────────────── */}
      <div
        className={cn(
          'sticky z-sticky -mt-1 bg-background/95 pt-1 backdrop-blur-sm',
          subjectNavTopClass,
        )}
      >
        <TransporterTabNav
          active={tab}
          onChange={setTab}
          emptyRiskCount={emptyRiskCount}
          overdueCount={overdue.length}
          tripCount={facts.length}
        />
      </div>

      <div
        role="tabpanel"
        id={`transporter-panel-${tab}`}
        aria-labelledby={`transporter-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === 'overview' && (
          <OverviewSection
            {...sectionProps}
            overview={overview.data}
            isLoading={overview.isLoading}
            isFetching={overview.isFetching}
            error={overview.error as Error | null}
          />
        )}

        {tab === 'operations' && (
          <OperationsSection
            {...sectionProps}
            reservedOpportunityIds={reservedIds}
            onReserveOpportunity={reserveOpportunity}
          />
        )}

        {tab === 'delays' && <DelaysSection {...sectionProps} />}
        {tab === 'drivers' && <DriversSection {...sectionProps} />}
        {tab === 'payments' && <PaymentsSection {...sectionProps} />}
        {tab === 'network' && <NetworkSection {...sectionProps} />}
        {tab === 'trips' && <TripsSection {...sectionProps} />}
      </div>

      <DetailSheet
        request={detail.active}
        dataset={dataset}
        filters={filters}
        onClose={detail.close}
        reservedOpportunityIds={reservedIds}
        onReserveOpportunity={reserveOpportunity}
      />
    </div>
  );
}
