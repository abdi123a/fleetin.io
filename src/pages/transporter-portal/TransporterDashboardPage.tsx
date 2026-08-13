import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuthStore } from '@/stores';
import {
  applyFilters,
  deriveTripFacts,
  peekTransporterDataset,
  toDjf,
  useTransporterFilters,
} from '@/features/transporter-bi';
import { inPeriod } from '@/features/transporter-bi/derive';
import { DeliveryVehiclesCard } from '@/pages/shippers/components/dashboard/console/DeliveryVehiclesCard';

import {
  AvailableLoadsCard,
  BusyHeatmapCard,
  ConsoleHeader,
  DelayOwnershipCard,
  DetentionStatusCard,
  EarningsPerMoveCard,
  EmptyLegsCard,
  FleetWeekCard,
  JobsInProgressCard,
  KpiTiles,
  MoneyFlowCard,
  MoveAnalyticsCard,
  NetworkComparisonCard,
  OfferToPaymentCard,
  PayingJobsCard,
  PaymentsCard,
  RateVsNetworkCard,
  WaitingByLocationCard,
  WhatYouHaulCard,
  buildConsoleModel,
} from './components/dashboard/console';

/**
 * Transporter Portal Dashboard.
 *
 * The landing screen of the carrier's seat, laid out in the order a dispatcher
 * actually reads a morning: what is on fire, then the four numbers the day is
 * judged by, then the analysis behind them, then the work itself.
 *
 * Every row is the same 2/3 + 1/3 split — an analysis panel beside the single
 * figure that panel's conclusion turns on — so the page has one rhythm rather
 * than twelve card sizes. Panels are presentational; all arithmetic happens
 * once in `buildConsoleModel`, which is why two cards quoting the same figure
 * cannot disagree.
 */
