import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';

export interface ShipmentAnalyticsCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
}

interface AnalyticsDataPoint {
  timeLabel: string;
  dayNumber: string;
  shipments: number;
  delayed: number;
}

function generateRealDaysData(fromStr?: string, toStr?: string): AnalyticsDataPoint[] {
  const end = toStr ? new Date(toStr.slice(0, 10) + 'T00:00:00') : new Date('2026-08-05T00:00:00');
  const start = fromStr
    ? new Date(fromStr.slice(0, 10) + 'T00:00:00')
    : new Date(end.getTime() - 6 * 86400000);

  const points: AnalyticsDataPoint[] = [];
  const current = new Date(start);
  let dayIndex = 0;

  const maxDays = 120;
  while (current <= end && points.length < maxDays) {
    const month = current.toLocaleString('en-US', { month: 'short' });
    const dayNum = current.getDate();
    const dayOfWeek = current.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const baseShipments = isWeekend
      ? Math.floor(90 + ((dayIndex * 17) % 55))
      : Math.floor(230 + ((dayIndex * 29 + dayNum * 11) % 150));
    const delayed = Math.floor(baseShipments * (isWeekend ? 0.06 : 0.12 + ((dayIndex % 4) * 0.02)));

    points.push({
      timeLabel: `${month} ${dayNum}`,
      dayNumber: `${dayNum}`,
      shipments: baseShipments,
      delayed,
    });

    current.setDate(current.getDate() + 1);
    dayIndex++;
  }

  return points.length > 0
    ? points
    : [
        { timeLabel: 'Aug 1', dayNumber: '1', shipments: 210, delayed: 28 },
        { timeLabel: 'Aug 2', dayNumber: '2', shipments: 240, delayed: 32 },
        { timeLabel: 'Aug 3', dayNumber: '3', shipments: 280, delayed: 39 },
        { timeLabel: 'Aug 4', dayNumber: '4', shipments: 295, delayed: 41 },
        { timeLabel: 'Aug 5', dayNumber: '5', shipments: 320, delayed: 45 },
      ];
}

export function ShipmentAnalyticsCard({
  from,
  to,
  className = '',
}: ShipmentAnalyticsCardProps) {
  const chartData = useMemo(() => generateRealDaysData(from, to), [from, to]);

  const totalShipments = useMemo(
    () => chartData.reduce((acc, curr) => acc + curr.shipments, 0),
    [chartData],
  );

  const count = chartData.length;
  const primary = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const accent = useMemo(() => resolveColor('var(--accent)', '#f9ac17'), []);

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'bar',
          selection: { enabled: false },
          animations: {
            enabled: chartAnimSpeed() > 0,
            speed: chartAnimSpeed(750),
            animateGradually: { enabled: true, delay: 40 },
          },
        },
        colors: [primary, accent],
        plotOptions: {
          bar: {
            borderRadius: 4,
            borderRadiusApplication: 'end',
            borderRadiusWhenStacked: 'last',
            columnWidth: count > 20 ? '68%' : count > 14 ? '58%' : '48%',
            dataLabels: { position: 'top' },
          },
        },
        fill: { opacity: 1, type: 'solid' },
        grid: {
          borderColor: 'var(--border)',
          strokeDashArray: 4,
          xaxis: { lines: { show: false } },
          yaxis: { lines: { show: true } },
          padding: { left: 4, right: 8, top: 16, bottom: 0 },
        },
        xaxis: {
          categories: chartData.map((d) => d.timeLabel),
          tickAmount: count > 20 ? 14 : undefined,
          labels: {
            rotate: 0,
            hideOverlappingLabels: true,
            style: {
              fontSize: count > 20 ? '10px' : '11px',
              fontWeight: 700,
              colors: 'var(--muted-foreground)',
            },
          },
          crosshairs: {
            show: true,
            width: 'tickWidth',
            position: 'back',
            opacity: 1,
            fill: {
              type: 'solid',
              color: 'var(--surface-sunken)',
            },
            stroke: { width: 0 },
          },
        },
        yaxis: {
          min: 0,
          forceNiceScale: true,
          labels: {
            style: {
              fontSize: '11px',
              fontWeight: 600,
              colors: 'var(--muted-foreground)',
            },
            formatter: (val: number) => String(Math.round(val)),
          },
        },
        legend: { show: false },
        states: quietStates,
        tooltip: {
          shared: true,
          intersect: false,
          followCursor: false,
          custom: ({ dataPointIndex }) => {
            const point = chartData[dataPointIndex];
            if (!point) return '';
            return buildTooltipHtml(point.timeLabel, [
              {
                key: 'shipments',
                label: 'Total Shipments',
                value: point.shipments.toLocaleString(),
                color: primary,
              },
              {
                key: 'delayed',
                label: 'Delayed',
                value: point.delayed.toLocaleString(),
                color: accent,
              },
            ]);
          },
        },
      }),
    [accent, chartData, count, primary],
  );

  return (
    <Card variant="default" padding="lg" className={`flex flex-col justify-between ${className}`}>
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
            Shipment Analytics
          </h2>
          <p className="mt-1 text-xs font-semibold text-muted-foreground md:text-sm">
            Total number of shipments:{' '}
            <span className="font-extrabold text-foreground">
              {totalShipments.toLocaleString()}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs font-bold text-foreground">
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: primary }}
            />
            <span>Total Shipments</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span>Delayed</span>
          </div>
        </div>
      </div>

      <div className="mt-4 h-[320px] min-h-[320px] w-full shrink-0 sm:h-[360px]">
        <ApexChart
          type="bar"
          series={[
            { name: 'Total Shipments', data: chartData.map((d) => d.shipments) },
            { name: 'Delayed', data: chartData.map((d) => d.delayed) },
          ]}
          options={options}
          height="100%"
        />
      </div>
    </Card>
  );
}

export default ShipmentAnalyticsCard;
