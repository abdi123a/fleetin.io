import { useMemo } from 'react';
import { Activity, Gauge, Star, TrendingUp, Users } from '@/design-system/icons';
import { Badge } from '@/design-system';
import {
  BubbleScatter,
  CategoryBarChart,
  ChartCard,
  RateGauge,
  X_AXIS_HEIGHT,
  type BubblePoint,
} from '@/features/shipper-bi/charts';
import type { CategorySlice } from '@/features/shipper-bi/contracts';
import {
  ON_TIME_TARGET,
  formatCompact,
  formatDuration,
  formatRating,
} from '@/features/transporter-bi';
import { cn } from '@/utils';
import type { TransporterSectionProps } from '../sectionContract';

const BAR_ROW_HEIGHT = 36;
const BUBBLE_HEIGHT = 320;

/**
 * Network — where this carrier sits against anonymised peers, what the
 * opportunity bands look like, and how we compare to network averages.
 */
export function NetworkSection({ dataset }: TransporterSectionProps) {
  const { network } = dataset;

  const peers = useMemo(
    () =>
      [...network.peers].sort((a, b) => b.reliabilityScore - a.reliabilityScore),
    [network.peers],
  );

  const you = useMemo(() => peers.find((peer) => peer.isYou), [peers]);

  const opportunitySlices = useMemo<CategorySlice[]>(
    () =>
      network.opportunityBands.map((band) => ({
        key: band.key,
        label: band.label,
        value: band.offersPerWeek,
      })),
    [network.opportunityBands],
  );

  const bandHeight = Math.max(140, opportunitySlices.length * BAR_ROW_HEIGHT);

  const bubblePoints = useMemo<BubblePoint[]>(
    () =>
      peers.map((peer) => ({
        key: peer.id,
        label: peer.isYou ? 'You' : peer.label,
        x: peer.costIndex,
        y: peer.onTimeRate,
        z: peer.trips,
        intent: peer.isYou ? 'good' : 'neutral',
      })),
    [peers],
  );

  const benchmarks = useMemo(() => {
    if (!you) return [];
    return [
      {
        key: 'on_time',
        label: 'On-time rate',
        yoursDisplay: `${(you.onTimeRate * 100).toFixed(1)}%`,
        networkDisplay: `${(network.onTimeRate * 100).toFixed(1)}%`,
        ahead: you.onTimeRate >= network.onTimeRate,
      },
      {
        key: 'acceptance',
        label: 'Acceptance rate',
        yoursDisplay: `${(you.acceptanceRate * 100).toFixed(1)}%`,
        networkDisplay: `${(network.acceptanceRate * 100).toFixed(1)}%`,
        ahead: you.acceptanceRate >= network.acceptanceRate,
      },
      {
        key: 'rating',
        label: 'Average rating',
        yoursDisplay: formatRating(you.avgRating),
        networkDisplay: formatRating(network.avgRating),
        ahead: you.avgRating >= network.avgRating,
      },
      {
        key: 'delay',
        label: 'Delay rate vs network avg delay',
        yoursDisplay: `${(you.delayRate * 100).toFixed(1)}%`,
        networkDisplay: formatDuration(network.avgDelayMinutes),
        ahead: you.delayRate <= 0.15,
      },
    ];
  }, [you, network]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ChartCard
          title="Your position"
          subtitle={
            you
              ? `Reliability score ${you.reliabilityScore.toFixed(0)} · ${formatCompact(you.trips)} trips`
              : 'You are not in the peer set'
          }
          icon={<Gauge className="size-4" />}
          isEmpty={!you}
          emptyMessage="No peer benchmark available."
          bodyHeight={220}
        >
          {you ? (
            <div className="flex flex-col items-center justify-center gap-4 py-2 md:flex-row md:gap-10">
              <RateGauge
                value={you.onTimeRate}
                target={ON_TIME_TARGET}
                label="Your on-time rate"
                size={150}
              />
              <div className="grid w-full max-w-xs grid-cols-2 gap-3">
                <MetricChip label="Acceptance" value={`${(you.acceptanceRate * 100).toFixed(1)}%`} />
                <MetricChip label="Rating" value={formatRating(you.avgRating)} />
                <MetricChip label="Delay rate" value={`${(you.delayRate * 100).toFixed(1)}%`} />
                <MetricChip label="Cost index" value={you.costIndex.toFixed(2)} />
              </div>
            </div>
          ) : null}
        </ChartCard>

        <ChartCard
          title="Opportunity bands"
          subtitle="Offers per week by performance band"
          icon={<TrendingUp className="size-4" />}
          isEmpty={opportunitySlices.length === 0}
          emptyMessage="No opportunity band data."
          bodyHeight={bandHeight + X_AXIS_HEIGHT}
          tableRows={network.opportunityBands}
          tableColumns={[
            { key: 'label', header: 'Band', align: 'left', render: (row) => row.label },
            {
              key: 'offers',
              header: 'Offers / week',
              render: (row) => formatCompact(row.offersPerWeek),
            },
            {
              key: 'carriers',
              header: 'Carriers',
              render: (row) => formatCompact(row.carriers),
            },
          ]}
        >
          <CategoryBarChart
            slices={opportunitySlices}
            formatValue={(value) => `${formatCompact(value)}/wk`}
            valueLabel="Offers / week"
            height={bandHeight}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Cost vs reliability"
        subtitle="Cost index against on-time rate — bubble size is trip volume"
        icon={<Activity className="size-4" />}
        isEmpty={bubblePoints.length === 0}
        emptyMessage="No peer positions to plot."
        bodyHeight={BUBBLE_HEIGHT}
        tableRows={peers}
        tableColumns={[
          { key: 'label', header: 'Carrier', align: 'left', render: (row) => row.label },
          {
            key: 'cost',
            header: 'Cost index',
            render: (row) => row.costIndex.toFixed(2),
          },
          {
            key: 'onTime',
            header: 'On-time',
            render: (row) => `${(row.onTimeRate * 100).toFixed(1)}%`,
          },
          { key: 'trips', header: 'Trips', render: (row) => formatCompact(row.trips) },
        ]}
      >
        <BubbleScatter
          points={bubblePoints}
          xLabel="Cost index"
          yLabel="On-time rate"
          formatX={(value) => value.toFixed(2)}
          formatY={(value) => `${(value * 100).toFixed(0)}%`}
          zLabel="Trips"
          formatZ={(value) => formatCompact(value)}
          height={BUBBLE_HEIGHT - 24}
          quadrants={{
            x: 1,
            y: ON_TIME_TARGET,
            labels: [
              'Cheap · reliable',
              'Premium · reliable',
              'Premium · at risk',
              'Cheap · at risk',
            ],
          }}
        />
      </ChartCard>

      <ChartCard
        title="Benchmark vs network"
        subtitle="Your rates against anonymised network averages"
        icon={<Star className="size-4" />}
        isEmpty={benchmarks.length === 0}
        emptyMessage="No benchmark comparison available."
      >
        <div className="flex flex-col gap-4">
          {benchmarks.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">Network {row.networkDisplay}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {row.yoursDisplay}
                </span>
                <Badge
                  variant="subtle"
                  intent={row.ahead ? 'success' : 'warning'}
                  size="sm"
                >
                  {row.ahead ? 'At or above' : 'Below network'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title="Network peer leaderboard"
        subtitle="Ranked by reliability score — peers are anonymised"
        icon={<Users className="size-4" />}
        isEmpty={peers.length === 0}
        emptyMessage="No peers in the network sample."
        tableRows={peers}
        tableColumns={[
          {
            key: 'rank',
            header: 'Rank',
            align: 'left',
            render: (row) => peers.indexOf(row) + 1,
          },
          { key: 'label', header: 'Carrier', align: 'left', render: (row) => row.label },
          {
            key: 'score',
            header: 'Reliability',
            render: (row) => row.reliabilityScore.toFixed(0),
          },
          {
            key: 'onTime',
            header: 'On-time',
            render: (row) => `${(row.onTimeRate * 100).toFixed(1)}%`,
          },
          {
            key: 'rating',
            header: 'Rating',
            render: (row) => formatRating(row.avgRating),
          },
          { key: 'trips', header: 'Trips', render: (row) => formatCompact(row.trips) },
        ]}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Rank</th>
                <th className="py-2 pr-4">Carrier</th>
                <th className="py-2 pr-4 text-right">Reliability</th>
                <th className="py-2 pr-4 text-right">On-time</th>
                <th className="py-2 pr-4 text-right">Acceptance</th>
                <th className="py-2 pr-4 text-right">Rating</th>
                <th className="py-2 text-right">Trips</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer, index) => (
                <tr
                  key={peer.id}
                  className={cn(
                    'border-b border-border/60 last:border-0',
                    peer.isYou && 'bg-primary/5',
                  )}
                >
                  <td className="py-2.5 pr-4 font-semibold tabular-nums text-foreground">
                    {index + 1}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-foreground">{peer.label}</span>
                    {peer.isYou ? (
                      <Badge variant="subtle" intent="primary" size="sm" className="ml-2">
                        You
                      </Badge>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                    {peer.reliabilityScore.toFixed(0)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {(peer.onTimeRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {(peer.acceptanceRate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatRating(peer.avgRating)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-foreground">
                    {formatCompact(peer.trips)}
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

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
