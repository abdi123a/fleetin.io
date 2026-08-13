import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { BarChart3 } from '@/design-system/icons';
import { Card, IconChip } from '@/design-system';
import { cn } from '@/utils';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, buildTooltipHtml } from '@/features/shipper-bi/charts/apexChartTheme';

export type VolumeGranularity = 'Daily' | 'Weekly' | 'Monthly';

const GRANULARITIES: VolumeGranularity[] = ['Daily', 'Weekly', 'Monthly'];

const SERIES = {
  promised: 'var(--primary)',
  delivered: 'color-mix(in srgb, var(--primary) 26%, var(--surface))',
} as const;

export interface ShipmentVolumeCardProps {
  rows: ShipperShipmentRow[];
  from: string;
  to: string;
}

interface Bucket {
  key: string;
  label: string;
  promised: number;
  delivered: number;
}

export function ShipmentVolumeCard({ rows, from, to }: ShipmentVolumeCardProps) {
  const [granularity, setGranularity] = useState<VolumeGranularity>('Daily');

  const buckets = useMemo(
    () => bucketRows(rows, from, to, granularity),
    [rows, from, to, granularity],
  );

  const promisedTotal = buckets.reduce((total, bucket) => total + bucket.promised, 0);
  const deliveredTotal = buckets.reduce((total, bucket) => total + bucket.delivered, 0);

  const options: ApexOptions = baseChartOptions({
    chart: { type: 'bar' },
    colors: [SERIES.promised, SERIES.delivered],
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: '42%',
      },
    },
    xaxis: { categories: buckets.map((b) => b.label) },
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const bucket = buckets[dataPointIndex];
        if (!bucket) return '';
        return buildTooltipHtml(bucket.label, [
          { key: 'promised', label: 'Promised', value: String(bucket.promised), color: SERIES.promised },
          { key: 'delivered', label: 'Delivered', value: String(bucket.delivered), color: SERIES.delivered },
        ]);
      },
    },
  });

  return (
    <Card variant="default" padding="lg" className="h-full gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={BarChart3} size={36} />
          <div>
            <h2 className="text-[15px] font-semibold leading-tight text-foreground">
              Delivery Statistics
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {promisedTotal} promised · {deliveredTotal} completed in this period
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: SERIES.promised }} />
              Promised
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full border border-border"
                style={{ backgroundColor: SERIES.delivered }}
              />
              Delivered
            </span>
          </div>

          <div
            role="group"
            aria-label="Chart granularity"
            className="flex overflow-hidden rounded-md border border-border text-xs"
          >
            {GRANULARITIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={granularity === option}
                onClick={() => setGranularity(option)}
                className={cn(
                  'px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  granularity === option
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'text-muted-foreground hover:bg-surface-sunken',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="flex min-h-56 flex-1 items-center justify-center text-xs text-muted-foreground">
          No deliveries promised in this period.
        </div>
      ) : (
        <div className="min-h-56 flex-1">
          <ApexChart
            type="bar"
            series={[
              { name: 'Promised', data: buckets.map((b) => b.promised) },
              { name: 'Delivered', data: buckets.map((b) => b.delivered) },
            ]}
            options={options}
            height="100%"
          />
        </div>
      )}
    </Card>
  );
}

function bucketRows(
  rows: ShipperShipmentRow[],
  from: string,
  to: string,
  granularity: VolumeGranularity,
): Bucket[] {
  const start = new Date(from);
  const end = new Date(to);
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const date = new Date(row.plannedDeliveryAt);
    if (Number.isNaN(date.getTime())) continue;
    if (date < start || date > end) continue;

    const { key, label } = bucketOf(date, granularity);
    const bucket = buckets.get(key) ?? { key, label, promised: 0, delivered: 0 };
    bucket.promised += 1;
    if (row.status === 'delivered' || row.status === 'closed') bucket.delivered += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-14);
}

function bucketOf(date: Date, granularity: VolumeGranularity): { key: string; label: string } {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const monthLabel = date.toLocaleString('en-US', { month: 'short' });

  if (granularity === 'Daily') {
    return { key: `${year}-${month}-${day}`, label: `${date.getDate()}` };
  }

  if (granularity === 'Weekly') {
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const mondayMonth = `${monday.getMonth() + 1}`.padStart(2, '0');
    const mondayDay = `${monday.getDate()}`.padStart(2, '0');
    return {
      key: `${monday.getFullYear()}-${mondayMonth}-${mondayDay}`,
      label: `${monday.getDate()} ${monday.toLocaleString('en-US', { month: 'short' })}`,
    };
  }

  return { key: `${year}-${month}`, label: monthLabel };
}
