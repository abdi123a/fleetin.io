import { AlertTriangle } from 'lucide-react';
import { receivablesAging } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

const toneBar = {
  ok: 'bg-primary',
  warn: 'bg-warning',
  bad: 'bg-warning-active',
};

const toneText = {
  ok: 'text-foreground',
  warn: 'text-warning-subtle-foreground',
  bad: 'text-warning-subtle-foreground font-bold',
};

export function ReceivablesAgingCard({ ready = true }: { ready?: boolean }) {
  const total = receivablesAging.reduce((sum, b) => sum + b.amount, 0);
  const overdue = receivablesAging
    .filter((b) => b.tone !== 'ok')
    .reduce((sum, b) => sum + b.amount, 0);

  return (
    <section className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Receivables Aging</h2>
        <span className="type-caption text-muted-foreground">DJF millions</span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        {ready ? (
          <>
            <span className="type-display tabular-nums text-foreground">
              {total.toFixed(1)}M
            </span>
            <span className="type-body-xs text-muted-foreground">outstanding</span>
          </>
        ) : (
          <Skeleton className="h-6 w-28" />
        )}
      </div>

      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
        {receivablesAging.map((bucket, i) =>
          ready ? (
            <div
              key={bucket.bucket}
              className={`animate-grow-x h-full ${toneBar[bucket.tone]} ${
                i === 0 ? 'rounded-l-full' : ''
              } ${i === receivablesAging.length - 1 ? 'rounded-r-full' : ''}`}
              style={{
                width: `${(bucket.amount / total) * 100}%`,
                ['--d' as string]: `${i * 90}ms`,
              }}
            />
          ) : (
            <Skeleton
              key={bucket.bucket}
              className="h-full"
              style={{ width: `${(bucket.amount / total) * 100}%` }}
            />
          ),
        )}
      </div>

      <ul className="mt-4 space-y-2.5">
        {receivablesAging.map((bucket) => (
          <li key={bucket.bucket} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 type-body-sm text-foreground/80">
              <span className={`h-2 w-2 shrink-0 rounded-full ${toneBar[bucket.tone]}`} />
              {bucket.bucket}
            </span>
            {ready ? (
              <span className="flex items-baseline gap-2">
                <span className="type-caption tabular-nums text-muted-foreground">
                  {bucket.count} inv.
                </span>
                <span className={`type-body-sm tabular-nums font-semibold ${toneText[bucket.tone]}`}>
                  {bucket.amount.toFixed(1)}M
                </span>
              </span>
            ) : (
              <Skeleton className="h-3 w-16" />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-start gap-2 rounded-md bg-warning-subtle p-2.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-active" strokeWidth={2.25} />
        <p className="type-caption leading-snug text-warning-subtle-foreground">
          <span className="font-semibold tabular-nums">{overdue.toFixed(1)}M DJF</span> past 60
          days across 40 invoices — escalate to collections.
        </p>
      </div>
    </section>
  );
}
