import { useMemo, useState } from 'react';
import { useBiFilters, useBiDrillDown, BiFilterBar } from '@/features/shipper-bi/filters';
import { useOverviewSection } from '@/features/shipper-bi/api/queries';
import { peekDataset } from '@/features/shipper-bi/api/biService';
import { DrillDownSheet } from '@/features/shipper-bi/sections/DrillDownSheet';
import { useShipperAccount, type ShipperShipmentRow } from '@/features/shipper-bi';
import { ShipmentReportsPanel, type BookingPreviewItem } from '@/pages/shipments/components';
import { deriveFacts } from '@/lib/bi/derive';
import { cn, formatDate } from '@/utils';
import { AnalyticsTabNav, type AnalyticsTabKey } from './components/AnalyticsTabNav';
import { KpiStrip } from './sections/KpiStrip';
import { OverviewSection } from './sections/OverviewSection';
import { OperationsSection } from './sections/OperationsSection';
import { CostSection } from './sections/CostSection';
import { EmptyReturnSection } from './sections/EmptyReturnSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { ReportingSection } from './sections/ReportingSection';
import { RISK_ALERT_THRESHOLD } from './analyticsConfig';

/**
 * The full business intelligence suite for one shipper.
 *
 * Everything the dashboard deliberately leaves out lives here: the Pareto
 * charts, the matrices, the map and the searchable shipment history that
 * someone opens when they have come to study the account rather than check it.
 *
 * **Shape: constant context, switchable detail.** The filter bar and the six
 * headline KPIs are always on screen; the detail below them is split into seven
 * subject tabs. The previous version stacked all six subjects into a single
 * 8,500px scroll, which had two costs — you could not find anything, and no
 * card was ever rendered next to its own duplicate, so the page had grown
 * three KPI strips, the same delay-by-owner breakdown three times, and four
 * transporter cards built from one table's columns.
 *
 * The rule that keeps it that way: **one subject, one tab, one card.** A number
 * appears in a second place only when it is the headline of one view and a
 * column of another.
 *
 * The suite is deliberately shipper-agnostic: the shipper portal renders it
 * for the logged-in account while the admin's shipper detail page renders it
 * for whichever record is open — one implementation, two audiences. That is
 * also why it renders no page chrome (no max-width, no heading): each host
 * owns its own frame and binds `shipperId` however it identifies a shipper.
 */

export interface ShipperAnalyticsSuiteProps {
  /** Which shipper's book of work the suite renders. */
  shipperId: string;
  /** Injected so the suite is reproducible in tests and never reads the clock. */
  now?: Date;
  /**
   * Sticky offset for the subject tab bar. The default anchors it directly
   * under the app header; a host that stacks its own sticky nav above the
   * suite passes a taller offset so the two bars tier instead of colliding.
   */
  subjectNavTopClass?: string;
}

