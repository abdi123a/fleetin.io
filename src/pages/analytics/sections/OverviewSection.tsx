import { useMemo } from 'react';
import { Activity, Gauge } from '@/design-system/icons';
import { Card, Skeleton } from '@/design-system';
import { cn } from '@/utils';
import { bucketLabel, chooseGranularity } from '@/lib/bi/time';
import type {
  BiFilters,
  DrillDown,
  OverviewSection as OverviewData,
} from '@/features/shipper-bi/contracts';
import { DELIVERY_OUTCOMES, DELIVERY_OUTCOME_LABELS } from '@/features/shipper-bi/contracts';
import {
  ChartCard,
  DeltaBadge,
  RateGauge,
  StackedAreaChart,
  X_AXIS_HEIGHT,
  type Intent,
  type StackedSeries,
} from '@/features/shipper-bi/charts';
import { DeliveryVolumeCard } from '@/features/shipper-bi/sections/cards/DeliveryVolumeCard';
import type { ShipmentFact } from '@/lib/bi/derive';
import { buildTrendSeries } from '../analyticsConfig';

const OUTCOMES_BODY_HEIGHT = 240;
const TREND_PLOT_HEIGHT = 220;

/**
 * Delivery outcome colours — Fleetin brand + status, not traffic-light defaults.
 *
 *   On time → primary teal (the account working)
 *   Early   → warning amber (plan was wrong, not late)
 *   Late    → destructive red (missed promise)
 *
 * Explicit tokens so Apex paints concrete values and the legend/breakdown
 * stay in lockstep with the design system.
 */
const OUTCOME_COLOR: Record<string, string> = {
  early: 'var(--warning)',
  on_time: 'var(--primary)',
  late: 'var(--destructive)',
};

const OUTCOME_SWATCH: Record<string, string> = {
  early: 'bg-warning',
  on_time: 'bg-primary',
  late: 'bg-destructive',
};

/** Kept for aggregate slices that still carry an intent field. */
const OUTCOME_INTENT: Record<string, Intent> = {
  early: 'warning',
  on_time: 'good',
  late: 'critical',
};

export interface OverviewSectionProps {
  data?: OverviewData;
  facts: ShipmentFact[];
  filters: BiFilters;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onDrillDown: (drillDown: DrillDown | undefined) => void;
}

/**
 * Overview — the two numbers every other tab exists to explain.
 *
 * Volume and delivery quality. The six KPI tiles that used to open this section
 * now sit above the tab bar, where they stay visible on every tab; what is left
 * here is the pair of cards that qualify the two biggest of them, plus the one
 * question a snapshot can never answer — whether the mix is improving.
 */
