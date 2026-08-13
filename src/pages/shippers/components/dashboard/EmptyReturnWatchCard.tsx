import { Link } from 'react-router-dom';
import { ArrowRight, Container } from '@/design-system/icons';
import { Badge, Card, IconChip } from '@/design-system';
import { ROUTES } from '@/config/routes';
import type { CategorySlice, ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';

/**
 * The containers still out, ordered by how close they are to costing money.
 *
 * This slot used to carry a live tracking map. A map answers "where is it",
 * which is interesting; free time answers "what is about to be charged to me",
 * which is the thing a shipper can still act on today. Demurrage and detention
 * accrue after the cargo has landed, so they are invisible on every other card
 * on this page — the shipment reads as finished while the box keeps billing.
 *
 * Three bands, because the count alone says how many and not how urgent: past
 * free time is money leaving now, due within 48 hours is still saveable, and the
 * rest is only context.
 */

/** How many containers earn a line before the list becomes a report. */
const WATCHLIST_SIZE = 4;

export interface EmptyReturnWatchCardProps {
  /** Overdue / due soon / comfortable, as the overview section buckets them. */
  returnHeadroom: CategorySlice[];
  rows: ShipperShipmentRow[];
  /** Chargeable days already accrued across containers past free time. */
  overdueDays: number;
}

export function EmptyReturnWatchCard({
  returnHeadroom,
  rows,
  overdueDays,
}: EmptyReturnWatchCardProps) {
  const bandOf = (key: string) => returnHeadroom.find((slice) => slice.key === key)?.value ?? 0;
  const overdue = bandOf('overdue');
  const dueSoon = bandOf('due_soon');
  const comfortable = bandOf('comfortable');
  const total = overdue + dueSoon + comfortable;

  const watchlist = rows
    .filter(
      (row) =>
        row.containerNo !== undefined &&
        row.returnedAt === undefined &&
        row.freeTimeHoursRemaining !== undefined,
    )
    .sort((a, b) => (a.freeTimeHoursRemaining ?? 0) - (b.freeTimeHoursRemaining ?? 0))
    .slice(0, WATCHLIST_SIZE);

  return (
    <Card variant="default" padding="lg" className="h-full gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <IconChip icon={Container} size={36} />
        <div className="min-w-0 flex-1 basis-32">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Empty Return Watch
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Containers still out on your account
          </p>
        </div>
        <Link
          to={ROUTES.emptyReturns}
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        >
          Manage
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div>
        <p className="text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
          {total}
        </p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {overdue > 0 ? (
            <>
              containers out ·{' '}
              <span className="font-semibold text-destructive">
                {overdueDays} chargeable {overdueDays === 1 ? 'day' : 'days'} accrued
              </span>
            </>
          ) : (
            'containers out · none past free time'
          )}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Band label="Past free time" value={overdue} tone="critical" />
        <Band label="Due in 48h" value={dueSoon} tone="warning" />
        <Band label="In free time" value={comfortable} tone="good" />
      </div>

      <div className="space-y-1.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {overdue > 0 ? (
            <span className="bg-destructive" style={{ width: `${(overdue / total) * 100}%` }} />
          ) : null}
          {dueSoon > 0 ? (
            <span className="bg-warning" style={{ width: `${(dueSoon / total) * 100}%` }} />
          ) : null}
          {comfortable > 0 ? (
            <span className="bg-success" style={{ width: `${(comfortable / total) * 100}%` }} />
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {total === 0
            ? 'Nothing outstanding.'
            : `${Math.round(((dueSoon + comfortable) / total) * 100)}% still inside free time.`}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border-subtle pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Return these first
        </p>

        {watchlist.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No containers are waiting on an empty return.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {watchlist.map((row) => (
              <li
                key={row.shipmentId}
                className="flex items-center justify-between gap-2 rounded-card-nested border border-border-subtle px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-foreground">
                    {row.containerNo}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {row.destination}
                  </span>
                </span>
                <Badge
                  intent={headroomIntent(row.freeTimeHoursRemaining ?? 0)}
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                >
                  {headroomLabel(row.freeTimeHoursRemaining ?? 0)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Band({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'warning' | 'good';
}) {
  return (
    <div
      className={cn(
        'rounded-card-nested border px-2.5 py-2',
        tone === 'critical' && 'border-destructive/25 bg-destructive-subtle/50',
        tone === 'warning' && 'border-warning/25 bg-warning-subtle/50',
        tone === 'good' && 'border-success/25 bg-success-subtle/50',
      )}
    >
      <p
        className={cn(
          'text-lg font-semibold leading-none tabular-nums',
          tone === 'critical' && 'text-destructive',
          tone === 'warning' && 'text-warning-subtle-foreground',
          tone === 'good' && 'text-success-subtle-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

/** Past free time is red, inside two days amber, anything further out is calm. */
function headroomIntent(hours: number): 'destructive' | 'warning' | 'info' {
  if (hours <= 0) return 'destructive';
  if (hours <= 48) return 'warning';
  return 'info';
}

function headroomLabel(hours: number): string {
  if (hours <= 0) {
    const over = Math.abs(hours);
    return over >= 24 ? `${Math.round(over / 24)}d over` : `${Math.round(over)}h over`;
  }
  return hours >= 48 ? `${Math.round(hours / 24)}d left` : `${Math.round(hours)}h left`;
}
