import type { ApexOptions } from 'apexcharts';
import { Activity } from '@/design-system/icons';
import { Card } from '@/design-system';
import type { KpiMetric } from '../../contracts';
import { formatMetric } from '../../format';
import { ApexChart } from '../../charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, chartAnimSpeed } from '../../charts/apexChartTheme';
import { CardHeading } from '../../charts';

export interface DeliveryVolumeCardProps {
  volume: KpiMetric;
  onTimeRate: KpiMetric;
  formatBucket: (key: string) => string;
  onDrillDown?: (metric: KpiMetric) => void;
}

export function DeliveryVolumeCard({
  volume,
  onTimeRate,
  formatBucket,
  onDrillDown,
}: DeliveryVolumeCardProps) {
  const data = volume.trend.map((point) => point.v);
  const categories = volume.trend.map((point) => point.t);

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'area',
      sparkline: { enabled: false },
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors: ['var(--primary)'],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    xaxis: { categories, labels: { show: false } },
    yaxis: { labels: { show: false } },
    grid: { show: false },
    markers: {
      size: 0,
      hover: { size: 5, sizeOffset: 0 },
      strokeWidth: 2,
      strokeColors: 'var(--surface)',
    },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const bucket = categories[dataPointIndex];
        const val = data[dataPointIndex];
        if (bucket === undefined || val === undefined) return '';
        return buildTooltipHtml(formatBucket(bucket), [
          {
            key: 'v',
            label: 'Shipments',
            value: formatMetric(val, 'count'),
            color: 'var(--primary)',
          },
        ]);
      },
    },
  });

  return (
    <Card variant="default" padding="none" className="overflow-visible shadow-sm">
      <div className="flex flex-col gap-4 p-6 pb-3">
        <CardHeading
          title="Delivery volume"
          subtitle="Total volume trajectory across selected timeframe"
          icon={<Activity className="size-4" />}
        />

        <div className="-mx-1 h-32">
          <ApexChart type="area" series={[{ name: 'Shipments', data }]} options={options} height={128} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border-subtle bg-surface-sunken/40 px-6 py-4">
        <Figure
          value={formatMetric(volume.value, volume.unit)}
          caption="Total shipments this period"
          onClick={onDrillDown ? () => onDrillDown(volume) : undefined}
        />
        <Figure
          value={formatMetric(onTimeRate.value, onTimeRate.unit)}
          caption="On-time delivery rate"
          onClick={onDrillDown ? () => onDrillDown(onTimeRate) : undefined}
        />
      </div>
    </Card>
  );
}

function Figure({
  value,
  caption,
  onClick,
}: {
  value: string;
  caption: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="text-[2rem] font-semibold leading-none tracking-tight text-foreground">
        {value}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{caption}</span>
    </>
  );

  if (!onClick) return <div className="flex flex-col gap-2">{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-md text-left transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </button>
  );
}
