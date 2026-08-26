import { useMemo } from 'react';
import { AlertTriangle, Clock, MapPin, TrendingDown } from '@/design-system/icons';
import {
  CategoryBarChart,
  ChartCard,
  ParetoChart,
  TrendChart,
  X_AXIS_HEIGHT,
} from '@/features/shipper-bi/charts';
import type { CategorySlice } from '@/features/shipper-bi/contracts';
import {
  CompanyLabel,
  DELAY_CAUSES,
  DELAY_CAUSE_LABELS,
  DELAY_PARTIES,
  DELAY_PARTY_LABELS,
  WAITING_LOCATIONS,
  WAITING_LOCATION_LABELS,
  buildSeries,
  formatCompact,
  formatDuration,
  inPeriod,
  type DelayCause,
  type DelayParty,
  type WaitingLocation,
} from '@/features/transporter-bi';
import type { TransporterSectionProps } from '../sectionContract';
import { StatCard } from './cards/StatCard';

const PARETO_HEIGHT = 240;
const BAR_ROW_HEIGHT = 34;
const TREND_PLOT_HEIGHT = 220;

/**
 * Delays — where minutes are lost, who owns them, and which trips are worst.
 */
export function DelaysSection({
  dataset,
  facts,
  period,
  granularity,
  onOpenDetail,
}: TransporterSectionProps) {
  const periodFacts = useMemo(() => inPeriod(facts, period), [facts, period]);

  const delayData = useMemo(() => buildDelayBreakdown(periodFacts), [periodFacts]);

  const headline = useMemo(() => {
    const tripCount = periodFacts.length;
    const delayedTrips = delayData.delayedTrips;
    const delayRate = tripCount > 0 ? delayedTrips / tripCount : 0;
    const avgDelayMinutes =
      delayedTrips > 0 ? delayData.totalMinutes / delayedTrips : 0;
    const waitingHours = periodFacts.reduce((sum, fact) => sum + fact.waitingHours, 0);
    return { delayRate, avgDelayMinutes, waitingHours, tripCount };
  }, [periodFacts, delayData]);

  const delayTrend = useMemo(() => {
    const series = buildSeries({
      facts: periodFacts,
      period,
      granularity,
      valueOf: (fact) => fact.delayMinutes / 60,
      aggregate: 'sum',
    });
    return series;
  }, [periodFacts, period, granularity]);

  const waitingSlices = useMemo<CategorySlice[]>(() => {
    const totals: Record<WaitingLocation, number> = {
      port: 0,
      border: 0,
      loading_site: 0,
      unloading_site: 0,
    };
    for (const fact of periodFacts) {
      for (const location of WAITING_LOCATIONS) {
        totals[location] += fact.waitingByLocation[location] ?? 0;
      }
    }
    return WAITING_LOCATIONS.map((location) => ({
      key: location,
      label: WAITING_LOCATION_LABELS[location],
      value: Math.round(totals[location] * 10) / 10,
    }))
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [periodFacts]);

  const topDelayed = useMemo(
    () =>
      periodFacts
        .filter((fact) => fact.delayMinutes > 0)
        .sort((a, b) => b.delayMinutes - a.delayMinutes)
        .slice(0, 12),
    [periodFacts],
  );

  const routeById = useMemo(
    () => new Map(dataset.routes.map((route) => [route.id, route])),
    [dataset.routes],
  );
  const customerById = useMemo(
    () => new Map(dataset.customers.map((customer) => [customer.id, customer])),
    [dataset.customers],
  );

  const partyPlotHeight = Math.max(140, delayData.parties.length * BAR_ROW_HEIGHT);
  const waitingPlotHeight = Math.max(140, waitingSlices.length * BAR_ROW_HEIGHT);
  const hasDelayTrend = delayTrend.points.some((point) => point.v > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Delay rate"
          value={`${(headline.delayRate * 100).toFixed(1)}%`}
          caption={`${formatCompact(delayData.delayedTrips)} of ${formatCompact(headline.tripCount)} trips`}
          intent={
            headline.tripCount === 0
              ? 'neutral'
              : headline.delayRate > 0.25
                ? 'critical'
                : headline.delayRate > 0.15
                  ? 'warning'
                  : 'good'
          }
        />
        <StatCard
          label="Average delay duration"
          value={
            delayData.delayedTrips > 0
              ? formatDuration(headline.avgDelayMinutes)
              : '—'
          }
          caption="Among delayed trips only"
          intent={
            delayData.delayedTrips === 0
              ? 'neutral'
              : headline.avgDelayMinutes > 240
                ? 'critical'
                : headline.avgDelayMinutes > 120
                  ? 'warning'
                  : 'neutral'
          }
        />
        <StatCard
          label="Waiting impact"
          value={`${headline.waitingHours.toFixed(1)}h`}
          caption="Total waiting hours in period"
          intent={headline.waitingHours > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <ChartCard
        title="Delay Minutes by Cause"
        subtitle={`${formatCompact(delayData.delayedTrips)} delayed trips · ${formatDuration(delayData.totalMinutes)} lost`}
        icon={<Clock className="size-4" />}
        isEmpty={delayData.causes.length === 0}
        emptyMessage="No delays recorded in this period."
        bodyHeight={PARETO_HEIGHT + X_AXIS_HEIGHT}
        tableRows={delayData.causes}
        tableColumns={[
          { key: 'label', header: 'Cause', align: 'left', render: (row) => row.label },
          {
            key: 'value',
            header: 'Minutes',
            render: (row) => formatDuration(row.value),
          },
          {
            key: 'share',
            header: 'Share',
            render: (row) => `${(row.share * 100).toFixed(1)}%`,
          },
          {
            key: 'cumulative',
            header: 'Cumulative',
            render: (row) => `${(row.cumulativeShare * 100).toFixed(1)}%`,
          },
        ]}
      >
        <ParetoChart
          rows={delayData.causes}
          formatValue={(minutes) => formatDuration(minutes)}
          height={PARETO_HEIGHT}
          onSelect={(row) =>
            onOpenDetail({
              kind: 'trips',
              title: `${row.label} delays`,
              narrow: { delayCauses: [row.key as DelayCause] },
            })
          }
        />
      </ChartCard>

      <ChartCard
        title="Delay trend"
        subtitle="Delay hours realised by period"
        icon={<TrendingDown className="size-4" />}
        isEmpty={!hasDelayTrend}
        emptyMessage="No delays recorded in this period."
        bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
        tableRows={delayTrend.points}
        tableColumns={[
          {
            key: 't',
            header: 'Period',
            align: 'left',
            render: (row) => delayTrend.formatBucket(row.t),
          },
          {
            key: 'v',
            header: 'Delay hours',
            render: (row) => `${row.v.toFixed(1)}h`,
          },
        ]}
      >
        <TrendChart
          series={[
            {
              key: 'delay_hours',
              label: 'Delay hours',
              points: delayTrend.points,
            },
          ]}
          formatValue={(value) => `${value.toFixed(1)}h`}
          formatBucket={delayTrend.formatBucket}
          height={TREND_PLOT_HEIGHT}
        />
      </ChartCard>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ChartCard
          title="Delay Responsibility"
          subtitle="Hours lost by party"
          icon={<AlertTriangle className="size-4" />}
          className="h-full"
          isEmpty={delayData.parties.length === 0}
          emptyMessage="No attributed delays in this period."
          bodyHeight={partyPlotHeight + X_AXIS_HEIGHT}
          tableRows={delayData.parties}
          tableColumns={[
            { key: 'label', header: 'Party', align: 'left', render: (row) => row.label },
            {
              key: 'value',
              header: 'Minutes',
              render: (row) => formatDuration(row.value),
            },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                delayData.totalMinutes === 0
                  ? '—'
                  : `${((row.value / delayData.totalMinutes) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <CategoryBarChart
            slices={delayData.parties}
            formatValue={(value) => formatDuration(value)}
            valueLabel="Delay"
            height={partyPlotHeight}
          />
        </ChartCard>

        <ChartCard
          title="Waiting Time by Location"
          subtitle="Where vehicles wait before departure"
          icon={<MapPin className="size-4" />}
          className="h-full"
          isEmpty={waitingSlices.length === 0}
          emptyMessage="No waiting time recorded in this period."
          bodyHeight={waitingPlotHeight + X_AXIS_HEIGHT}
          tableRows={waitingSlices}
          tableColumns={[
            { key: 'label', header: 'Location', align: 'left', render: (row) => row.label },
            {
              key: 'value',
              header: 'Hours',
              render: (row) => `${row.value.toFixed(1)}h`,
            },
          ]}
        >
          <CategoryBarChart
            slices={waitingSlices}
            formatValue={(value) => `${value.toFixed(1)}h`}
            valueLabel="Waiting hours"
            height={waitingPlotHeight}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Most Delayed Trips"
        subtitle="Highest delay minutes this period"
        icon={<Clock className="size-4" />}
        isEmpty={topDelayed.length === 0}
        emptyMessage="No delayed trips in this period."
        tableRows={topDelayed}
        tableColumns={[
          { key: 'ref', header: 'Reference', align: 'left', render: (row) => row.ref },
          {
            key: 'route',
            header: 'Route',
            align: 'left',
            render: (row) => routeById.get(row.routeId)?.name ?? row.routeId,
          },
          {
            key: 'customer',
            header: 'Customer',
            align: 'left',
            render: (row) => (
              <CompanyLabel
                id={row.customerId}
                name={customerById.get(row.customerId)?.name ?? row.customerId}
              />
            ),
          },
          {
            key: 'cause',
            header: 'Primary cause',
            align: 'left',
            render: (row) =>
              row.primaryCause ? DELAY_CAUSE_LABELS[row.primaryCause] : '—',
          },
          {
            key: 'delay',
            header: 'Delay',
            render: (row) => formatDuration(row.delayMinutes),
          },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Primary cause</th>
                <th className="py-2 text-right">Delay</th>
              </tr>
            </thead>
            <tbody>
              {topDelayed.map((row) => (
                <tr
                  key={row.tripId}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                  onClick={() =>
                    onOpenDetail({ kind: 'trip', tripId: row.tripId, focus: 'delay' })
                  }
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">{row.ref}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {routeById.get(row.routeId)?.name ?? row.routeId}
                  </td>
                  <td className="py-2.5 pr-4">
                    <CompanyLabel
                      id={row.customerId}
                      name={customerById.get(row.customerId)?.name ?? row.customerId}
                    />
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {row.primaryCause ? DELAY_CAUSE_LABELS[row.primaryCause] : '—'}
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">
                    {formatDuration(row.delayMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function buildDelayBreakdown(facts: ReturnType<typeof inPeriod>) {
  const delayed = facts.filter((fact) => fact.delayMinutes > 0);
  const totalMinutes = delayed.reduce((sum, fact) => sum + fact.delayMinutes, 0);

  const byCause = new Map<DelayCause, number>();
  for (const cause of DELAY_CAUSES) byCause.set(cause, 0);
  for (const fact of delayed) {
    for (const cause of DELAY_CAUSES) {
      byCause.set(cause, (byCause.get(cause) ?? 0) + (fact.delayByCause[cause] ?? 0));
    }
  }

  const causeRows = Array.from(byCause.entries())
    .map(([cause, minutes]) => ({
      key: cause,
      label: DELAY_CAUSE_LABELS[cause],
      value: minutes,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  let cumulative = 0;
  const causes = causeRows.map((row) => {
    const share = totalMinutes > 0 ? row.value / totalMinutes : 0;
    cumulative += share;
    return { ...row, share, cumulativeShare: cumulative };
  });

  const byParty = new Map<DelayParty, number>();
  for (const party of DELAY_PARTIES) byParty.set(party, 0);
  for (const fact of delayed) {
    for (const party of DELAY_PARTIES) {
      byParty.set(party, (byParty.get(party) ?? 0) + (fact.delayByParty[party] ?? 0));
    }
  }

  const parties: CategorySlice[] = Array.from(byParty.entries())
    .map(([party, minutes]) => ({
      key: party,
      label: DELAY_PARTY_LABELS[party],
      value: minutes,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  return {
    delayedTrips: delayed.length,
    totalMinutes,
    causes,
    parties,
  };
}
