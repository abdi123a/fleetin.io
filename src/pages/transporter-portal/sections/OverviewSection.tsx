import { useMemo } from 'react';
import { Activity, Gauge } from '@/design-system/icons';
import { Card, Skeleton } from '@/design-system';
import { cn } from '@/utils';
import {
  ChartCard,
  DeltaBadge,
  RateGauge,
  StackedAreaChart,
  X_AXIS_HEIGHT,
  type Intent,
  type StackedSeries,
} from '@/features/shipper-bi/charts';
import {
  ON_TIME_GRACE_MINUTES,
  ON_TIME_TARGET,
  buildSeries,
  formatCompact,
  inPeriod,
  type TransporterOverview,
  type TripFact,
} from '@/features/transporter-bi';
import type { TransporterSectionProps } from '../sectionContract';
import { EarningsVolumeCard } from './cards/EarningsVolumeCard';

const OUTCOMES_BODY_HEIGHT = 240;
const TREND_PLOT_HEIGHT = 220;

const OUTCOMES = ['early', 'on_time', 'late'] as const;
type TripOutcome = (typeof OUTCOMES)[number];

const OUTCOME_LABELS: Record<TripOutcome, string> = {
  early: 'Early',
  on_time: 'On time',
  late: 'Late',
};

const OUTCOME_COLOR: Record<TripOutcome, string> = {
  early: 'var(--warning)',
  on_time: 'var(--primary)',
  late: 'var(--destructive)',
};

const OUTCOME_SWATCH: Record<TripOutcome, string> = {
  early: 'bg-warning',
  on_time: 'bg-primary',
  late: 'bg-destructive',
};

const OUTCOME_INTENT: Record<TripOutcome, Intent> = {
  early: 'warning',
  on_time: 'good',
  late: 'critical',
};

export interface OverviewSectionProps extends TransporterSectionProps {
  overview?: TransporterOverview;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Overview — earnings and delivery quality, matching the shipper suite's shape.
 *
 * The six KPI tiles sit above the tabs. What remains here is the pair of cards
 * that qualify the two biggest numbers (earnings volume + trip outcomes), plus
 * the one question a snapshot cannot answer — whether the mix is improving.
 *
 * Fleet utilisation and trip-status volume live under Fleet & Backhaul and
 * Trip Reports respectively; repeating them here duplicated the Operations tab
 * and left Overview reading as a scrapbook of gauges.
 */
export function OverviewSection({
  overview,
  facts,
  period,
  granularity,
  isLoading,
  isFetching,
  error,
  onOpenDetail,
}: OverviewSectionProps) {
  const periodFacts = useMemo(() => inPeriod(facts, period), [facts, period]);
  const completed = useMemo(
    () => periodFacts.filter((fact) => fact.isCompleted && fact.onTime !== undefined),
    [periodFacts],
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

  const outcomeSlices = useMemo(() => {
    const counts: Record<TripOutcome, number> = { early: 0, on_time: 0, late: 0 };
    for (const fact of completed) {
      counts[tripOutcome(fact)] += 1;
    }
    return OUTCOMES.map((outcome) => ({
      key: outcome,
      label: OUTCOME_LABELS[outcome],
      value: counts[outcome],
      intent: OUTCOME_INTENT[outcome],
    }));
  }, [completed]);

  const outcomeTrend = useMemo<StackedSeries[]>(
    () =>
      OUTCOMES.map((outcome) => ({
        key: outcome,
        label: OUTCOME_LABELS[outcome],
        color: OUTCOME_COLOR[outcome],
        intent: OUTCOME_INTENT[outcome],
        points: buildSeries({
          facts: completed,
          period,
          granularity,
          valueOf: (fact) => (tripOutcome(fact) === outcome ? 1 : 0),
          aggregate: 'sum',
        }).points,
      })),
    [completed, period, granularity],
  );

  if (isLoading || !overview) return <OverviewSkeleton />;

  const { kpis } = overview;
  const deliveredTotal = outcomeSlices.reduce((sum, slice) => sum + slice.value, 0);
  const hasOutcomeTrend = outcomeTrend.some((series) =>
    series.points.some((point) => point.v > 0),
  );
  const lateCount = outcomeSlices.find((slice) => slice.key === 'late')?.value ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <EarningsVolumeCard
          earnings={kpis.totalEarnings}
          perTrip={kpis.earningsPerTrip}
          formatBucket={formatBucket}
          onOpenDetail={onOpenDetail}
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
            { key: 'value', header: 'Trips', render: (row) => row.value },
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
          <div className="flex flex-col items-center justify-between gap-8 px-2 py-2 md:flex-row">
            <div className="flex min-w-[200px] flex-col items-center justify-center p-4">
              <RateGauge
                value={kpis.onTimeRate.value}
                target={ON_TIME_TARGET}
                label="On-time delivery rate"
                size={160}
              />
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span>{(ON_TIME_TARGET * 100).toFixed(0)}.0% SLA Target</span>
              </div>
              {lateCount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatCompact(lateCount)} late beyond {ON_TIME_GRACE_MINUTES / 60}h grace
                </p>
              ) : null}
            </div>

            <div className="flex w-full flex-1 flex-col gap-3.5 border-t border-border-subtle pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>Outcome Category</span>
                <span>Trips (% Share)</span>
              </div>

              {outcomeSlices.map((slice) => {
                const share =
                  deliveredTotal > 0
                    ? ((slice.value / deliveredTotal) * 100).toFixed(1)
                    : '0.0';
                const swatch = OUTCOME_SWATCH[slice.key as TripOutcome] ?? 'bg-muted-foreground';

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
          </div>
        </ChartCard>
      </div>

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
          ...OUTCOMES.map((outcome, index) => ({
            key: outcome,
            header: OUTCOME_LABELS[outcome],
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

function tripOutcome(fact: TripFact): TripOutcome {
  const variance = fact.deliveryVarianceMinutes ?? 0;
  if (variance < 0) return 'early';
  if (fact.onTime) return 'on_time';
  return 'late';
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
