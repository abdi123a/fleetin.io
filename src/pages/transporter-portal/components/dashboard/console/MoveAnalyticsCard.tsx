import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { ConsolePanel, Legend } from './kit';
import type { MoveDay } from './model';

/**
 * Moves finished each day, and how many of them ran late.
 *
 * Two columns side by side rather than one stacked bar: stacking would put the
 * delayed count inside the completed count and make a bad day look like a busy
 * one. Apart, the amber column is a separate silhouette the eye finds without
 * reading a single number, and the line under the chart names the worst day
 * and what caused it, so the panel answers rather than displays.
 */

export interface MoveAnalyticsCardProps {
  days: MoveDay[];
  totalMoves: number;
  weakestDay?: { label: string; delayed: number; cause: string };
  className?: string;
}

export function MoveAnalyticsCard({
  days,
  totalMoves,
  weakestDay,
  className,
}: MoveAnalyticsCardProps) {
  const completedColor = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const delayedColor = useMemo(() => resolveColor('var(--accent-bold)', '#f9ac17'), []);

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'bar',
          stacked: false,
          animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
        },
        colors: [completedColor, delayedColor],
        plotOptions: {
          bar: {
            columnWidth: days.length > 10 ? '78%' : '58%',
            borderRadius: 4,
            borderRadiusApplication: 'end',
          },
        },
        legend: { show: false },
        grid: {
          borderColor: 'var(--border)',
          strokeDashArray: 4,
          padding: { left: 4, right: 8, top: 4, bottom: 0 },
        },
        xaxis: {
          categories: days.map((day) => day.label),
          labels: {
            hideOverlappingLabels: true,
            rotate: 0,
            style: { fontSize: '10.5px', fontWeight: 600, colors: 'var(--muted-foreground)' },
          },
        },
        yaxis: {
          min: 0,
          forceNiceScale: true,
          labels: {
            style: {
              colors: 'var(--muted-foreground)',
              fontSize: '10.5px',
              fontWeight: 600,
              fontFamily: 'inherit',
            },
            formatter: (value: number) => String(Math.round(value)),
          },
        },
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }) => {
            const day = days[dataPointIndex];
            if (!day) return '';
            return buildTooltipHtml(day.label, [
              {
                key: 'completed',
                label: 'Completed',
                value: String(day.completed),
                color: completedColor,
              },
              { key: 'delayed', label: 'Delayed', value: String(day.delayed), color: delayedColor },
            ]);
          },
        },
      }),
    [days, completedColor, delayedColor],
  );

  const series = useMemo(
    () => [
      { name: 'Completed', data: days.map((day) => day.completed) },
      { name: 'Delayed', data: days.map((day) => day.delayed) },
    ],
    [days],
  );

  return (
    <ConsolePanel
      className={className}
      title="Booking Analytics"
      subtitle={
        <>
          Moves completed: <span className="font-bold text-foreground">{totalMoves}</span> ·
          container, bulk and special
        </>
      }
      action={
        <Legend
          items={[
            { label: 'Completed', color: 'var(--primary)' },
            { label: 'Delayed', color: 'var(--accent-bold)' },
          ]}
        />
      }
      footer={
        weakestDay ? (
          <p className="type-body-xs text-muted-foreground">
            <span className="font-bold text-foreground">{weakestDay.label}</span> was the weak day —{' '}
            {weakestDay.delayed} delayed {weakestDay.delayed === 1 ? 'move' : 'moves'}, mostly{' '}
            {weakestDay.cause}.
          </p>
        ) : (
          <p className="type-body-xs text-muted-foreground">
            No delayed moves in this window — every day cleared its slots.
          </p>
        )
      }
    >
      <div className="h-[240px] min-h-[200px] w-full flex-1">
        <ApexChart type="bar" series={series} options={options} height="100%" />
      </div>
    </ConsolePanel>
  );
}

export default MoveAnalyticsCard;
