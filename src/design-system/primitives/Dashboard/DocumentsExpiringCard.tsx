import { expiringDocuments } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

const urgencyDot = {
  critical: 'bg-destructive',
  warning: 'bg-warning',
  notice: 'bg-muted-foreground',
};

const urgencyText = {
  critical: 'text-destructive font-semibold',
  warning: 'text-warning-subtle-foreground font-semibold',
  notice: 'text-muted-foreground',
};

export function DocumentsExpiringCard({ ready = true }: { ready?: boolean }) {
  return (
    <div className="h-full flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="type-h3 text-foreground">Documents Expiring Soon</h2>
        <span className="rounded-full bg-warning-subtle px-2 py-0.5 type-caption text-warning-subtle-foreground">
          14 total
        </span>
      </div>

      <ul className="mt-2 divide-y divide-border">
        {expiringDocuments.map((doc) => (
          <li key={doc.name} className="flex items-center gap-3 py-2.5 first:pt-2 last:pb-0">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${urgencyDot[doc.urgency]}`} />
            {ready ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate type-body-sm font-medium text-foreground">{doc.name}</div>
                  <div className="type-caption text-muted-foreground">{doc.entity}</div>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap type-body-xs tabular-nums ${urgencyText[doc.urgency]}`}
                >
                  {doc.expiresIn}
                </span>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-full max-w-[80%]" />
                  <Skeleton className="h-2 w-16" />
                </div>
                <Skeleton className="h-2.5 w-10 shrink-0" />
              </>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="mt-3 w-full rounded-md border border-border bg-card py-1.5 type-body-sm font-medium text-foreground transition-colors hover:bg-surface-sunken cursor-pointer"
      >
        View all expiring documents
      </button>
    </div>
  );
}
