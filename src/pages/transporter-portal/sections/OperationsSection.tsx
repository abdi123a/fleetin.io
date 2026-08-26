import { useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Package, RotateCcw, Route, Truck } from '@/design-system/icons';
import { Badge, Button } from '@/design-system';
import {
  ChartCard,
  RateGauge,
  StackedAreaChart,
  X_AXIS_HEIGHT,
  type Intent,
  type StackedSeries,
} from '@/features/shipper-bi/charts';
import {
  backhaulMatchTarget,
  BACKHAUL_STATUSES,
  BACKHAUL_STATUS_LABELS,
  CONTAINER_TYPE_LABELS,
  emptyCostPerKm,
  emptyRiskAlert,
  emptyRiskCritical,
  FLEET_STATES,
  FLEET_STATE_LABELS,
  utilizationTarget,
  CompanyLabel,
  buildSeries,
  fleetSnapshot,
  fleetStateSeries,
  formatCompact,
  formatKm,
  formatMoney,
  formatMoneyFull,
  formatRatePerKm,
  inPeriod,
  type BackhaulStatus,
  type FleetState,
  type TransporterDataset,
  type TripFact,
} from '@/features/transporter-bi';
import { cn, formatDate } from '@/utils';
import type { TransporterSectionProps } from '../sectionContract';
import { StatCard } from './cards/StatCard';
import { TablePager, usePagedRows } from './cards/TablePager';

const MIX_BODY_HEIGHT = 240;
const TREND_PLOT_HEIGHT = 220;

const FLEET_STATE_COLOR: Record<FleetState, string> = {
  active: 'var(--primary)',
  idle: 'var(--warning)',
  maintenance: 'var(--muted-foreground)',
};

const FLEET_STATE_SWATCH: Record<FleetState, string> = {
  active: 'bg-primary',
  idle: 'bg-warning',
  maintenance: 'bg-muted-foreground',
};

const FLEET_STATE_INTENT: Record<FleetState, Intent> = {
  active: 'good',
  idle: 'warning',
  maintenance: 'neutral',
};

const BACKHAUL_SWATCH: Record<BackhaulStatus, string> = {
  matched: 'bg-primary',
  empty: 'bg-destructive',
  pending: 'bg-warning',
};

const BACKHAUL_INTENT: Record<BackhaulStatus, Intent> = {
  matched: 'good',
  empty: 'critical',
  pending: 'warning',
};

export interface OperationsSectionProps extends TransporterSectionProps {
  /** Opportunities reserved this session — the board's optimistic UI state. */
  reservedOpportunityIds: ReadonlySet<string>;
  onReserveOpportunity: (opportunityId: string) => void;
}

/**
 * Operations — fleet utilisation, return-load matching, and empty-return risk.
 *
 * Scope section 2: backhaul / empty-return headline stats, how the fleet is
 * spending its days, route profitability, live empty-return risk, and the
 * opportunity board.
 */