export function ShipperAnalyticsSuite({
  shipperId,
  now,
  subjectNavTopClass = 'top-header',
}: ShipperAnalyticsSuiteProps) {
  // Pinned to the day: a `new Date()` per render would invalidate every query
  // key on every keystroke.
  const asOf = useMemo(() => now ?? new Date(), [now]);

  const filterState = useBiFilters(asOf);
  const drillDown = useBiDrillDown();
  const { filters } = filterState;

  const dataset = useMemo(() => peekDataset(shipperId, asOf), [shipperId, asOf]);
  const facts = useMemo(() => deriveFacts(dataset), [dataset]);
  const overview = useOverviewSection({ shipperId, filters, now: asOf });

  // The Reports tab's feed. The panel used to be stacked under the whole suite
  // by the admin host, which put the same eight charts at the bottom of every
  // subject tab; as a subject of its own it renders once, and only when open.
  const { rows: accountRows } = useShipperAccount({ shipperId, now: asOf });
  const bookings = useMemo(() => accountRows.map(toBookingPreview), [accountRows]);

  // Local state, not a URL param: the admin host page already owns a `tab`
  // search param, and the BI filter params coexist with it because
  // useBiFilters mutates the current params rather than replacing them.
  const [tab, setTab] = useState<AnalyticsTabKey>('overview');

  // Counts the tab bar wears as badges, so "something needs me" is legible
  // without opening the tab.
  const atRiskCount = useMemo(
    () => facts.filter((f) => f.isOpen && f.riskScore >= RISK_ALERT_THRESHOLD).length,
    [facts],
  );
  const overdueReturnCount =
    overview.data?.returnHeadroom.find((slice) => slice.key === 'overdue')?.value ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <BiFilterBar
        state={filterState}
        transporters={dataset.transporters}
        routes={dataset.routes}
        actions={
          <span className="text-[11px] text-muted-foreground">
            {formatDate(filters.from, 'date')} — {formatDate(filters.to, 'date')}
          </span>
        }
      />

      {/* ── The six headline numbers, above the tabs and never hidden ──── */}
      <KpiStrip data={overview.data} onDrillDown={drillDown.open} />

      {/* ── Subject tabs ───────────────────────────────────────────────── */}
      <div
        className={cn(
          'sticky z-sticky -mt-1 bg-background/95 pt-1 backdrop-blur-sm',
          subjectNavTopClass,
        )}
      >
        <AnalyticsTabNav
          active={tab}
          onChange={setTab}
          atRiskCount={atRiskCount}
          overdueReturnCount={overdueReturnCount}
          historyCount={facts.length}
        />
      </div>

      <div
        role="tabpanel"
        id={`analytics-panel-${tab}`}
        aria-labelledby={`analytics-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === 'overview' && (
          <OverviewSection
            data={overview.data}
            facts={facts}
            filters={filters}
            isLoading={overview.isLoading}
            isFetching={overview.isFetching}
            error={overview.error as Error | null}
            onDrillDown={drillDown.open}
          />
        )}

        {tab === 'operations' && (
          <OperationsSection
            facts={facts}
            dataset={dataset}
            filters={filters}
            onDrillDown={drillDown.open}
          />
        )}

        {tab === 'cost' && (
          <CostSection
            facts={facts}
            dataset={dataset}
            overview={overview.data}
            filters={filters}
            onDrillDown={drillDown.open}
          />
        )}

        {tab === 'containers' && (
          <EmptyReturnSection
            facts={facts}
            filters={filters}
            returnHeadroom={overview.data?.returnHeadroom}
            onDrillDown={drillDown.open}
          />
        )}

        {tab === 'transporters' && (
          <PerformanceSection
            facts={facts}
            dataset={dataset}
            spotlightTransporters={overview.data?.spotlightTransporters}
            onDrillDown={drillDown.open}
          />
        )}

        {tab === 'reports' && <ShipmentReportsPanel bookings={bookings} />}

        {tab === 'history' && <ReportingSection facts={facts} shipperId={shipperId} />}
      </div>

      <DrillDownSheet
        drillDown={drillDown.active}
        dataset={dataset}
        filters={filters}
        onClose={drillDown.close}
      />
    </div>
  );
}

/**
 * The reports panel speaks the shipments page's booking language, so the
 * account rows are translated at this boundary rather than the panel learning
 * a second schema. Moved here with the panel itself — the admin detail page
 * carried this mapping while it hosted the panel below the suite.
 */
function toBookingPreview(row: ShipperShipmentRow): BookingPreviewItem {
  const statusIntent: BookingPreviewItem['statusIntent'] =
    row.status === 'closed' || row.outcome === 'on_time' || row.outcome === 'early'
      ? 'green'
      : row.status === 'open' && row.stage === 'in_transit'
        ? 'blue'
        : row.outcome === 'late' || row.riskScore >= 60
          ? 'orange'
          : 'slate';

  const stageStep: Record<string, number> = {
    created: 1,
    documentation: 1,
    gate_in: 2,
    dispatched: 2,
    picked_up: 3,
    in_transit: 3,
    arrived: 4,
    unloading: 4,
    delivered: 5,
    empty_return: 6,
  };
  const step = stageStep[row.stage] ?? 1;

  return {
    id: row.shipmentId,
    bookingNumber: row.reference,
    partnerName: row.transporter,
    driverName: row.transporter,
    driverVerified: row.riskScore < 50,
    vehicleNumber: row.containerNo ?? '—',
    vehicleType: row.containerType,
    vehicleVerified: row.riskScore < 60,
    status: row.stageLabel,
    statusIntent,
    step: `Step ${step} of 6`,
    podDocument:
      row.status === 'closed'
        ? { name: `POD_${row.reference}.pdf`, size: '1.2 MB', uploadedAt: row.arrivalAt ?? '' }
        : null,
  };
}
