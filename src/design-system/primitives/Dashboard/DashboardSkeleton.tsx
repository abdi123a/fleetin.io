import type { CSSProperties, ReactNode } from 'react';

export type DashboardSkeletonProps = {
  className?: string;
  style?: CSSProperties;
  onDark?: boolean;
};

export function Skeleton({ className = '', style, onDark }: DashboardSkeletonProps) {
  return (
    <div
      className={`skeleton ${onDark ? 'skeleton-on-dark' : ''} ${className}`}
      style={style}
      aria-hidden
    />
  );
}

export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export function PanelSkeleton({
  className = '',
  lines = 4,
  chart,
}: {
  className?: string;
  lines?: number;
  chart?: boolean;
}) {
  return (
    <Loading label="Loading panel">
      <div className={`rounded-lg border border-border bg-card p-5 shadow-xs ${className}`}>
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-2 h-2.5 w-44" />

        {chart ? (
          <div className="mt-5 flex h-52 items-end gap-2.5">
            {[45, 70, 55, 85, 62, 95, 48, 78].map((h) => (
              <Skeleton key={`chart-bar-${h}`} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {Array.from({ length: lines }, (_, i) => `line-${i}`).map((lineId) => (
              <div key={lineId} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-full max-w-[70%]" />
                  <Skeleton className="h-2 w-20" />
                </div>
                <Skeleton className="h-2.5 w-12 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Loading>
  );
}

export function StatCardSkeleton() {
  return (
    <Loading label="Loading metric">
      <div className="h-[176px] rounded-lg border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
        </div>
        <Skeleton className="mt-3 h-6 w-28" />
        <Skeleton className="mt-3 h-3.5 w-32 rounded-full" />
      </div>
    </Loading>
  );
}
