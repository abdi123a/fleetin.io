import type { ApexOptions } from 'apexcharts';
import { expenseBreakdown } from '@/data/dashboardData';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { donutOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { Skeleton } from './DashboardSkeleton';

export function ExpenseDonutCard({ ready = true }: { ready?: boolean }) {
  const options: ApexOptions = donutOptions(
    expenseBreakdown.map((e) => e.color),
    {
      labels: expenseBreakdown.map((e) => e.category),
      plotOptions: {
        pie: {
          donut: { size: '60%' },
          expandOnClick: false,
        },
      },
      stroke: {
        show: true,
        width: 2,
        colors: ['var(--card, #ffffff)'],
      },
      chart: {
        animations: { enabled: ready, speed: 1000 },
      },
      tooltip: {
        y: { formatter: (val: number) => `${val}%` },
      },
    },
  );

  return (
    <div className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Expense Breakdown</h2>
        <span className="type-caption text-muted-foreground">this month</span>
      </div>

      <div className="relative mt-2 h-48">
        {ready ? (
          <>
            <ApexChart
              type="donut"
              series={expenseBreakdown.map((e) => e.value)}
              options={options}
              height="100%"
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="type-h2 tabular-nums text-foreground">4.9M</span>
              <span className="type-caption text-muted-foreground">DJF total</span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="h-[156px] w-[156px] rounded-full" />
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-2 border-t border-border pt-3">
        {expenseBreakdown.map((item) => (
          <li key={item.category} className="flex items-center justify-between gap-2 type-body-sm">
            <span className="flex min-w-0 items-center gap-2 text-foreground/80">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.category}</span>
            </span>
            {ready ? (
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="type-caption tabular-nums text-muted-foreground">{item.amount}</span>
                <span className="tabular-nums font-semibold text-foreground">{item.value}%</span>
              </span>
            ) : (
              <Skeleton className="h-2.5 w-14 shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