export function TransporterDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const transporterId = user?.transporterId || 'TRP-01';
  const firstName = user?.firstName || 'Ahmed';

  const now = useMemo(() => new Date(), []);
  const filterState = useTransporterFilters(now);
  const { preset, from, to } = filterState.filters;
  const { period } = filterState;

  const dataset = useMemo(
    () => peekTransporterDataset(transporterId, now),
    [transporterId, now],
  );
  const companyName = user?.companyName || dataset.transporter.name;

  const facts = useMemo(
    () => applyFilters(deriveTripFacts(dataset), filterState.filters),
    [dataset, filterState.filters],
  );

  const model = useMemo(
    () => buildConsoleModel({ dataset, facts, period, now }),
    [dataset, facts, period, now],
  );

  const greeting = useMemo(() => {
    const hour = now.getHours();
    if (hour < 12) return 'Good Morning!';
    if (hour < 17) return 'Good Afternoon!';
    return 'Good Evening!';
  }, [now]);

  const goAnalytics = (tab?: string) => {
    navigate(tab ? `${ROUTES.transporterAnalytics}?tab=${tab}` : ROUTES.transporterAnalytics);
  };

  const handleExportCsv = () => {
    // The export reads in francs like every screen that produced it, so a row
    // pasted into a spreadsheet reconciles against the console it came from.
    const header = 'Reference,Status,Route,DistanceKm,RevenueDJF,Date\n';
    const body = inPeriod(facts, period)
      .slice(0, 200)
      .map((fact) => {
        const route = dataset.routes.find((entry) => entry.id === fact.routeId)?.name ?? '';
        const revenue = Math.round(toDjf(fact.totalRevenue));
        return `${fact.ref},${fact.status},"${route}",${fact.distanceKm},${revenue},${fact.anchorDate}`;
      })
      .join('\n');

    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transporter-console-${preset}-${from.slice(0, 10)}-to-${to.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6">
      <ConsoleHeader
        userName={firstName}
        greeting={greeting}
        companyName={companyName}
        detentionRunning={model.alerts.detentionRunning}
        emptyOverdue={model.alerts.emptyOverdue}
        preset={preset}
        from={from}
        to={to}
        onTimeframeChange={filterState.setPreset}
        onCustomRangeChange={filterState.setCustomRange}
        onExportCsv={handleExportCsv}
        onDetentionClick={() => goAnalytics('operations')}
        onEmptyReturnClick={() => goAnalytics('operations')}
      />

      {/* Today's numbers — the four operating figures beside the empty-leg split */}
      <ConsoleRow
        main={
          <div className="flex min-w-0 flex-col gap-4">
            <KpiTiles kpis={model.kpis} />
            {model.rate.length > 0 ? (
              <RateVsNetworkCard tabs={model.rate} className="flex-1" />
            ) : null}
          </div>
        }
        side={
          <EmptyLegsCard
            data={model.emptyLegs}
            onOpenBackhaul={() => goAnalytics('operations')}
          />
        }
      />

      {/* Volume and who owns the hours it lost */}
      <ConsoleRow
        main={
          <MoveAnalyticsCard
            days={model.moveDays}
            totalMoves={model.moves}
            weakestDay={model.weakestDay}
          />
        }
        side={
          <DelayOwnershipCard
            delays={model.delays}
            transporterId={transporterId}
            transporterName={companyName}
            onOpenAnalytics={() => goAnalytics('delays')}
          />
        }
      />

      {/* The mix, and where the offers behind it ended up */}
      <ConsoleRow
        main={
          <WhatYouHaulCard
            days={model.haulDays}
            groups={model.haulGroups}
            totalMoves={model.moves}
            totalRevenue={model.revenue}
          />
        }
        side={<OfferToPaymentCard funnel={model.funnel} />}
      />

      {/* Unit economics — the leak, and which lanes are worth chasing */}
      <ConsoleRow
        main={<MoneyFlowCard legs={model.moneyLegs} onOpenCosts={() => goAnalytics('payments')} />}
        side={<PayingJobsCard jobs={model.payingJobs} />}
      />

      {/* Where the truck-days and the standing hours went */}
      <ConsoleRow
        main={<FleetWeekCard data={model.fleetWeek} onOpenFleet={() => goAnalytics('operations')} />}
        side={<WaitingByLocationCard data={model.waiting} />}
      />

      {/* When the fleet is committed, and what a move is worth */}
      <ConsoleRow
        main={<BusyHeatmapCard data={model.heatmap} onPlanSlots={() => goAnalytics('trips')} />}
        side={<EarningsPerMoveCard data={model.earnings} />}
      />

      {/* The work on offer, and the truck closest to needing it */}
      <ConsoleRow
        main={
          <AvailableLoadsCard
            loads={model.loads}
            onViewAll={() => goAnalytics('operations')}
          />
        }
        side={
          <DeliveryVehiclesCard
            transporters={model.spotlight}
            className="h-full shadow-card"
          />
        }
      />

      {/* Full width — the responsibility and cause columns need the room */}
      <section className="min-w-0">
        <DetentionStatusCard
          rows={model.detention}
          fleetCode={dataset.transporter.fleetCode}
          onViewAll={() => goAnalytics('operations')}
        />
      </section>

      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        <PaymentsCard data={model.payments} onReconcile={() => goAnalytics('payments')} />
        <NetworkComparisonCard
          data={model.network}
          onOpenDetails={() => goAnalytics('network')}
        />
      </section>

      <section className="min-w-0">
        <JobsInProgressCard
          ongoing={model.jobs.ongoing}
          scheduled={model.jobs.scheduled}
          totalMoves={model.moves}
          onViewAll={() => goAnalytics('trips')}
          onOpenJob={() => goAnalytics('trips')}
        />
      </section>
    </div>
  );
}

/** The page's one row shape: analysis at 2/3, the figure it turns on at 1/3. */
function ConsoleRow({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
      <div className="flex min-w-0 flex-col xl:col-span-8">{main}</div>
      <div className="flex min-w-0 flex-col xl:col-span-4">{side}</div>
    </section>
  );
}

export default TransporterDashboardPage;
