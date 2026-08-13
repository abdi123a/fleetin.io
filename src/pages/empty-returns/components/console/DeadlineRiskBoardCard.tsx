import {
  ConsolePanel,
  Meter,
  PanelOutlineLink,
  SectionLabel,
} from '@/pages/transporter-portal/components/dashboard/console/kit';
import { formatDateTime } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

import { CompanyName, Mono, RiskBadge, SlackValue } from '../atoms';
import { SAFETY_CUTOFF_POSITION, slackLabelOf, type UrgentBoardRow } from './model';

/**
 * The page's centrepiece: the returns that breach first if nobody moves.
 *
 * The old dashboard listed these five as text. What the console adds is the
 * meter — one track per box showing how much of the 12h watch window is
 * already burned, with a black tick at the 6h safety cutoff where matching
 * stops. Five meters read down as a race the operator is losing or winning;
 * five slack figures never did.
 *
 * Colour on the fill only, per the console law: teal while the margin is
 * comfortable, amber inside the watch window, red once the margin is gone.
 * The frame stays plain everywhere.
 */

export interface DeadlineRiskBoardCardProps {
  rows: UrgentBoardRow[];
  onSelectRow: (record: EmptyReturnRecord) => void;
  onOpenCycles?: () => void;
  className?: string;
}

export function DeadlineRiskBoardCard({
  rows,
  onSelectRow,
  onOpenCycles,
  className,
}: DeadlineRiskBoardCardProps) {
  return (
    <ConsolePanel
      className={className}
      title="Deadline Risk Board"
      subtitle="What breaches first if nobody moves — tightest margin on top"
      action={<PanelOutlineLink onClick={onOpenCycles}>Open cycles</PanelOutlineLink>}
      bodyClassName="px-0 pb-2 pt-3"
      footer={
        <p className="type-body-xs text-muted-foreground">
          Track = the 12 h watch window · black tick = the 6 h safety cutoff, where matching stops
          and the return goes standalone. Deadline protection always beats matching.
        </p>
      }
    >
      {rows.length === 0 ? (
        <p className="type-body-sm px-5 py-10 text-center text-muted-foreground">
          No deadline at risk — every open return has slack.
        </p>
      ) : (
        <>
          {/* Column heads, so the five rows read as a table, not five sentences. */}
          <div className="hidden gap-x-4 px-5 pb-2 md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_9.5rem]">
            <SectionLabel>Container</SectionLabel>
            <SectionLabel>Deadline pressure</SectionLabel>
            <SectionLabel className="text-right">Slack · risk</SectionLabel>
          </div>

          <div className="divide-y divide-border-subtle border-t border-border-subtle">
            {rows.map((row) => (
              <BoardRow key={row.record.id} row={row} onSelect={() => onSelectRow(row.record)} />
            ))}
          </div>
        </>
      )}
    </ConsolePanel>
  );
}

function BoardRow({ row, onSelect }: { row: UrgentBoardRow; onSelect: () => void }) {
  const { record } = row;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-3.5 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_9.5rem]"
    >
      {/* Who and where */}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <Mono className="truncate text-sm font-semibold text-foreground">{record.container}</Mono>
          <span className="shrink-0 text-[11px] text-muted-foreground">{record.locationId}</span>
        </span>
        <span className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Shipper</span>
          <CompanyName name={record.client} tone="muted" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Carrier</span>
          <CompanyName name={record.transporter} tone="muted" />
        </span>
      </span>

      {/* The burn — full width on phones, its own column from md */}
      <span className="col-span-2 flex min-w-0 flex-col gap-1.5 md:col-span-1">
        <Meter
          value={row.pressure}
          color={row.meterColor}
          benchmark={SAFETY_CUTOFF_POSITION}
          height={8}
        />
        <span className="truncate text-[11px] tabular-nums text-muted-foreground">
          Due {formatDateTime(record.deadline)}
        </span>
      </span>

      {/* The verdict — the figure the whole board exists to answer, so it leads. */}
      <span className="col-start-2 row-start-1 flex shrink-0 flex-col items-end gap-1 md:col-start-3">
        <SlackValue value={row.slack} tone="urgent" format={slackLabelOf} className="text-lg leading-none" />
        <RiskBadge risk={row.risk} />
      </span>
    </button>
  );
}

export default DeadlineRiskBoardCard;
