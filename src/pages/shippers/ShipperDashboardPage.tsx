import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES, buildPath } from '@/config/routes';
import { useAuthStore } from '@/stores';
import { useShipper } from '@/features/shippers/api/queries';
import { useShipperAccount, type ShipperShipmentRow } from '@/features/shipper-bi';
import { useOverviewSection } from '@/features/shipper-bi/api/queries';
import { useBiFilters } from '@/features/shipper-bi/filters';

import { ShipperDashboardHeader } from './components/dashboard/console/ShipperDashboardHeader';
import { ShipperKpiStrip } from './components/dashboard/console/ShipperKpiStrip';
import { ShipmentAnalyticsCard } from './components/dashboard/console/ShipmentAnalyticsCard';
import { ShipmentCostCard } from './components/dashboard/console/ShipmentCostCard';
import { TransporterPerformanceConsoleCard } from './components/dashboard/console/TransporterPerformanceConsoleCard';
import { DeliveryVehiclesCard } from './components/dashboard/console/DeliveryVehiclesCard';
import { PendingShipmentsModal } from './components/dashboard/console/PendingShipmentsModal';
import { ContainerReturnStatusCard } from './components/dashboard/console/ContainerReturnStatusCard';
import { DeliveryPlanningCalendarCard } from './components/dashboard/console/DeliveryPlanningCalendarCard';
import { DelayResponsibilityCard } from './components/dashboard/console/DelayResponsibilityCard';
import { ShipmentTypesMixedChart } from './components/dashboard/console/ShipmentTypesMixedChart';
import { LastShipmentsSection } from './components/dashboard/console/LastShipmentsSection';

/**
 * Shipper Portal Dashboard
 *
 * Layout (top → bottom):
 * 1. Pricing — Market Rate + Shipment Cost
 * 2. Operations insight — Shipment Analytics + Delay responsibility
 * 3. Transporter performance + Delivery vehicles
 * 4. Container returns (full width) + last shipments
 */
export function ShipperDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);

  const shipperId = user?.shipperId ?? '';
  const { data: shipper } = useShipper(shipperId);
  const { rows } = useShipperAccount({ shipperId });

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

  const handleExportCsv = () => {
    const csvContent =
      'Reference,Status,Type,Price,Date\n' +
      'SHP-8901,Delivered,Container,$91520,2026-08-01\n' +
      'SHP-8902,On the move,Bulk,$54600,2026-08-02\n' +
      'SHP-8903,Delivered,Fees,$29880,2026-08-03\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shipper-analytics-${preset}-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      {/* Top Header */}
      <ShipperDashboardHeader
        userName={firstName}
        greeting={greeting}
        pendingCount={8}
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
          <ShipperKpiStrip from={from} to={to} />
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

      {/* Container returns — full width so responsibility + cause columns fit */}
      <section className="min-w-0">
        <ContainerReturnStatusCard
          className="h-full"
          shipperName={shipper?.companyLegalName || user?.companyName || 'Shipper'}
          shipperLogoUrl={shipper?.logoUrl}
        />
      </section>

      {/* The same book as dates — what lands which day, full width */}
      <section className="min-w-0">
        <DeliveryPlanningCalendarCard
          rows={rows}
          now={now.getTime()}
          onSelectShipment={openShipment}
        />
      </section>

      <LastShipmentsSection
        rows={rows}
        organization={shipper?.companyLegalName || user?.companyName || 'Shipper'}
        createdBy={shipper?.primaryContact?.name || user?.firstName || 'Account'}
        onViewAll={() => navigate(ROUTES.shipmentsList)}
        onOpenShipment={openShipment}
      />

      {/* Pending Shipments Data Modal */}
      <PendingShipmentsModal
        isOpen={isPendingModalOpen}
        onClose={() => setIsPendingModalOpen(false)}
      />
    </div>
  );
}

export default ShipperDashboardPage;
