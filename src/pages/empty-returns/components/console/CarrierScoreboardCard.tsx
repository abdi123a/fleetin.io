import {
  ConsolePanel,
  Meter,
  PanelOutlineLink,
  SectionLabel,
  StatusChip,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import type { TransporterCycleStats } from '@/types/emptyReturn';

import { CompanyName } from '../atoms';

/**
 * Who is actually cycling, and who is just holding boxes.
 *
 * One row per carrier, most live cycles first. The meter is the on-time
 * return rate over completed cycles — the figure a carrier is judged by in
 * this module — and it stays honest about small denominators: a carrier with
 * no completed cycle gets a quiet dash, not a fake 0%.
 */

export interface CarrierScoreboardCardProps {
  carriers: TransporterCycleStats[];
  onOpenLeague?: () => void;
  className?: string;
}

export function CarrierScoreboardCard({
  carriers,
  onOpenLeague,
  className,
}: CarrierScoreboardCardProps) {
  const liveTotal = carriers.reduce((sum, carrier) => sum + carrier.active, 0);
  const leader = carriers[0];

  return (
    <ConsolePanel
      className={className}
      title="Carrier Scoreboard"
      subtitle="Who is cycling, who is holding boxes"
      action={<PanelOutlineLink onClick={onOpenLeague}>Transporter league</PanelOutlineLink>}
      footer={
        leader && liveTotal > 0 ? (
          <p className="type-body-xs text-muted-foreground">
            <span className="font-bold text-foreground">{leader.name}</span> is running{' '}
            {leader.active} of the {liveTotal} live cycle{liveTotal === 1 ? '' : 's'} — one cycle =
            one empty return welded to one full load.
          </p>
        ) : (
          <p className="type-body-xs text-muted-foreground">
            No live cycles — every carrier is idle or completed.
          </p>
        )
      }
    >
      {/* Column heads */}
      <div className="hidden gap-x-4 pb-2 sm:grid sm:grid-cols-[minmax(0,1.5fr)_repeat(3,4rem)_minmax(0,1.1fr)]">
        <SectionLabel>Carrier</SectionLabel>
        <SectionLabel className="text-right">Active</SectionLabel>
        <SectionLabel className="text-right">Boxes</SectionLabel>
        <SectionLabel className="text-right">Done</SectionLabel>
        <SectionLabel className="text-right">On-time returns</SectionLabel>
      </div>

      <div className="divide-y divide-border-subtle">
        {carriers.map((carrier) => {
          const ratio = carrier.withDeadline > 0 ? carrier.onTime / carrier.withDeadline : null;
          return (
            <div
              key={carrier.name}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,4rem)_minmax(0,1.1fr)]"
            >
              <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                <CompanyName
                  name={carrier.name}
                  size="sm"
                  tone="strong"
                  textClassName="text-sm"
                />
                {carrier.standalone > 0 ? (
                  <StatusChip tone="attention" className="shrink-0">
                    {carrier.standalone} standalone
                  </StatusChip>
                ) : null}
              </div>

              <CellFigure label="Active" value={carrier.active} strong={carrier.active > 0} />
              <CellFigure label="Boxes" value={carrier.containers} />
              <CellFigure label="Done" value={carrier.completed} />

              <div className="col-span-2 flex items-center gap-2.5 sm:col-span-1">
                {ratio === null ? (
                  <span className="type-body-xs w-full text-right text-muted-foreground sm:text-right">
                    — no completed cycles yet
                  </span>
                ) : (
                  <>
                    <Meter value={ratio} color="var(--primary)" height={7} className="flex-1" />
                    <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
                      {carrier.onTimeLabel}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ConsolePanel>
  );
}

/** One numeric cell that keeps its meaning when the grid stacks on phones. */
function CellFigure({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:justify-end">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-sm font-extrabold tabular-nums text-foreground'
            : 'text-sm font-semibold tabular-nums text-muted-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}

export default CarrierScoreboardCard;