export function OverviewSection({
  data,
  facts,
  filters,
  isLoading,
  isFetching,
  error,
  onDrillDown,
}: OverviewSectionProps) {
  const granularity = chooseGranularity({ from: filters.from, to: filters.to });
  const formatBucket = (key: string) => bucketLabel(key, granularity);

  // Early / on-time / late as three bands over the period. Built here rather
  // than from `data.deliveryOutcomes`, which is a single snapshot with no time
  // dimension to plot.
  const outcomeTrend = useMemo<StackedSeries[]>(
    () =>
      DELIVERY_OUTCOMES.map((outcome) => ({
        key: outcome,
        label: DELIVERY_OUTCOME_LABELS[outcome],
        color: OUTCOME_COLOR[outcome],
        intent: OUTCOME_INTENT[outcome],
        points: buildTrendSeries({
          facts,
          filters,
          dateOf: (fact) => fact.deliveredAt,
          valueOf: (fact) => (fact.deliveryOutcome === outcome ? 1 : 0),
          aggregate: 'sum',
        }).points,
      })),
    [facts, filters],
  );

  if (isLoading || !data) return <OverviewSkeleton />;

  const { kpis } = data;
  const deliveredTotal = data.deliveryOutcomes.reduce((sum, slice) => sum + slice.value, 0);
  const outcomeSlices = data.deliveryOutcomes.map((slice) => ({
    ...slice,
    intent: slice.intent ?? OUTCOME_INTENT[slice.key],
  }));
  const hasOutcomeTrend = outcomeTrend.some((s) => s.points.some((point) => point.v > 0));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <DeliveryVolumeCard
          volume={kpis.totalShipments}
          onTimeRate={kpis.onTimeRate}
          formatBucket={formatBucket}
          onDrillDown={(metric) => onDrillDown(metric.drillDown)}
        />

        <ChartCard
          title="Delivery outcomes"
          subtitle="Early, on time, and how late the rest were"
          icon={<Gauge className="size-4" />}
          isFetching={isFetching}
          error={error}
          isEmpty={deliveredTotal === 0}
          emptyMessage="No deliveries completed in this period."
          bodyHeight={OUTCOMES_BODY_HEIGHT}
          actions={
            <DeltaBadge
              deltaPct={kpis.onTimeRate.deltaPct}
              caption="on-time vs prior"
              polarity="higher_is_better"
            />
          }
          tableRows={outcomeSlices}
          tableColumns={[
            { key: 'label', header: 'Outcome', align: 'left', render: (row) => row.label },
            { key: 'value', header: 'Shipments', render: (row) => row.value },
            {
              key: 'share',
              header: 'Share',
              render: (row) =>
                deliveredTotal === 0
                  ? '—'
                  : `${((row.value / deliveredTotal) * 100).toFixed(1)}%`,
            },
          ]}
        >
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row py-2 px-2">
            {/* Single Radial Chart: On-Time SLA Rate Gauge */}
            <div className="flex flex-col items-center justify-center p-4 min-w-[200px]">
              <RateGauge
                value={kpis.onTimeRate.value}
                target={0.9}
                label="On-time delivery rate"
                size={160}
              />
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>90.0% SLA Target</span>
              </div>
            </div>

            {/* Clean Itemized Outcome Breakdown List */}
            <div className="flex-1 w-full flex flex-col gap-3.5 pl-0 md:pl-6 border-t md:border-t-0 md:border-l border-border-subtle pt-4 md:pt-0">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border-subtle/50">
                <span>Outcome Category</span>
                <span>Shipments (% Share)</span>
              </div>

              {outcomeSlices.map((slice) => {
                const share = deliveredTotal > 0 ? ((slice.value / deliveredTotal) * 100).toFixed(1) : '0.0';
                const swatch = OUTCOME_SWATCH[slice.key] ?? 'bg-muted-foreground';

                return (
                  <div key={slice.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2.5 rounded-full', swatch)} />
                        <span>{slice.label}</span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        <span className="font-bold text-foreground">{slice.value}</span>
                        <span className="text-muted-foreground">({share}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', swatch)}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Is the mix improving? — the question the snapshot above cannot answer */}
      <ChartCard
        title="Delivery outcomes over time"
        subtitle="Whether service is improving, not just where it stands today"
        icon={<Activity className="size-4" />}
        isFetching={isFetching}
        isEmpty={!hasOutcomeTrend}
        emptyMessage="No completed deliveries in this period."
        bodyHeight={TREND_PLOT_HEIGHT + X_AXIS_HEIGHT}
        tableRows={outcomeTrend[0]?.points ?? []}
        tableColumns={[
          {
            key: 't',
            header: 'Period',
            align: 'left',
            render: (row) => formatBucket(row.t),
          },
          ...DELIVERY_OUTCOMES.map((outcome, index) => ({
            key: outcome,
            header: DELIVERY_OUTCOME_LABELS[outcome],
            render: (row: { t: string }) =>
              outcomeTrend[index]?.points.find((point) => point.t === row.t)?.v ?? 0,
          })),
        ]}
      >
        <StackedAreaChart
          series={outcomeTrend}
          formatValue={(value) => String(Math.round(value))}
          formatBucket={formatBucket}
          height={TREND_PLOT_HEIGHT}
        />
      </ChartCard>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card variant="default" padding="lg" className="gap-4">
          <Skeleton shape="text" className="h-4 w-28" />
          <Skeleton shape="block" className="h-48 w-full" />
        </Card>
        <Card variant="default" padding="lg" className="gap-4">
          <Skeleton shape="text" className="h-4 w-28" />
          <Skeleton shape="block" className="h-48 w-full" />
        </Card>
      </div>
      <Card variant="default" padding="lg" className="gap-4">
        <Skeleton shape="text" className="h-4 w-40" />
        <Skeleton shape="block" className="h-56 w-full" />
      </Card>
    </div>
  );
}