export function OperationsSection({
  dataset,
  facts,
  period,
  granularity,
  filters,
  reservedOpportunityIds,
  onReserveOpportunity,
  onOpenDetail,
}: OperationsSectionProps) {
  const periodFacts = useMemo(() => inPeriod(facts, period), [facts, period]);

  const fleet = useMemo(
    () => fleetSnapshot(dataset, period, filters.vehicleIds),
    [dataset, period, filters.vehicleIds],
  );

  const stateSeries = useMemo(
    () => fleetStateSeries(dataset, period, granularity, filters.vehicleIds),
    [dataset, period, granularity, filters.vehicleIds],
  );

  const { formatBucket } = useMemo(
    () =>
      buildSeries({
        facts: [],
        period,
        granularity,
        valueOf: () => 0,
      }),
    [period, granularity],
  );

  const backhaulStats = useMemo(() => {
    const resolved = periodFacts.filter(
      (fact) => fact.isCompleted && (fact.backhaulStatus === 'matched' || fact.backhaulStatus === 'empty'),
    );
    const matched = resolved.filter((fact) => fact.backhaulStatus === 'matched').length;
    const empty = resolved.filter((fact) => fact.backhaulStatus === 'empty').length;
    const matchRate = resolved.length > 0 ? matched / resolved.length : 0;
    const emptyRate = resolved.length > 0 ? empty / resolved.length : 0;
    const emptyCost = periodFacts.reduce((sum, fact) => sum + fact.emptyCostUsd, 0);
    return { matched, empty, resolved: resolved.length, matchRate, emptyRate, emptyCost };
  }, [periodFacts]);

  const fleetStateSlices = useMemo(
    () =>
      FLEET_STATES.map((state) => ({
        key: state,
        label: FLEET_STATE_LABELS[state],
        value:
          state === 'active'
            ? fleet.activeDays
            : state === 'idle'
              ? fleet.idleDays
              : fleet.maintenanceDays,
        intent: FLEET_STATE_INTENT[state],
      })),
    [fleet],
  );

  const fleetTrend = useMemo<StackedSeries[]>(
    () =>
      FLEET_STATES.map((state) => {
        const series = stateSeries.find((entry) => entry.key === state);
        return {
          key: state,
          label: FLEET_STATE_LABELS[state],
          color: FLEET_STATE_COLOR[state],
          intent: FLEET_STATE_INTENT[state],
          points: series?.points ?? [],
        };
      }),
    [stateSeries],
  );

  const backhaulMix = useMemo(() => {
    const counts: Record<BackhaulStatus, number> = { matched: 0, empty: 0, pending: 0 };
    for (const fact of periodFacts) {
      counts[fact.backhaulStatus] += 1;
    }
    return BACKHAUL_STATUSES.map((status) => ({
      key: status,
      label: BACKHAUL_STATUS_LABELS[status],
      value: counts[status],
      intent: BACKHAUL_INTENT[status],
    }));
  }, [periodFacts]);

  const backhaulTotal = backhaulMix.reduce((sum, slice) => sum + slice.value, 0);

  const routeProfitability = useMemo(() => {
    const byRoute = new Map<
      string,
      { earnings: number; emptyKm: number; waitingHours: number; totalKm: number; trips: number }
    >();
    for (const fact of periodFacts) {
      if (!fact.isCompleted) continue;
      const entry = byRoute.get(fact.routeId) ?? {
        earnings: 0,
        emptyKm: 0,
        waitingHours: 0,
        totalKm: 0,
        trips: 0,
      };
      entry.earnings += fact.totalRevenue;
      entry.emptyKm += fact.emptyKm;
      entry.waitingHours += fact.waitingHours;
      entry.totalKm += fact.totalKm || fact.distanceKm;
      entry.trips += 1;
      byRoute.set(fact.routeId, entry);
    }
    const nameById = new Map(dataset.routes.map((route) => [route.id, route.name]));
    return Array.from(byRoute.entries())
      .map(([routeId, entry]) => ({
        routeId,
        name: nameById.get(routeId) ?? routeId,
        ...entry,
        perKm: entry.totalKm > 0 ? entry.earnings / entry.totalKm : 0,
      }))
      .sort((a, b) => b.earnings - a.earnings);
  }, [periodFacts, dataset.routes]);

  const opportunities = useMemo(
    () => [...dataset.opportunities].sort((a, b) => b.matchScore - a.matchScore),
    [dataset.opportunities],
  );

  const riskRows = useMemo(
    () =>
      facts
        .filter((fact) => fact.emptyReturnRisk >= emptyRiskAlert())
        .sort((a, b) => b.emptyReturnRisk - a.emptyReturnRisk)
        .slice(0, 12),
    [facts],
  );

  const routeById = useMemo(
    () => new Map(dataset.routes.map((route) => [route.id, route])),
    [dataset.routes],
  );

  const [routePageSize, setRoutePageSize] = useState(25);
  const pagedRoutes = usePagedRows(routeProfitability, { pageSize: routePageSize });
  const [oppPageSize, setOppPageSize] = useState(25);
  const pagedOpportunities = usePagedRows(opportunities, { pageSize: oppPageSize });

  const hasFleetTrend = fleetTrend.some((series) => series.points.some((point) => point.v > 0));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Backhaul match rate"
          value={`${(backhaulStats.matchRate * 100).toFixed(1)}%`}
          caption={`Target ${(backhaulMatchTarget() * 100).toFixed(0)}% · ${formatCompact(backhaulStats.matched)} matched`}
          intent={
            backhaulStats.resolved === 0
              ? 'neutral'
              : backhaulStats.matchRate >= backhaulMatchTarget()
                ? 'good'
                : 'warning'
          }
        />
        <StatCard
          label="Empty return rate"
          value={`${(backhaulStats.emptyRate * 100).toFixed(1)}%`}
          caption={`${formatCompact(backhaulStats.empty)} empty returns in period`}
          intent={
            backhaulStats.resolved === 0
              ? 'neutral'
              : backhaulStats.emptyRate > 0.35
                ? 'critical'
                : backhaulStats.emptyRate > 0.2
                  ? 'warning'
                  : 'good'
          }
        />
        <StatCard
          label="Empty mileage cost"
          value={formatMoney(backhaulStats.emptyCost)}
          caption={`At $${emptyCostPerKm().toFixed(2)} / empty km`}
          intent={backhaulStats.emptyCost > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ChartCard
          title="Fleet Utilisation"
          subtitle={`${(fleet.utilization * 100).toFixed(1)}% utilised · ${formatCompact(fleet.vehicleDays)} vehicle-days`}
          icon={<Gauge className="size-4" />}
          isEmpty={fleet.vehicleDays === 0}
          emptyMessage="No fleet activity logged in this period."
          bodyHeight={MIX_BODY_HEIGHT}
          actions={
            <span className="text-xs font-medium text-muted-foreground">
              Target {(utilizationTarget() * 100).toFixed(0)}%
            </span>
          }
          tableRows={fleetStateSlices}
          tableColumns={[
            { key: 'label', header: 'State', align: 'left', render: (row) => row.label },
            { key: 'value', header: 'Vehicle-days', render: (row) => formatCompact(row.value) },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                fleet.vehicleDays === 0
                  ? '—'
                  : `${((row.value / fleet.vehicleDays) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <div className="flex flex-col items-center justify-between gap-8 px-2 py-2 md:flex-row">
            <div className="flex min-w-[200px] flex-col items-center justify-center p-4">
              <RateGauge
                value={fleet.utilization}
                target={utilizationTarget()}
                label="Fleet Utilisation"
                size={160}
              />
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>{(utilizationTarget() * 100).toFixed(0)}.0% utilisation target</span>
              </div>
            </div>

            <ItemizedBars
              slices={fleetStateSlices}
              total={fleet.vehicleDays}
              swatchOf={(key) => FLEET_STATE_SWATCH[key as FleetState] ?? 'bg-muted-foreground'}
              valueLabel="Vehicle-days"
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Backhaul Mix"
          subtitle="Return legs by outcome"
          icon={<RotateCcw className="size-4" />}
          isEmpty={backhaulTotal === 0}
          emptyMessage="No trips in this period."
          bodyHeight={MIX_BODY_HEIGHT}
          tableRows={backhaulMix}
          tableColumns={[
            { key: 'label', header: 'Outcome', align: 'left', render: (row) => row.label },
            { key: 'value', header: 'Trips', render: (row) => row.value },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                backhaulTotal === 0
                  ? '—'
                  : `${((row.value / backhaulTotal) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <div className="flex h-full flex-col justify-center gap-1 px-2 py-2">
            <div className="mb-2 flex items-center justify-between border-b border-border-subtle/50 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Status</span>
              <span>Trips (% Share)</span>
            </div>
            <ItemizedBars
              slices={backhaulMix}
              total={backhaulTotal}
              swatchOf={(key) => BACKHAUL_SWATCH[key as BackhaulStatus] ?? 'bg-muted-foreground'}
              valueLabel="Trips"
              fullWidth
            />
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Fleet Utilisation Trend"
        subtitle="Active, idle and maintenance vehicle-days by period"
        icon={<Truck className="size-4" />}
        isEmpty={!hasFleetTrend}
        emptyMessage="No fleet activity logged in this period."
        bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
        tableRows={fleetTrend[0]?.points ?? []}
        tableColumns={[
          {
            key: 't',
            header: 'Period',
            align: 'left',
            render: (row) => formatBucket(row.t),
          },
          ...FLEET_STATES.map((state, index) => ({
            key: state,
            header: FLEET_STATE_LABELS[state],
            render: (row: { t: string }) =>
              fleetTrend[index]?.points.find((point) => point.t === row.t)?.v ?? 0,
          })),
        ]}
      >
        <StackedAreaChart
          series={fleetTrend}
          formatValue={(value) => formatCompact(value)}
          formatBucket={formatBucket}
          height={TREND_PLOT_HEIGHT}
        />
      </ChartCard>

      <ChartCard
        title="Route Profitability"
        subtitle="Earnings, empty km and yield by corridor"
        icon={<Route className="size-4" />}
        isEmpty={routeProfitability.length === 0}
        emptyMessage="No completed trips in this period."
        tableRows={routeProfitability}
        tableColumns={[
          { key: 'name', header: 'Route', align: 'left', render: (row) => row.name },
          {
            key: 'earnings',
            header: 'Earnings',
            render: (row) => formatMoneyFull(row.earnings),
          },
          {
            key: 'emptyKm',
            header: 'Empty km',
            render: (row) => formatKm(row.emptyKm),
          },
          {
            key: 'waiting',
            header: 'Waiting',
            render: (row) => `${row.waitingHours.toFixed(1)}h`,
          },
          {
            key: 'perKm',
            header: 'Rate / km',
            render: (row) => formatRatePerKm(row.perKm),
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4 text-right">Trips</th>
                <th className="py-2 pr-4 text-right">Earnings</th>
                <th className="py-2 pr-4 text-right">Empty km</th>
                <th className="py-2 pr-4 text-right">Waiting</th>
                <th className="py-2 text-right">Rate / km</th>
              </tr>
            </thead>
            <tbody>
              {pagedRoutes.rows.map((row) => (
                <tr
                  key={row.routeId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() => onOpenDetail({ kind: 'route', routeId: row.routeId })}
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatCompact(row.trips)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                    {formatMoneyFull(row.earnings)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatKm(row.emptyKm)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {row.waitingHours.toFixed(1)}h
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">
                    {formatRatePerKm(row.perKm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {routeProfitability.length > 0 ? (
          <TablePager
            paged={pagedRoutes}
            noun="corridors"
            pageSize={routePageSize}
            onPageSizeChange={setRoutePageSize}
          />
        ) : null}
      </ChartCard>

      <ChartCard
        title="Empty Return Risk"
        subtitle={`${riskRows.length} live trips scoring ${emptyRiskAlert()}+ without a return load`}
        icon={<AlertTriangle className="size-4" />}
        isEmpty={riskRows.length === 0}
        emptyMessage="No live trips currently at empty-return risk."
        tableRows={riskRows}
        tableColumns={[
          { key: 'ref', header: 'Reference', align: 'left', render: (row) => row.ref },
          {
            key: 'route',
            header: 'Route',
            align: 'left',
            render: (row) => routeById.get(row.routeId)?.name ?? row.routeId,
          },
          {
            key: 'eta',
            header: 'ETA',
            align: 'left',
            render: (row) => (row.etaAt ? formatDate(row.etaAt, 'dateTime') : '—'),
          },
          {
            key: 'risk',
            header: 'Risk',
            render: (row) => row.emptyReturnRisk,
          },
          {
            key: 'emptyCost',
            header: 'Empty stake',
            render: (row) => formatMoney(routeEmptyStake(dataset, row)),
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">ETA</th>
                <th className="py-2 pr-4 text-right">Risk</th>
                <th className="py-2 text-right">Empty stake</th>
              </tr>
            </thead>
            <tbody>
              {riskRows.map((row) => (
                <tr
                  key={row.tripId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() =>
                    onOpenDetail({ kind: 'trip', tripId: row.tripId, focus: 'backhaul' })
                  }
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.ref}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {routeById.get(row.routeId)?.name ?? row.routeId}
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {row.etaAt ? formatDate(row.etaAt, 'dateTime') : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        row.emptyReturnRisk >= emptyRiskCritical()
                          ? 'text-destructive'
                          : 'text-warning-foreground',
                      )}
                    >
                      {row.emptyReturnRisk}
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatMoney(routeEmptyStake(dataset, row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard
        title="Backhaul Opportunities"
        subtitle={`${opportunities.length} return loads on the board`}
        icon={<Package className="size-4" />}
        isEmpty={opportunities.length === 0}
        emptyMessage="No return loads available right now."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Cargo</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 pr-4 text-right">Deadhead</th>
                <th className="py-2 pr-4 text-right">Match</th>
                <th className="py-2 pr-4 text-right">CO₂ saved</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedOpportunities.rows.map((opp) => {
                const reserved =
                  reservedOpportunityIds.has(opp.id) || opp.status === 'reserved';
                return (
                  <tr
                    key={opp.id}
                    className="border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  >
                    <td className="py-2.5 pr-4">
                      <button
                        type="button"
                        className="text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() =>
                          onOpenDetail({ kind: 'opportunity', opportunityId: opp.id })
                        }
                      >
                        {opp.originName} → {opp.destinationName}
                      </button>
                      <p className="text-[11px] text-muted-foreground">
                        Pickup {formatDate(opp.pickupWindowStart, 'date')}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <CompanyLabel name={opp.customerName} />
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {opp.cargo}
                      <span className="mt-0.5 block text-[11px]">
                        {CONTAINER_TYPE_LABELS[opp.containerType]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                      {formatMoneyFull(opp.revenue)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                      {formatKm(opp.deadheadKm)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-foreground">
                      {(opp.matchScore * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                      {formatCompact(opp.co2SavedKg)} kg
                    </td>
                    <td className="py-2.5 text-right">
                      {reserved ? (
                        <Badge variant="subtle" intent="success" size="sm">
                          Reserved
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReserveOpportunity(opp.id)}
                        >
                          Reserve
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {opportunities.length > 0 ? (
          <TablePager
            paged={pagedOpportunities}
            noun="opportunities"
            pageSize={oppPageSize}
            onPageSizeChange={setOppPageSize}
          />
        ) : null}
      </ChartCard>
    </div>
  );
}

function ItemizedBars({
  slices,
  total,
  swatchOf,
  valueLabel,
  fullWidth = false,
}: {
  slices: Array<{ key: string; label: string; value: number }>;
  total: number;
  swatchOf: (key: string) => string;
  valueLabel: string;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3.5',
        fullWidth
          ? 'w-full'
          : 'w-full flex-1 border-t border-border-subtle pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0',
      )}
    >
      {!fullWidth ? (
        <div className="flex items-center justify-between border-b border-border-subtle/50 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>Category</span>
          <span>{valueLabel} (% Share)</span>
        </div>
      ) : null}

      {slices.map((slice) => {
        const share = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
        const swatch = swatchOf(slice.key);

        return (
          <div key={slice.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <div className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-full', swatch)} />
                <span>{slice.label}</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="font-bold text-foreground">{formatCompact(slice.value)}</span>
                <span className="text-muted-foreground">({share}%)</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={cn('h-full rounded-full transition-all', swatch)}
                style={{ width: `${share}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function routeEmptyStake(dataset: TransporterDataset, fact: TripFact): number {
  const route = dataset.routes.find((entry) => entry.id === fact.routeId);
  if (!route) return fact.emptyCostUsd;
  // Live trips have not booked empty km yet — estimate from the corridor leg.
  return Math.round(route.distanceKm * emptyCostPerKm());
}
