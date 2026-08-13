import { type ReactNode } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ArrowDownRight, ArrowUpRight, Minus } from '@/design-system/icons';
import { Card, IconChip, Skeleton } from '@/design-system';
import { cn } from '@/utils';
import type { KpiMetric } from '../contracts';
import { deltaIntent, formatDelta, formatMetric } from '../format';
import { ApexChart } from './ApexChart';
import { chartAnimSpeed, MARK, sparklineOptions } from './apexChartTheme';

export interface KpiCardProps {
  metric: KpiMetric;
  icon?: ReactNode;
  isLoading?: boolean;
  onDrillDown?: (metric: KpiMetric) => void;
  children?: ReactNode;
  className?: string;
}

export function KpiCard({
  metric,
  icon,
  isLoading = false,
  onDrillDown,
  children,
  className,
}: KpiCardProps) {
  if (isLoading) return <KpiCardSkeleton className={className} />;

  const intent = deltaIntent(metric.deltaPct, metric.polarity);
  const delta = formatDelta(metric.deltaPct);
  const canDrill = Boolean(onDrillDown && metric.drillDown);

  const DeltaIcon =
    metric.deltaPct === undefined || Math.abs(metric.deltaPct) < 0.0005
      ? Minus
      : metric.deltaPct > 0
        ? ArrowUpRight
        : ArrowDownRight;

  const sparkStroke =
    intent === 'good'
      ? 'var(--success)'
      : intent === 'bad'
        ? 'var(--destructive)'
        : 'var(--chart-1)';

  const sparkData = buildSparkData(metric);
  const sparkSeries: ApexOptions['series'] = [{ name: metric.label, data: sparkData.map((d) => d.value) }];

  if (metric.previousTrend?.length) {
    sparkSeries.push({
      name: 'Prior',
      data: sparkData.map((d) => d.previous ?? null),
    });
  }

  const sparkOptions: ApexOptions = sparklineOptions(sparkStroke, {
    stroke: {
      width: metric.previousTrend?.length ? [MARK.lineWidth, 1] : MARK.lineWidth,
      dashArray: metric.previousTrend?.length ? [0, 3] : 0,
      colors: metric.previousTrend?.length
        ? [sparkStroke, 'var(--muted-foreground)']
        : [sparkStroke],
    },
    colors: metric.previousTrend?.length
      ? [sparkStroke, 'var(--muted-foreground)']
      : [sparkStroke],
    chart: {
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
  });

  const body = (
    <>
      <div className="flex items-start gap-2.5">
        {icon ? <IconChip size={36}>{icon}</IconChip> : null}
        <p className="min-w-0 flex-1 pt-1.5 text-xs font-medium text-muted-foreground">
          {metric.label}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold leading-none text-foreground">
          {formatMetric(metric.value, metric.unit)}
        </span>

        {delta ? (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              intent === 'good' && 'bg-success-subtle text-success-subtle-foreground',
              intent === 'bad' && 'bg-destructive-subtle text-destructive-subtle-foreground',
              intent === 'neutral' && 'bg-muted text-muted-foreground',
            )}
          >
            <DeltaIcon className="size-3" aria-hidden />
            {delta}
          </span>
        ) : null}
      </div>

      {metric.trend.length > 1 ? (
        <div className="-mx-1 h-9">
          <ApexChart type="area" series={sparkSeries} options={sparkOptions} height={36} />
        </div>
      ) : null}

      {children}

      {metric.caption ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{metric.caption}</p>
      ) : null}
    </>
  );

  if (!canDrill) {
    return (
      <Card variant="default" padding="md" className={cn('gap-3', className)}>
        {body}
      </Card>
    );
  }

  return (
    <Card
      variant="default"
      padding="md"
      clickable
      className={cn('gap-3 text-left', className)}
      onClick={() => onDrillDown?.(metric)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onDrillDown?.(metric);
        }
      }}
      aria-label={`${metric.label}: ${formatMetric(metric.value, metric.unit)}. Open details.`}
    >
      {body}
    </Card>
  );
}

function buildSparkData(metric: KpiMetric) {
  return metric.trend.map((point, index) => ({
    t: point.t,
    value: point.v,
    previous: metric.previousTrend?.[index]?.v,
  }));
}

export function KpiCardSkeleton({ className }: { className?: string }) {
  return (
    <Card variant="default" padding="md" className={cn('gap-3', className)}>
      <div className="flex items-center gap-2.5">
        <Skeleton shape="block" className="size-9 rounded-full" />
        <Skeleton shape="text" className="h-3 w-24" />
      </div>
      <Skeleton shape="text" className="h-7 w-28" />
      <Skeleton shape="block" className="h-9 w-full" />
    </Card>
  );
}
