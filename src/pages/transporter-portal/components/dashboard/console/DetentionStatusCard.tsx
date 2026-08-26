import { useMemo, useState } from 'react';
import { ArrowRight } from '@/design-system/icons';
import { cn } from '@/utils';
import { ConsolePanel, PanelLink, PartyBadge, PillTabs, StatusChip } from './kit';
import type { DetentionRow } from './model';

/**
 * The containers whose clock we are carrying.
 *
 * Full width because the row only means anything with all six columns present:
 * a box, where it is going, when free time ends, how long is left, who is
 * holding it up and why. Drop the last two and the panel becomes a list of
 * problems with no owner, which is the version everybody ignores.
 *
 * Import legs are boxes we took off the terminal and must hand back; export
 * legs are the matched return loads already running to the port.
 */

const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(0,10rem)_minmax(0,1.4fr)_minmax(0,8rem)_minmax(0,7.5rem)_minmax(0,8.5rem)_minmax(0,1fr)] lg:items-center lg:gap-4';

export interface DetentionStatusCardProps {
  rows: DetentionRow[];
  fleetCode: string;
  onViewAll?: () => void;
  className?: string;
}

export function DetentionStatusCard({
  rows,
  fleetCode,
  onViewAll,
  className,
}: DetentionStatusCardProps) {
  const counts = useMemo(
    () => ({
      import: rows.filter((row) => row.flow === 'import').length,
      export: rows.filter((row) => row.flow === 'export').length,
    }),
    [rows],
  );

  const [flow, setFlow] = useState<'import' | 'export'>(
    counts.import >= counts.export ? 'import' : 'export',
  );

  const visible = rows.filter((row) => row.flow === flow).slice(0, 6);
  const onClock = rows.filter(
    (row) => row.status === 'overdue' || row.status === 'due_today',
  ).length;

  return (
    <ConsolePanel
      className={className}
      title="Detention & Empty Return Status"
      subtitle="Shipper-owned containers on a detention clock"
      action={onViewAll ? <PanelLink onClick={onViewAll}>View all</PanelLink> : undefined}
      bodyClassName="px-0 pt-0 pb-0"
      footer={
        <p className="type-body-xs text-muted-foreground">
          Showing the {visible.length} most urgent of {rows.length} open containers
        </p>
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <PillTabs
            tabs={[
              { key: 'import' as const, label: 'Import', count: counts.import },
              { key: 'export' as const, label: 'Export', count: counts.export },
            ]}
            active={flow}
            onChange={setFlow}
          />
          {onClock > 0 ? (
            <StatusChip tone="critical" pulse>
              {onClock} on the clock now
            </StatusChip>
          ) : null}
        </div>
        <p className="type-body-xs text-muted-foreground">
          Sorted by urgency
        </p>
      </div>

      <div
        className={cn('hidden border-y border-border-subtle px-5 py-2.5', ROW_GRID)}
        aria-hidden
      >
        <span className="type-label text-muted-foreground">Container</span>
        <span className="type-label text-muted-foreground">Booking</span>
        <span className="type-label text-muted-foreground">Dates</span>
        <span className="type-label text-muted-foreground">Status</span>
        <span className="type-label text-muted-foreground">Responsible</span>
        <span className="type-label text-muted-foreground">Root cause</span>
      </div>

      <ul className="flex flex-col divide-y divide-border-subtle">
        {visible.length === 0 ? (
          <li className="type-body-xs px-5 py-6 text-muted-foreground">
            No {flow} containers on a clock.
          </li>
        ) : (
          visible.map((row) => (
            <li key={row.id} className={cn('flex flex-col gap-2.5 px-5 py-3.5', ROW_GRID)}>
              <p className="type-body-sm min-w-0 truncate text-foreground">
                {row.containerNo}
              </p>

              <p className="type-body-xs flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="min-w-0 truncate">{row.origin}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
                <span className="min-w-0 truncate">{row.destination}</span>
              </p>

              <div className="type-body-xs min-w-0 tabular-nums text-muted-foreground">
                <p className="truncate">{row.primaryDate}</p>
                <p className="truncate opacity-75">{row.secondaryDate}</p>
              </div>

              <div className="min-w-0">
                <StatusChip
                  tone={
                    row.status === 'overdue'
                      ? 'critical'
                      : row.status === 'due_today'
                        ? 'attention'
                        : row.status === 'due_soon'
                          ? 'info'
                          : 'quiet'
                  }
                  pulse={row.status === 'overdue' || row.status === 'due_today'}
                >
                  {row.statusLabel}
                </StatusChip>
              </div>

              <p className="type-body-xs flex min-w-0 items-center gap-2 text-foreground">
                {row.responsible ? (
                  <>
                    <PartyBadge
                      initials={
                        row.responsible.label === 'You'
                          ? fleetCode.slice(0, 2).toUpperCase()
                          : row.responsible.initials
                      }
                      tone={row.responsible.tone}
                    />
                    <span className="truncate">{row.responsible.label}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>

              <p className="type-body-xs min-w-0 truncate text-muted-foreground">{row.rootCause}</p>
            </li>
          ))
        )}
      </ul>
    </ConsolePanel>
  );
}

export default DetentionStatusCard;
