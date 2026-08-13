import { fleetUtilization } from '@/data/dashboardData';
import { useCountUp } from '@/hooks/useCountUp';
import { Skeleton } from './DashboardSkeleton';

export function FleetUtilizationCard({ ready = true }: { ready?: boolean }) {
  const { total, segments, utilization, avgTripsPerTruck, avgIdleHours } = fleetUtilization;
  const animatedUtil = useCountUp(utilization, ready);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = (animatedUtil / 100) * circumference;

  return (
    <section className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Fleet Utilization</h2>
        <span className="type-caption tabular-nums text-muted-foreground">{total} trucks</span>
      </div>

      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          {ready ? (
            <>
              <svg className="h-full w-full -rotate-90" viewBox="0 0 110 110">
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="none"
                  stroke="var(--border, #e1e4e8)"
                  strokeWidth="11"
                />
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="none"
                  stroke="url(#gaugeFill)"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                />
                <defs>
                  <linearGradient id="gaugeFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--primary, #60969d)" />
                    <stop offset="100%" stopColor="var(--primary-hover, #52838a)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="type-h2 tabular-nums text-foreground">
                  {animatedUtil.toFixed(1)}
                  <span className="type-body-sm text-muted-foreground">%</span>
                </span>
                <span className="mt-0.5 type-caption text-muted-foreground">utilized</span>
              </div>
            </>
          ) : (
            <Skeleton className="h-28 w-28 rounded-full" />
          )}
        </div>

        <ul className="min-w-0 flex-1 space-y-2">
          {segments.map((seg, i) => (
            <li key={seg.label}>
              <div className="flex items-center justify-between gap-2 type-body-xs">
                <span className="flex min-w-0 items-center gap-2 text-foreground/80">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="truncate">{seg.label}</span>
                </span>
                {ready ? (
                  <span className="shrink-0 tabular-nums font-semibold text-foreground">
                    {seg.count}
                  </span>
                ) : (
                  <Skeleton className="h-2.5 w-6 shrink-0" />
                )}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                {ready && (
                  <div
                    className="animate-grow-x h-full rounded-full"
                    style={{
                      width: `${(seg.count / total) * 100}%`,
                      backgroundColor: seg.color,
                      ['--d' as string]: `${200 + i * 80}ms`,
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div>
          <div className="type-caption text-muted-foreground">Avg trips / truck</div>
          {ready ? (
            <div className="type-h4 tabular-nums text-foreground">
              {avgTripsPerTruck}
            </div>
          ) : (
            <Skeleton className="mt-1 h-4 w-10" />
          )}
        </div>
        <div>
          <div className="type-caption text-muted-foreground">Avg idle time</div>
          {ready ? (
            <div className="type-h4 tabular-nums text-foreground">
              {avgIdleHours}h
            </div>
          ) : (
            <Skeleton className="mt-1 h-4 w-10" />
          )}
        </div>
      </div>
    </section>
  );
}
