import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { ConsolePanel, InsightNote, Legend } from './kit';
import type { HaulDay, HaulGroup } from './model';
import { CARGO_GROUP_COLOR, CARGO_GROUP_DETAIL, CARGO_GROUP_LABELS } from './model';
import { djfCard, pct } from './money';

/**
 * The mix, day by day, and what each part of it is actually worth.
 *
 * Stacked because the question is composition — how a day's work was made up —
 * not three independent trends. The three columns beneath are the point of the
 * panel: they put moves and revenue side by side, which is the only way the
 * "few moves, large share of the money" case ever becomes visible.
 */

export interface WhatYouHaulCardProps {
  days: HaulDay[];
  groups: HaulGroup[];
  totalMoves: number;
  totalRevenue: number;
  className?: string;
}

export function WhatYouHaulCard({
  days,
  groups,
  totalMoves,
  totalRevenue,
  className,
}: WhatYouHaulCardProps) {
  const colors = useMemo(
    () => [
      resolveColor(CARGO_GROUP_COLOR.container, '#2f6b72'),
      resolveColor(CARGO_GROUP_COLOR.bulk, '#8db4b9'),
      resolveColor(CARGO_GROUP_COLOR.special, '#f9ac17'),
    ],
    [],
  );

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'area',
          stacked: true,
          animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
        },
        colors,
        stroke: { curve: 'smooth', width: 2 },
        fill: {
          type: 'solid',
          opacity: [0.9, 0.85, 0.9],
        },
        markers: { size: 0, hover: { size: 4 } },
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
            return buildTooltipHtml(
              day.label,
              [
                { key: 'c', label: 'Container', value: String(day.container), color: colors[0] },
                { key: 'b', label: 'Bulk', value: String(day.bulk), color: colors[1] },
                { key: 's', label: 'Special', value: String(day.special), color: colors[2] },
              ],
              `${day.container + day.bulk + day.special} moves that day`,
            );
          },
        },
      }),
    [days, colors],
  );

  const series = useMemo(
    () => [
      { name: 'Container', data: days.map((day) => day.container) },
      { name: 'Bulk', data: days.map((day) => day.bulk) },
      { name: 'Special', data: days.map((day) => day.special) },
    ],
    [days],
  );

  /**
   * The group carrying meaningfully more of the money than of the work.
   *
   * Three points of gap is the floor: below that the sentence would be stating
   * that a group is 62% of the moves and 62% of the revenue, which is not an
   * insight, it is rounding.
   */
  const overIndexed = [...groups]
    .filter((group) => group.moves > 0 && group.revenueShare - group.moveShare >= 0.03)
    .sort((a, b) => b.revenueShare - b.moveShare - (a.revenueShare - a.moveShare))[0];

  return (
    <ConsolePanel
      className={className}
      title="What You Haul"
      subtitle={`Moves per day by cargo type · ${totalMoves} moves, ${djfCard(totalRevenue)}`}
      action={
        <Legend
          items={[
            { label: 'Container', color: CARGO_GROUP_COLOR.container, shape: 'square' },
            { label: 'Bulk', color: CARGO_GROUP_COLOR.bulk, shape: 'square' },
            { label: 'Special', color: CARGO_GROUP_COLOR.special, shape: 'square' },
          ]}
        />
      }
    >
      <div className="h-[200px] min-h-[170px] w-full">
        <ApexChart type="area" series={series} options={options} height="100%" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-3">
        {groups.map((group) => (
          <div key={group.group} className="min-w-0">
            <p className="type-body-xs inline-flex items-center gap-2 text-foreground">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: CARGO_GROUP_COLOR[group.group] }}
                aria-hidden
              />
              <span className="truncate">{CARGO_GROUP_DETAIL[group.group]}</span>
            </p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight tabular-nums text-foreground">
                {group.moves}
              </span>
              <span className="type-body-xs text-muted-foreground">moves</span>
            </p>
            <p className="type-body-xs mt-1 text-muted-foreground">
              {djfCard(group.revenue)} · {pct(group.revenueShare)} of revenue
            </p>
          </div>
        ))}
      </div>

      {overIndexed ? (
        <InsightNote className="mt-4">
          {CARGO_GROUP_LABELS[overIndexed.group]} cargo is{' '}
          <span className="font-bold text-foreground">
            {pct(overIndexed.moveShare)} of your moves but {pct(overIndexed.revenueShare)} of your
            revenue
          </span>{' '}
          — and you only ran {overIndexed.moves} of them.
        </InsightNote>
      ) : (
        <InsightNote className="mt-4">
          Revenue tracks volume across all three cargo types this period — no group is paying
          disproportionately for the work it takes.
        </InsightNote>
      )}
    </ConsolePanel>
  );
}

export default WhatYouHaulCard;
