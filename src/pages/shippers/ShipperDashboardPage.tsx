import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, LayoutDashboard } from '@/design-system/icons';
import { ROUTES, buildPath } from '@/config/routes';
import { useAuthStore } from '@/stores';
import { useShipper } from '@/features/shippers/api/queries';
import { useShipperAccount, type ShipperShipmentRow } from '@/features/shipper-bi';
import { useOverviewSection } from '@/features/shipper-bi/api/queries';
import { useBiFilters } from '@/features/shipper-bi/filters';
import { MonthlyReportPanel } from '@/components/reports';
import { cn } from '@/utils';

import { ShipperDashboardHeader } from './components/dashboard/console/ShipperDashboardHeader';
import { ShipperKpiStrip } from './components/dashboard/console/ShipperKpiStrip';
import { ShipmentAnalyticsCard } from './components/dashboard/console/ShipmentAnalyticsCard';
import { ShipmentCostCard } from './components/dashboard/console/ShipmentCostCard';
import { TransporterPerformanceConsoleCard } from './components/dashboard/console/TransporterPerformanceConsoleCard';
import { DeliveryVehiclesCard } from './components/dashboard/console/DeliveryVehiclesCard';
import { PendingShipmentsModal } from './components/dashboard/console/PendingShipmentsModal';
import { DeliveryPlanningCalendarCard } from './components/dashboard/console/DeliveryPlanningCalendarCard';
import { DelayResponsibilityCard } from './components/dashboard/console/DelayResponsibilityCard';
import { ShipmentTypesMixedChart } from './components/dashboard/console/ShipmentTypesMixedChart';

/**
 * Shipper Portal Dashboard
 *
 * Layout (top → bottom):
 * 1. Pricing — Market Rate + Shipment Cost
 * 2. Operations insight — Shipment Analytics + Delay responsibility
 * 3. Transporter performance + Delivery vehicles
 * 4. Delivery planning calendar (full width)
 */
type ShipperDashboardTab = 'dashboard' | 'monthly-report';

