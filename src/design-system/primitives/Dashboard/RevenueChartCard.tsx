import type { ApexOptions } from 'apexcharts';
import { revenueTrend } from '@/data/dashboardData';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { Skeleton } from './DashboardSkeleton';

const summary = [
  { label: 'Gross revenue', value: '922.1M', note: '6-mo total' },
  { label: 'Net margin', value: '31.4%', note: '+2.1 pts' },
  { label: 'Avg / booking', value: '5.9M', note: 'DJF' },
];

export function RevenueChartCard({ ready = true }: { ready?: boolean }) {
  const options: ApexOptions = baseChartOptions({
    chart: { type: 'area' },
    colors: ['var(--primary, #60969d)', 'var(--foreground, #14171c)', 'var(--accent, #f9ac17)'],
    stroke: { curve: 'smooth', width: [2.25, 2, 2.25] },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.28,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    xaxis: {
      categories: revenueTrend.map((d) => d.month),
      axisBorder: { show: true, color: 'var(--border, #e1e4e8)' },
    },
    yaxis: {
      labels: { formatter: (val: number) => `${val}M` },
    },
    grid: {
      borderColor: 'var(--border, #e1e4e8)',
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    markers: { size: 3, hover: { size: 5 } },
    legend: { show: false },
      tooltip: {
        theme: undefined,
        y: {
          formatter: (val: number) => `${val.toFixed(1)}M DJF`,
          title: {
            formatter: (seriesName: string) => {
              if (seriesName === 'revenue') return 'Revenue';
              if (seriesName === 'expenses') return 'Expenses';
              return 'Commission';
            },
          },
        },
      },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3 text-foreground">Revenue &amp; Cost Trend</h2>
          <p className="mt-0.5 type-body-xs text-muted-foreground">Last 6 months, in millions DJF</p>
        </div>
        <div className="flex items-center gap-3 type-caption text-muted-foreground sm:gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-foreground" />
            Expenses
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Commission
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 rounded-md border border-border bg-surface-sunken p-3">
        {summary.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="truncate type-caption text-muted-foreground">{item.label}</div>
            {ready ? (
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="type-h4 tabular-nums text-foreground">{item.value}</span>
                <span className="truncate type-caption text-muted-foreground">{item.note}</span>
              </div>
            ) : (
              <Skeleton className="mt-1.5 h-4 w-20" />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 h-60 sm:h-64">
        {ready ? (
          <ApexChart
            type="area"
            series={[
              { name: 'revenue', data: revenueTrend.map((d) => d.revenue) },
              { name: 'expenses', data: revenueTrend.map((d) => d.expenses) },
              { name: 'commission', data: revenueTrend.map((d) => d.commission) },
            ]}
            options={options}
            height="100%"
          />
        ) : (
          <div className="flex h-full items-end gap-2.5">
            {[52, 64, 58, 76, 84, 95].map((h) => (
              <Skeleton key={`rev-skel-${h}`} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
