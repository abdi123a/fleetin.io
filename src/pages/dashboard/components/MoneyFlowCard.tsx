import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';

import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, chartAnimSpeed } from '@/features/shipper-bi/charts/apexChartTheme';
import { compact, compactDjf, fmtDjf, pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  Legend,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK } from './charts';
import type { MovementModel } from '../model';

/**
 * Six months of what the platform billed, what it paid out, and what it kept.
 *
 * Columns for the two cash sides and a line for the commission on top — the
 * one place this console uses a combo chart, because the commission is not a
 * third quantity of the same kind, it is the distance between the other two.
 * Drawing it as a third column would invite the reader to add all three.
 *
 * Both columns sit on the same axis on purpose. A second axis would let the
 * commission line be scaled to look healthy in a month where it collapsed,
 * which is exactly the month an administrator needs to see.
 */
export function MoneyFlowCard({ movement, className }: { movement: MovementModel; className?: string }) {
  const categories = movement.months.map((month) => month.label);

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'line',
          stacked: false,
          animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
        },
        colors: [CHART_INK.teal, CHART_INK.grey, CHART_INK.orange],
        plotOptions: {
          bar: { columnWidth: '52%', borderRadius: 4, borderRadiusApplication: 'end' },
        },
        stroke: { width: [0, 0, 2.5], curve: 'smooth', lineCap: 'round' },
        markers: { size: 0, hover: { size: 5 } },
        legend: { show: false },
        grid: {
          borderColor: 'var(--border-subtle)',
          strokeDashArray: 4,
          padding: { left: 2, right: 8, top: 4, bottom: 0 },
        },
        xaxis: {
          categories,
          labels: {
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
            formatter: (value: number) => compact(value),
          },
        },
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }) => {
            const month = movement.months[dataPointIndex];
            if (!month) return '';
            const rate = month.revenueDjf > 0 ? month.commissionDjf / month.revenueDjf : null;
            return buildTooltipHtml(
              month.label,
              [
                { key: 'rev', label: 'Billed', value: fmtDjf(month.revenueDjf), color: CHART_INK.teal },
                { key: 'cost', label: 'Transport cost', value: fmtDjf(month.costDjf), color: CHART_INK.grey },
                { key: 'com', label: 'Commission', value: fmtDjf(month.commissionDjf), color: CHART_INK.orange },
              ],
              `${month.shipments} shipments${rate !== null ? ` · ${pct(rate, 1)} commission` : ''}`,
            );
          },
        },
      }),
    [categories, movement.months],
  );

  const series = useMemo(
    () => [
      { name: 'Billed', type: 'column', data: movement.months.map((month) => Math.round(month.revenueDjf)) },
      { name: 'Transport cost', type: 'column', data: movement.months.map((month) => Math.round(month.costDjf)) },
      { name: 'Commission', type: 'line', data: movement.months.map((month) => Math.round(month.commissionDjf)) },
    ],
    [movement.months],
  );

  const { thisMonth, lastMonth } = movement;
  const hasAnything = movement.months.some((month) => month.revenueDjf > 0 || month.costDjf > 0);

  return (
    <ConsolePanel
      className={className}
      title="Revenue &amp; Commission"
      subtitle="Billed, transport cost and commission by month"
      action={
        <div className="text-right">
          <p className="type-body-xs text-muted-foreground">This month</p>
          <p className="text-sm font-extrabold tabular-nums text-foreground">
            {compactDjf(thisMonth.commissionDjf)}
          </p>
        </div>
      }
      footer={
        <InsightNote tone={movement.revenueDelta !== null && movement.revenueDelta < 0 ? 'attention' : 'neutral'}>
          {!hasAnything ? (
            'No billing in the last six months.'
          ) : lastMonth && lastMonth.revenueDjf > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {compactDjf(thisMonth.revenueDjf)} billed this month
              </span>{' '}
              vs {compactDjf(lastMonth.revenueDjf)} last ·{' '}
              {movement.marginThisMonth !== null ? pct(movement.marginThisMonth, 1) : '—'} commission
              {movement.marginLastMonth !== null && movement.marginThisMonth !== null
                ? ` (${pct(movement.marginLastMonth, 1)} last month)`
                : ''}
              .
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">
                {compactDjf(thisMonth.revenueDjf)} billed this month
              </span>{' '}
              across {thisMonth.shipments} shipments.
            </>
          )}
        </InsightNote>
      }
    >
      <div className="min-h-0 flex-1">
        <ApexChart type="line" series={series} options={options} height={260} />
      </div>
      <Legend
        className="mt-2"
        items={[
          { label: 'Billed', color: CHART_INK.teal, shape: 'square' },
          { label: 'Transport cost', color: CHART_INK.grey, shape: 'square' },
          { label: 'Commission', color: CHART_INK.orange },
        ]}
      />
    </ConsolePanel>
  );
}
