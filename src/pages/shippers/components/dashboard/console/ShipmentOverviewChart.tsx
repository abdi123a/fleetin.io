import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  MARK,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { cn, formatDate } from '@/utils';
import { PanelHeader, PANEL_SURFACE } from './PanelHeader';

export interface ShipmentOverviewChartProps {
  rows: ShipperShipmentRow[];
  from: string;
  to: string;
  rangeLabel: string;
}

export function ShipmentOverviewChart({
  rows,
  from,
  to,
  rangeLabel,
}: ShipmentOverviewChartProps) {
  const buckets = useMemo(() => buildDailyBuckets(rows, from, to), [rows, from, to]);

  const peak = buckets.reduce((max, day) => Math.max(max, day.value, day.trucks), 0);
  const ceiling = Math.max(4, Math.ceil(peak / 4) * 4);
  const primary = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const primaryBold = useMemo(() => resolveColor('var(--primary-bold)', '#4a7579'), []);

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'line',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors: [primary, primaryBold],
    stroke: {
      curve: 'smooth',
      width: [MARK.lineWidth, 2],
      dashArray: [0, 5],
    },
    fill: {
      type: ['gradient', 'solid'],
      opacity: [1, 0],
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.26,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    xaxis: {
      categories: buckets.map((b) => b.label),
      tickAmount: Math.min(6, Math.max(1, buckets.length - 1)),
      labels: {
        hideOverlappingLabels: true,
        rotate: 0,
      },
    },
    yaxis: {
      min: 0,
      max: ceiling,
      tickAmount: 5,
      labels: { formatter: (val: number) => String(Math.round(val)) },
    },
    legend: { show: false },
    markers: {
      size: 0,
      hover: { size: MARK.activeDotRadius },
      strokeWidth: MARK.surfaceGap,
      strokeColors: 'var(--surface)',
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const point = buckets[dataPointIndex];
        if (!point) return '';
        return buildTooltipHtml(
          point.fullLabel,
          [
            { key: 'shipments', label: 'Shipments', value: String(point.value), color: primary },
            { key: 'trucks', label: 'Vehicles', value: String(point.trucks), color: primaryBold },
          ],
          point.trucks > 0 ? `${(point.value / point.trucks).toFixed(1)} shipments per vehicle` : undefined,
        );
      },
    },
  });

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-6', PANEL_SURFACE)}>
      <PanelHeader
        title="Shipment Overview"
        action={
          <div className="flex shrink-0 items-center gap-4">
            <Legend color={primary} label="Shipments" />
            <Legend color={primaryBold} label="Vehicles" dashed />
            <span className="type-body-xs hidden font-medium text-muted-foreground sm:inline">
              {rangeLabel}
            </span>
          </div>
        }
      />

      <div className="min-h-[248px] w-full flex-1">
        <ApexChart
          type="line"
          series={[
            { name: 'Shipments', type: 'area', data: buckets.map((b) => b.value) },
            { name: 'Vehicles', type: 'line', data: buckets.map((b) => b.trucks) },
          ]}
          options={options}
          height="100%"
        />
      </div>
    </Card>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="type-body-xs inline-flex items-center gap-1.5 text-muted-foreground">
      <svg width={14} height={4} viewBox="0 0 14 4" className="shrink-0" aria-hidden>
        <line
          x1={0}
          y1={2}
          x2={14}
          y2={2}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

interface DayBucket {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
  trucks: number;
}

function buildDailyBuckets(rows: ShipperShipmentRow[], from: string, to: string): DayBucket[] {
  const days = new Map<string, DayBucket>();
  const fleetByDay = new Map<string, Set<string>>();

  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    days.set(key, {
      key,
      label: cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      fullLabel: formatDate(key, 'date'),
      value: 0,
      trucks: 0,
    });
    fleetByDay.set(key, new Set());
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const row of rows) {
    const key = row.plannedDeliveryAt.slice(0, 10);
    const bucket = days.get(key);
    if (!bucket) continue;
    bucket.value += 1;
    if (row.vehicleId) fleetByDay.get(key)?.add(row.vehicleId);
  }

  for (const [key, fleet] of fleetByDay) {
    const bucket = days.get(key);
    if (bucket) bucket.trucks = fleet.size;
  }

  return [...days.values()];
}
