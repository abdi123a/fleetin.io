import { ArrowRight, Download, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { recentBookings } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

type Booking = (typeof recentBookings)[number];

/** Stable ids for the loading placeholder grid — position is the only identity it has. */
const SKELETON_ROW_IDS = Array.from({ length: 6 }, (_, i) => `skel-row-${i}`);
const SKELETON_COL_IDS = Array.from({ length: 8 }, (_, i) => `skel-col-${i}`);

const statusTone: Record<string, string> = {
  'In Transit': 'bg-primary-subtle text-primary-subtle-foreground border-primary/20',
  'At Port': 'bg-muted text-muted-foreground border-border',
  Unloaded: 'bg-muted text-muted-foreground border-border',
  'Pending Return': 'bg-warning-subtle text-warning-subtle-foreground border-warning/30',
  Paid: 'bg-success-subtle text-success-subtle-foreground border-success/30',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        statusTone[status] ?? 'bg-muted text-muted-foreground border-border'
      }`}
    >
      {status}
    </span>
  );
}

export function BookingsTableCard({ ready = true }: { ready?: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <h2 className="type-h3 text-foreground">Recent Bookings</h2>
          <p className="mt-0.5 type-body-xs text-muted-foreground">
            Latest 6 of 1,284 · updated continuously
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 type-body-sm font-medium text-foreground transition-colors hover:bg-surface-sunken cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Filter</span>
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 type-body-sm font-medium text-foreground transition-colors hover:bg-surface-sunken cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {ready ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left type-body-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken/50 type-label text-muted-foreground">
                <th className="px-4 py-3 sm:px-5">Booking</th>
                <th className="px-4 py-3">Shipper</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Container</th>
                <th className="px-4 py-3">Truck / Driver</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">ETA</th>
                <th className="w-10 px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentBookings.map((b: Booking) => {
                const [from, to] = b.route.split(' → ');
                return (
                  <tr
                    key={b.id}
                    className="group transition-colors hover:bg-surface-sunken/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 type-mono font-semibold text-primary sm:px-5">
                      {b.id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                      {b.shipper}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-1.5 type-body-sm text-foreground/80">
                        {from}
                        {to && (
                          <>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                            {to}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 type-mono text-muted-foreground">
                      {b.container}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="type-body-sm font-medium text-foreground">{b.truck}</div>
                      <div className="type-caption text-muted-foreground">{b.driver}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 type-mono font-semibold text-foreground">
                      {b.value}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`type-body-sm ${
                          b.eta.startsWith('Overdue') ? 'font-semibold text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {b.eta}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-surface-sunken hover:text-foreground group-hover:opacity-100 cursor-pointer"
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {SKELETON_ROW_IDS.map((rowId) => (
            <div key={rowId} className="flex gap-4 border-b border-border py-3 last:border-0">
              {SKELETON_COL_IDS.map((colId) => (
                <Skeleton key={`${rowId}-${colId}`} className="h-3 flex-1" />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 sm:px-5">
        <span className="type-body-xs text-muted-foreground">Showing 6 of 1,284 bookings</span>
        <button
          type="button"
          className="type-body-sm font-medium text-primary transition-colors hover:text-primary-hover cursor-pointer"
        >
          View all bookings →
        </button>
      </div>
    </section>
  );
}
