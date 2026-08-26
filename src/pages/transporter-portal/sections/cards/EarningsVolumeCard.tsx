import type { ApexOptions } from 'apexcharts';
import { Activity } from '@/design-system/icons';
import { Card } from '@/design-system';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { CardHeading } from '@/features/shipper-bi/charts';
import type { DetailRequest, KpiMetric } from '@/features/transporter-bi';
import { formatMetric, formatMoney } from '@/features/transporter-bi';

/**
 * Parallel to the shipper suite's `DeliveryVolumeCard`: a calm area chart for
 * earnings trajectory, with the two headline figures (total + per-trip) pinned
 * under it so the Overview opens the same way the shipper page does.
 */

export interface EarningsVolumeCardProps {
  earnings: KpiMetric;
  perTrip: KpiMetric;
  formatBucket: (key: string) => string;
  onOpenDetail?: (request: DetailRequest | undefined) => void;
}

export function EarningsVolumeCard({
  earnings,
  perTrip,
  formatBucket,
  onOpenDetail,
}: EarningsVolumeCardProps) {
  const data = earnings.trend.map((point) => point.v);
  const categories = earnings.trend.map((point) => point.t);

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
            label: 'Earnings',
            value: formatMoney(val),
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
          title="Earnings Volume"
          subtitle="Completed-trip revenue this period"
          icon={<Activity className="size-4" />}
        />

        <div className="-mx-1 h-32">
          <ApexChart
            type="area"
            series={[{ name: 'Earnings', data }]}
            options={options}
            height={128}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border-subtle bg-surface-sunken/40 px-6 py-4">
        <Figure
          value={formatMetric(earnings.value, earnings.unit)}
          caption="Total earnings this period"
          onClick={
            onOpenDetail && earnings.detail
              ? () => onOpenDetail(earnings.detail)
              : undefined
          }
        />
        <Figure
          value={formatMetric(perTrip.value, perTrip.unit)}
          caption="Average earnings per trip"
          onClick={
            onOpenDetail && perTrip.detail
              ? () => onOpenDetail(perTrip.detail)
              : undefined
          }
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
      className="flex flex-col gap-2 rounded-sm text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </button>
  );
}
