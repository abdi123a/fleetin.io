import { Card } from '@/design-system';
import { IconChip } from '@/design-system';
import { LayoutDashboard, RefreshCw } from '@/design-system/icons';
import { StatusChip } from '@/pages/transporter-portal/components/dashboard/console/kit';
import { cn } from '@/utils';

/**
 * The console's masthead.
 *
 * It borrows the sibling consoles' surface and chip vocabulary but not their
 * structure — the shipper header opens on a client's own book over a chosen
 * period, and the transporter's on one carrier's week. This screen is the
 * whole platform at this instant, read by whoever is on duty, so what it needs
 * is the reader's name, the wall clock, and the two counts that decide which
 * tab to open first.
 */
export function AdminConsoleHeader({
  userName,
  userRole,
  now,
  loading,
  breaches,
  asks,
  onRefresh,
}: {
  userName: string;
  userRole: string;
  now: number;
  loading: boolean;
  breaches: number;
  asks: number;
  onRefresh: () => void;
}) {
  const date = new Date(now);
  const greeting = date.getHours() < 12 ? 'Good morning' : date.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Card variant="default" padding="none" className="overflow-visible shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-5 py-5">
        <div className="flex min-w-[16rem] flex-1 items-center gap-4">
          <IconChip icon={LayoutDashboard} tint="teal" />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-muted-foreground">
              {greeting}
            </p>
            <h1 className="type-h2 mt-0.5 truncate text-foreground">{userName}</h1>
            <p className="type-body-xs mt-1 text-muted-foreground">
              Signed in as {userRole} ·{' '}
              {date.toLocaleString('en-GB', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {breaches > 0 ? (
            <StatusChip tone="critical" pulse>
              {breaches} already breached
            </StatusChip>
          ) : (
            <StatusChip tone="calm">Nothing breached</StatusChip>
          )}
          {asks > 0 ? (
            <StatusChip tone="attention">{asks} waiting on a decision</StatusChip>
          ) : (
            <StatusChip tone="quiet">Nothing pending</StatusChip>
          )}

          <button
            type="button"
            onClick={onRefresh}
            className="type-body-xs inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw aria-hidden className={cn('size-3.5', loading && 'animate-spin')} />
            {loading ? 'Reading' : 'Refresh'}
          </button>
        </div>
      </div>
    </Card>
  );
}
