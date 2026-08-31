import { Spinner } from '@/design-system';
import { cn } from '@/utils';

import { useWorkload } from '../api/queries';
import { PersonAvatar } from '../components/PersonAvatar';

function Figure({
  value, label, tone,
}: { value: number; label: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          'text-lg font-bold tabular-nums leading-none',
          value === 0 ? 'text-muted-foreground' : tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning-bold' : 'text-foreground',
        )}
      >
        {value}
      </div>
      {/* No tracking: four labels share a 64px column and "THIS WEEK" was
          truncating to "THIS WE…". Letter-spacing is the first thing to go. */}
      <div className="mt-0.5 truncate text-[0.625rem] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Who is carrying what.
 *
 * The one view a manager opens to answer "who can take this" — and the reason
 * it counts *overdue* beside *open*: eight open tasks none of which are late is
 * a person working, and two tasks both a week late is a person stuck. The bar
 * is relative to the busiest person, so the shape of the team is visible
 * without reading a single number.
 */
export function TaskWorkload({ className }: { className?: string }) {
  const { data, isLoading } = useWorkload();

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-card border border-border py-16 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading workload…
      </div>
    );
  }

  const busiest = Math.max(1, ...data.rows.map((row) => row.open));

  return (
    <div className={cn('space-y-3', className)}>
      {data.unassigned > 0 ? (
        <p className="rounded-card border border-warning bg-warning-subtle px-4 py-2.5 text-sm text-warning-subtle-foreground">
          <span className="font-bold tabular-nums">{data.unassigned}</span> open{' '}
          {data.unassigned === 1 ? 'task has' : 'tasks have'} nobody on them.
        </p>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-raised">
        {data.rows.map((row) => (
          <li key={row.person.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <PersonAvatar person={row.person} size="sm" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.person.firstName} {row.person.lastName}
                </p>
                {/* Relative to the busiest person, so the shape of the team
                    reads before any of the numbers do. */}
                <span className="mt-1 block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className={cn(
                      'block h-full rounded-full transition-[width] duration-normal',
                      row.overdue > 0 ? 'bg-destructive' : 'bg-primary',
                    )}
                    style={{ width: `${Math.round((row.open / busiest) * 100)}%` }}
                  />
                </span>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-4 gap-3 sm:w-72">
              <Figure value={row.open} label="Open" />
              <Figure value={row.overdue} label="Overdue" tone="bad" />
              <Figure value={row.dueThisWeek} label="This week" tone="warn" />
              <Figure value={row.urgent} label="Urgent" tone="bad" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
