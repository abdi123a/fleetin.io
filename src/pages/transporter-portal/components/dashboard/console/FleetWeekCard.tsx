import { ConsolePanel, Meter, PanelOutlineLink, SectionLabel, SegmentBar } from './kit';
import type { FleetWeek } from './model';
import { djfCard, pct } from './money';

/**
 * Every vehicle-day in the window, sorted by whether it earned anything.
 *
 * The five states are the whole argument: only the first one is paid work, and
 * the two next to it — running empty and waiting — are the ones a dispatcher
 * can actually move, which is why they sit immediately beside the earning
 * block rather than being lumped in with the workshop. The right-hand list
 * names the trucks behind the idle number so the panel ends on a phone call
 * someone can make.
 */

export interface FleetWeekCardProps {
  data: FleetWeek;
  onOpenFleet?: () => void;
  className?: string;
}

export function FleetWeekCard({ data, onOpenFleet, className }: FleetWeekCardProps) {
  const movable = data.segments
    .filter((segment) => segment.key === 'empty' || segment.key === 'waiting')
    .reduce((sum, segment) => sum + segment.days, 0);

  return (
    <ConsolePanel
      className={className}
      title="Fleet Week"
      subtitle={`${data.truckDays} vehicle-days available in this window`}
      action={
        <div>
          <p className="text-xl font-extrabold tracking-tight tabular-nums text-foreground">
            {pct(data.earningShare)}
          </p>
          <p className="type-body-xs mt-0.5 text-muted-foreground">earning</p>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body-xs text-muted-foreground">
            <span className="font-bold text-foreground">{movable} vehicle-days</span> lost to empty
            running and waiting.
          </p>
          {onOpenFleet ? <PanelOutlineLink onClick={onOpenFleet}>Fleet detail →</PanelOutlineLink> : null}
        </div>
      }
    >
      <SegmentBar
        segments={data.segments.map((segment) => ({
          key: segment.key,
          label: segment.label,
          value: segment.days,
          color: segment.color,
          foreground: segment.foreground,
          caption: pct(segment.days / Math.max(1, data.truckDays)),
        }))}
      />

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
        {data.segments.map((segment) => (
          <div key={segment.key} className="min-w-0">
            <p className="type-body-xs inline-flex items-center gap-2 text-foreground">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: segment.color }}
                aria-hidden
              />
              <span className="truncate">{segment.label}</span>
            </p>
            <p className="type-body-xs mt-1 pl-4 text-muted-foreground">
              {segment.days} vehicle-days
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-border-subtle pt-4 lg:grid-cols-2">
        <div>
          <SectionLabel>Paid Against Unpaid Time</SectionLabel>
          <div className="mt-3 flex flex-col gap-2.5">
            <MeterRow
              label="Earning"
              value={data.earningShare}
              color="var(--fl-teal-700)"
              trailing={`${data.earningDays} days`}
            />
            <MeterRow
              label="Not earning"
              value={1 - data.earningShare}
              color="var(--accent-bold)"
              trailing={`${data.notEarningDays} days`}
              trailingAttention
            />
          </div>
          <p className="type-body-xs mt-3 text-muted-foreground">
            Every earning day is worth about{' '}
            <span className="font-bold text-foreground">{djfCard(data.perDayValue)}</span> of work.
          </p>
        </div>

        <div>
          <SectionLabel>Longest Idle Vehicles</SectionLabel>
          <ul className="mt-3 flex flex-col gap-2">
            {data.stillest.length === 0 ? (
              <li className="type-body-xs text-muted-foreground">
                No idle vehicles.
              </li>
            ) : (
              data.stillest.map((truck) => (
                <li
                  key={truck.plate}
                  className="type-body-xs grid grid-cols-[minmax(0,7rem)_auto_1fr] items-baseline gap-2.5"
                >
                  <span className="truncate font-bold text-foreground">{truck.plate}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-accent-subtle-foreground">
                    {truck.days} {truck.days === 1 ? 'day' : 'days'}
                  </span>
                  <span className="truncate text-muted-foreground">{truck.reason}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </ConsolePanel>
  );
}

function MeterRow({
  label,
  value,
  color,
  trailing,
  trailingAttention = false,
}: {
  label: string;
  value: number;
  color: string;
  trailing: string;
  trailingAttention?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,5.5rem)_1fr_auto] items-center gap-3">
      <span className="type-body-xs truncate text-foreground">{label}</span>
      <Meter value={value} color={color} height={8} />
      <span
        className={
          trailingAttention
            ? 'type-body-xs shrink-0 font-bold tabular-nums text-accent-subtle-foreground'
            : 'type-body-xs shrink-0 font-bold tabular-nums text-foreground'
        }
      >
        {trailing}
      </span>
    </div>
  );
}

export default FleetWeekCard;
