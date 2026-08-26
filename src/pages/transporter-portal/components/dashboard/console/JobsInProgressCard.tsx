import { useState } from 'react';
import { ArrowRight } from '@/design-system/icons';
import { CompanyLabel } from '@/features/transporter-bi';
import { cn } from '@/utils';
import { ConsolePanel, PanelOutlineLink, PillTabs, StatusChip } from './kit';
import type { JobRow } from './model';

/**
 * The work actually moving right now, in slot order.
 *
 * Slot order rather than newest-first, because the reader's next action is
 * always about the job closest to its window. The status chip is the only
 * colour in the table: everything else is a fact, and the chip is the one
 * column that says whether the fact is a problem.
 */

const ROW_GRID =
  'lg:grid lg:grid-cols-[minmax(0,10rem)_minmax(0,1.5fr)_minmax(0,9.5rem)_minmax(0,8rem)_minmax(0,8.5rem)_minmax(0,4.5rem)] lg:items-center lg:gap-4';

export interface JobsInProgressCardProps {
  ongoing: JobRow[];
  scheduled: JobRow[];
  totalMoves: number;
  onViewAll?: () => void;
  onOpenJob?: (job: JobRow) => void;
  className?: string;
}

export function JobsInProgressCard({
  ongoing,
  scheduled,
  totalMoves,
  onViewAll,
  onOpenJob,
  className,
}: JobsInProgressCardProps) {
  const [tab, setTab] = useState<'ongoing' | 'scheduled'>('ongoing');
  const rows = (tab === 'ongoing' ? ongoing : scheduled).slice(0, 6);
  const total = tab === 'ongoing' ? ongoing.length : scheduled.length;

  return (
    <ConsolePanel
      className={className}
      title="Jobs in Progress"
      subtitle={`${totalMoves} bookings completed this period · container, bulk and special`}
      action={onViewAll ? <PanelOutlineLink onClick={onViewAll}>View all</PanelOutlineLink> : undefined}
      bodyClassName="px-0 pt-0 pb-0"
      footer={
        <p className="type-body-xs text-muted-foreground">
          Showing the {rows.length} nearest slots of {total}{' '}
          {tab === 'ongoing' ? 'ongoing' : 'scheduled'} bookings
        </p>
      }
    >
      <div className="flex flex-col gap-3 px-5 pb-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <PillTabs
          tabs={[
            { key: 'ongoing' as const, label: 'Ongoing', count: ongoing.length },
            { key: 'scheduled' as const, label: 'Scheduled', count: scheduled.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <p className="type-body-xs text-muted-foreground">
          Sorted by slot time — reference · booking · vehicle · status
        </p>
      </div>

      <div className={cn('hidden border-y border-border-subtle px-5 py-2.5', ROW_GRID)} aria-hidden>
        <span className="type-label text-muted-foreground">Shipper / ref</span>
        <span className="type-label text-muted-foreground">Booking</span>
        <span className="type-label text-muted-foreground">Truck / driver</span>
        <span className="type-label text-muted-foreground">Status</span>
        <span className="type-label text-muted-foreground">Cargo</span>
        <span className="type-label text-right text-muted-foreground">Slot</span>
      </div>

      <ul className="flex flex-col divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <li className="type-body-xs px-5 py-6 text-muted-foreground">
            Nothing {tab === 'ongoing' ? 'on the road' : 'scheduled'} right now.
          </li>
        ) : (
          rows.map((job) => (
            <li
              key={job.id}
              className={cn(
                'flex flex-col gap-2.5 px-5 py-3.5',
                ROW_GRID,
                onOpenJob && 'cursor-pointer transition-colors hover:bg-surface-sunken',
              )}
              onClick={onOpenJob ? () => onOpenJob(job) : undefined}
            >
              <div className="min-w-0">
                <p className="type-body-sm truncate text-foreground">{job.ref}</p>
                <CompanyLabel
                  name={job.customerName}
                  className="mt-0.5 max-w-full gap-1.5"
                  textClassName="truncate text-[10.5px] font-semibold text-muted-foreground"
                />
              </div>

              <p className="type-body-xs flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="min-w-0 truncate">{job.origin}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
                <span className="min-w-0 truncate">{job.destination}</span>
              </p>

              <p className="type-body-xs flex min-w-0 items-center gap-2 text-foreground">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[9px] font-extrabold text-primary-subtle-foreground">
                  {job.driverInitials}
                </span>
                <span className="truncate">
                  {job.truckLabel} · {job.driverName}
                </span>
              </p>

              <div className="min-w-0">
                <StatusChip
                  tone={job.statusTone}
                  pulse={job.statusTone === 'critical'}
                >
                  {job.statusLabel}
                </StatusChip>
              </div>

              <p className="type-body-xs min-w-0 truncate text-muted-foreground">{job.cargoLabel}</p>

              <p className="type-body-xs shrink-0 font-bold tabular-nums text-foreground lg:text-right">
                {job.slot}
              </p>
            </li>
          ))
        )}
      </ul>
    </ConsolePanel>
  );
}

export default JobsInProgressCard;
