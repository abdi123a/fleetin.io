import type { ApexOptions } from 'apexcharts';
import { Calendar, Wallet } from '@/design-system/icons';
import { Card } from '@/design-system';
import { formatDate } from '@/utils';
import type { CategorySlice, KpiMetric } from '../../contracts';
import { deltaIntent, formatCurrencyFull, formatDelta, formatMetric } from '../../format';
import { ApexChart } from '../../charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, chartAnimSpeed } from '../../charts/apexChartTheme';
import { CardHeading } from '../../charts';
import { cn } from '@/utils';

export interface SpendOverviewCardProps {
  total: KpiMetric;
  buckets: CategorySlice[];
  from: string;
  to: string;
  onDrillDown?: (metric: KpiMetric) => void;
}

export function SpendOverviewCard({
  total,
  buckets,
  from,
  to,
  onDrillDown,
}: SpendOverviewCardProps) {
  const intent = deltaIntent(total.deltaPct, total.polarity);
  const delta = formatDelta(total.deltaPct);
  const peak = Math.max(...buckets.map((bucket) => bucket.value), 0);

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'bar',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors: buckets.map((bucket) =>
      peak > 0 && bucket.value === peak ? 'var(--chart-1)' : 'color-mix(in srgb, var(--chart-1) 42%, transparent)',
    ),
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: '55%',
        distributed: true,
      },
    },
    xaxis: {
      categories: buckets.map((b) => b.label),
      labels: { style: { fontSize: '10px' } },
    },
    yaxis: { labels: { show: false } },
    grid: { padding: { left: 4, right: 4 } },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const slice = buckets[dataPointIndex];
        if (!slice) return '';
        return buildTooltipHtml(slice.label, [
          {
            key: 'spend',
            label: 'Spend',
            value: formatCurrencyFull(slice.value),
            color: 'var(--chart-1)',
          },
        ]);
      },
    },
  });

  return (
    <Card variant="default" padding="lg" className="gap-4">
      <CardHeading
        title="Logistics spend"
        icon={<Wallet className="size-4" />}
        actions={
          <span className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1.5 text-[11px] leading-none text-muted-foreground">
            <Calendar className="size-3.5" aria-hidden />
            {formatDate(from, 'date')} – {formatDate(to, 'date')}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onDrillDown ? () => onDrillDown(total) : undefined}
          disabled={!onDrillDown}
          className="rounded-sm text-[2rem] font-semibold leading-none tracking-tight text-foreground transition-colors enabled:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
        >
          {formatMetric(total.value, total.unit)}
        </button>
        {delta ? (
          <span
            className={cn(
              'rounded-full px-2 py-1 text-[11px] font-semibold leading-none',
              intent === 'good' && 'bg-success-subtle text-success-subtle-foreground',
              intent === 'bad' && 'bg-destructive-subtle text-destructive-subtle-foreground',
              intent === 'neutral' && 'bg-muted text-muted-foreground',
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>

      <div className="-mx-1 h-40">
        <ApexChart
          type="bar"
          series={[{ name: 'Spend', data: buckets.map((b) => b.value) }]}
          options={options}
          height={160}
        />
      </div>
    </Card>
  );
}