export function ShipperDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);

  // Deep-linkable view switch: the dashboard is the default, so it keeps a
  // clean URL and only the report carries a `?tab=`.
  const activeTab: ShipperDashboardTab =
    searchParams.get('tab') === 'monthly-report' ? 'monthly-report' : 'dashboard';
  const setActiveTab = (tab: ShipperDashboardTab) => {
    setSearchParams(
      (prev) => {
        if (tab === 'dashboard') prev.delete('tab');
        else prev.set('tab', tab);
        return prev;
      },
      { replace: true },
    );
  };

  const shipperId = user?.shipperId ?? '';
  const { data: shipper } = useShipper(shipperId);
  const { summary, rows } = useShipperAccount({ shipperId });

  const now = useMemo(() => new Date(), []);
  const filterState = useBiFilters(now);
  const { preset, from, to } = filterState.filters;
  const overview = useOverviewSection({
    shipperId,
    filters: filterState.filters,
    now,
  });

  const firstName = user?.firstName || shipper?.primaryContact?.name?.split(' ')[0] || 'Emery';

  const openShipment = (row: ShipperShipmentRow) => {
    navigate(
      buildPath(ROUTES.shipmentOverview, {
        id: row.shipmentId.replace(/^SHP-0*/i, '') || '1',
      }),
    );
  };

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return 'Good Morning!';
    if (hour < 17) return 'Good Afternoon!';
    return 'Good Evening!';
  }, [now]);

  /** The account's real book, not three invented rows. */
  const handleExportCsv = () => {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvContent = [
      'Reference,Shipment,Container,Transporter,Route,Stage,Outcome,Cost DJF,Planned delivery,Arrived,Empty returned',
      ...rows.map((row) =>
        [
          row.reference,
          row.parentReference ?? '',
          row.containerNo ?? '',
          row.transporter,
          `${row.origin} - ${row.destination}`,
          row.stageLabel,
          row.outcomeLabel ?? '',
          String(Math.round(row.cost)),
          row.plannedDeliveryAt.slice(0, 10),
          row.arrivalAt?.slice(0, 10) ?? '',
          row.returnedAt?.slice(0, 10) ?? '',
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shipper-analytics-${preset}-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ key: ShipperDashboardTab; label: string; icon: React.ReactNode }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
    { key: 'monthly-report', label: 'Monthly Report', icon: <CalendarDays /> },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      {/* The two views of the account: the live console, and the month's report. */}
      <div
        role="tablist"
        aria-label="Shipper dashboard views"
        className="flex items-center gap-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`shipper-dashboard-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`shipper-dashboard-panel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5',
                'text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                '[&_svg]:size-4 [&_svg]:shrink-0',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              <span aria-hidden>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'monthly-report' && (
        <div
          role="tabpanel"
          id="shipper-dashboard-panel-monthly-report"
          aria-labelledby="shipper-dashboard-tab-monthly-report"
        >
          <MonthlyReportPanel
            shipperId={shipperId}
            shipperName={shipper?.companyLegalName || user?.companyName || 'Shipper'}
            shipperLogoUrl={shipper?.logoUrl}
          />
        </div>
      )}

      {activeTab === 'dashboard' && (
      <div
        role="tabpanel"
        id="shipper-dashboard-panel-dashboard"
        aria-labelledby="shipper-dashboard-tab-dashboard"
        className="flex flex-col gap-4"
      >
      {/* Top Header */}
      <ShipperDashboardHeader
        userName={firstName}
        greeting={greeting}
        pendingCount={summary.containersOut}
        preset={preset}
        from={from}
        to={to}
        onTimeframeChange={filterState.setPreset}
        onCustomRangeChange={filterState.setCustomRange}
        onPendingClick={() => setIsPendingModalOpen(true)}
        onExportCsv={handleExportCsv}
      />

      {/* Pricing row — market rate + cost sit together */}
      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-7 2xl:col-span-8">
          <ShipperKpiStrip summary={summary} rows={rows} />
          <ShipmentTypesMixedChart
            preset={preset}
            from={from}
            to={to}
            className="flex-1"
          />
        </div>

        <div className="flex min-w-0 flex-col xl:col-span-5 2xl:col-span-4">
          <ShipmentCostCard
            preset={preset}
            from={from}
            to={to}
            rows={rows}
            className="h-full"
            onViewDetails={() => navigate(ROUTES.analytics)}
          />
        </div>
      </section>

      {/* Operations insight — volume trend + delay ownership */}
      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col xl:col-span-7 2xl:col-span-8">
          <ShipmentAnalyticsCard
            preset={preset}
            from={from}
            to={to}
            rows={rows}
            className="h-full"
          />
        </div>

        <div className="flex min-w-0 flex-col xl:col-span-5 2xl:col-span-4">
          <DelayResponsibilityCard
            shipperId={shipperId}
            asOf={now}
            preset={preset}
            from={from}
            to={to}
            className="h-full"
            shipperName={shipper?.companyLegalName || user?.companyName || 'Shipper'}
            shipperLogoUrl={shipper?.logoUrl}
            onViewDetails={() => navigate(ROUTES.analytics)}
          />
        </div>
      </section>

      {/* Transporter Performance & Delivery Vehicles Row */}
      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col xl:col-span-7 2xl:col-span-8">
          <TransporterPerformanceConsoleCard
            preset={preset}
            from={from}
            to={to}
            rows={rows}
            className="h-full"
            onViewAll={() => navigate(ROUTES.analytics)}
          />
        </div>

        <div className="flex min-w-0 flex-col xl:col-span-5 2xl:col-span-4">
          <DeliveryVehiclesCard
            transporters={overview.data?.spotlightTransporters}
            preset={preset}
            from={from}
            to={to}
            className="h-full"
          />
        </div>
      </section>

      {/* The same book as dates — what lands which day, full width */}
      <section className="min-w-0">
        <DeliveryPlanningCalendarCard
          rows={rows}
          now={now.getTime()}
          onSelectShipment={openShipment}
        />
      </section>
      </div>
      )}

      {/* Pending Shipments Data Modal */}
      <PendingShipmentsModal
        isOpen={isPendingModalOpen}
        onClose={() => setIsPendingModalOpen(false)}
        rows={rows}
      />
    </div>
  );
}

export default ShipperDashboardPage;
