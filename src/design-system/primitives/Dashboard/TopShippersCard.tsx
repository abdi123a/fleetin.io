import { topShippers } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

export function TopShippersCard({ ready = true }: { ready?: boolean }) {
  return (
    <section className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Top Shippers</h2>
        <span className="type-caption text-muted-foreground">by revenue, MTD</span>
      </div>

      <ul className="mt-3.5 space-y-3.5">
        {topShippers.map((shipper, i) => (
          <li key={shipper.name}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-surface-sunken type-caption font-bold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                {ready ? (
                  <span className="truncate type-body-sm font-medium text-foreground">
                    {shipper.name}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-32" />
                )}
              </div>
              {ready ? (
                <span className="shrink-0 type-body-sm tabular-nums font-semibold text-foreground">
                  {shipper.revenue}M
                </span>
              ) : (
                <Skeleton className="h-3 w-10 shrink-0" />
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-2.5 pl-7.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                {ready && (
                  <div
                    className="animate-grow-x h-full rounded-full bg-gradient-to-r from-primary to-primary-hover"
                    style={{
                      width: `${shipper.share}%`,
                      ['--d' as string]: `${150 + i * 80}ms`,
                    }}
                  />
                )}
              </div>
              <span className="shrink-0 type-caption tabular-nums text-muted-foreground">
                {shipper.bookings} bkgs
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
