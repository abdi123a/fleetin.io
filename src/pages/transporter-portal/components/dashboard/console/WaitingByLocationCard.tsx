import { ConsolePanel, InsightNote, Meter, SectionLabel, StatusChip } from './kit';
import { cn } from '@/utils';
import type { WaitingProfile } from './model';
import { hours as formatHours, pct } from './money';

/**
 * How much of a move is the truck standing still, and where.
 *
 * The black tick on every row is the network's hours at the same point of the
 * cycle. Without it a reader has no way to tell an unavoidable queue from a
 * relationship worth renegotiating — 2.4 h at the port gate is the corridor
 * being the corridor; 1.2 h more than the network at a consignee's yard is a
 * conversation to have with that consignee.
 */

export interface WaitingByLocationCardProps {
  data: WaitingProfile;
  className?: string;
}

export function WaitingByLocationCard({ data, className }: WaitingByLocationCardProps) {
  const scale = Math.max(
    ...data.byLocation.map((row) => Math.max(row.hours, row.network)),
    1,
  ) * 1.15;

  return (
    <ConsolePanel
      className={className}
      title="Waiting Time by Location"
      subtitle="Per move · black tick = network average"
    >
      <div className="flex items-end gap-3">
        <span className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
          {formatHours(data.perMove)}
        </span>
        <span className="type-body-xs pb-1 text-muted-foreground">
          waiting per move
        </span>
        <StatusChip tone="attention" className="ml-auto shrink-0">
          {pct(data.waitingShare)} of cycle
        </StatusChip>
      </div>

      <div className="mt-4 flex h-[26px] gap-[3px] overflow-hidden rounded-md">
        <div
          className="flex items-center px-2.5 text-[11px] font-bold"
          style={{
            flex: `${Math.max(data.drivingPerMove, 0.1)} 1 0%`,
            background: 'var(--fl-teal-700)',
            color: 'var(--fl-neutral-0)',
          }}
        >
          {data.drivingPerMove.toFixed(1)}
        </div>
        <div
          className="flex items-center px-2.5 text-[11px] font-bold"
          style={{
            flex: `${Math.max(data.perMove, 0.1)} 1 0%`,
            background: 'var(--accent-bold)',
            color: 'var(--accent-bold-foreground)',
          }}
        >
          {data.perMove.toFixed(1)}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-[2px]"
            style={{ background: 'var(--fl-teal-700)' }}
            aria-hidden
          />
          Driving {formatHours(data.drivingPerMove)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-[2px]"
            style={{ background: 'var(--accent-bold)' }}
            aria-hidden
          />
          Waiting {formatHours(data.perMove)}
        </span>
        <span>Cycle {formatHours(data.cycle)} per move</span>
      </div>

      <SectionLabel className="mt-5">Where the waiting happens</SectionLabel>

      <div className="mt-3.5 flex flex-col gap-4">
        {data.byLocation.map((row) => {
          const worse = row.delta > 0;
          return (
            <div key={row.location}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="type-body-xs min-w-0 truncate text-foreground">
                  {row.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="type-body-sm font-bold tabular-nums text-foreground">
                    {formatHours(row.hours)}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
                      worse
                        ? 'bg-accent-subtle text-accent-subtle-foreground'
                        : 'bg-primary-subtle text-primary-subtle-foreground',
                    )}
                  >
                    {worse ? '+' : '−'}
                    {Math.abs(row.delta).toFixed(1)} h
                  </span>
                </span>
              </div>
              <Meter
                value={row.hours / scale}
                benchmark={row.network / scale}
                color={worse ? 'var(--accent-bold)' : 'var(--fl-teal-700)'}
              />
            </div>
          );
        })}
      </div>

      {data.worst ? (
        <InsightNote tone="attention" className="mt-4">
          <span className="font-bold">{data.worst.label}</span> holds your trucks{' '}
          <span className="font-bold">{formatHours(data.worst.delta)} longer</span> than the network
          average — closing that gap is worth roughly one extra move per truck per day.
        </InsightNote>
      ) : (
        <InsightNote className="mt-4">
          Every point of the cycle is at or under the network average — the waiting on this fleet is
          the corridor’s, not yours.
        </InsightNote>
      )}
    </ConsolePanel>
  );
}

export default WaitingByLocationCard;
