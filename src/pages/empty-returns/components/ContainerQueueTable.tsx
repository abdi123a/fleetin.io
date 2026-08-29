import { useMemo, useState } from 'react';

import { TablePager, usePagedRows } from '@/components/common/TablePager';
import { Button } from '@/design-system';
import { ChevronDown, ChevronRight, MapPin, RotateCcw, Zap } from '@/design-system/icons';
import { detentionFor, formatDetention, riskTextClass } from '@/data/emptyReturnData';
import { formatSpan, formatStamp, isAccruingDetention, riskOf } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, EmptyTag, Mono, RiskBadge, StageChip } from './marks';

/**
 * The Control Tower's queue, as the v19 design draws it: one table, nine
 * columns, grouped into urgency bands.
 *
 * This replaced a stack of row cards on 2026-08-29 at the user's direction —
 * the card layout was rejected and v19 restored. The trade is deliberate and
 * worth stating, because the house idiom is otherwise card-based: a container
 * queue is a *comparison* surface. An operator scanning forty boxes is asking
 * "which of these is worst, and what do I do about it" — that is a question
 * about columns lining up, and cards answer it badly. Every other list in the
 * app is a browse surface, which is why they stay cards.
 *
 * ## The three-column grammar the table exists to hold
 *
 * v19's own footnote is the spec: **Status** is what is happening · **Risk** is
 * how urgent · **Next Action** is what to do. They are three different
 * questions and each gets its own column, so a row never encodes urgency in its
 * status word or hides the action inside a menu.
 *
 * `Next Action` is the load-bearing one: exactly one primary button per row,
 * chosen by stage, so there is never a row where the operator has to decide
 * *which* affordance to reach for before deciding anything about the container.
 */

/** How many rows a band shows before paging. Bands are urgency-ordered, so the top is the worst. */
const PAGE_SIZE = 8;

/* ---------------------------------------------------------------------------
 * Decision window — the clock, spelled out
 * ------------------------------------------------------------------------- */

/**
 * v19's `DeadlineCell`: the remaining window, the absolute stamp under it, and
 * the money if the clock has already run out.
 *
 * A closed cycle reports how it finished instead — "on time" or how late — as
 * there is no window left to count down.
 */
function DecisionWindow({ record, now }: { record: EmptyReturnRecord; now: number }) {
  if (record.stage === 'closed') {
    const late = Boolean(
      record.returnedAt && record.deadline && record.returnedAt > record.deadline,
    );
    return (
      <div className="min-w-0">
        <div
          className={cn(
            'font-mono text-xs font-bold',
            late ? 'text-destructive' : 'text-stage-closed-subtle-foreground',
          )}
        >
          {late && record.returnedAt && record.deadline
            ? `${formatSpan(record.returnedAt - record.deadline)} late`
            : 'On time'}
        </div>
        <Mono className="block text-[10px] text-muted-foreground">
          {formatStamp(record.deadline)}
        </Mono>
      </div>
    );
  }

  const risk = riskOf(record, now);
  const remaining = record.deadline === null ? null : record.deadline - now;
  /* Only a box that is genuinely still accruing shows a price. A container
     paired before its deadline has settled its clock for good, however long
     ago that date now is. */
  const detention = isAccruingDetention(record, now)
    ? detentionFor(now - (record.deadline ?? now))
    : 0;

  return (
    <div className="min-w-0">
      <div className={cn('font-mono text-xs font-bold', riskTextClass(risk))}>
        {remaining === null
          ? 'No deadline'
          : remaining < 0
            ? `${formatSpan(remaining)} overdue`
            : `${formatSpan(remaining)} remaining`}
      </div>
      <Mono className="block text-[10px] text-muted-foreground">
        {formatStamp(record.deadline)}
      </Mono>
      {detention > 0 && (
        <div className="text-[10px] font-semibold text-destructive">
          Detention {formatDetention(detention)}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Next action — one button, chosen by stage
 * ------------------------------------------------------------------------- */

/**
 * v19's `ActionCell`. One primary action per row and never two.
 *
 * The overdue branch is the interesting one: a container past its deadline is
 * offered **Plan empty return**, not Find full load. Pairing exists to beat a
 * clock that has already run out, so continuing to offer it there would be
 * advice that cannot help — the only thing left that reduces the bill is
 * getting the box back today.
 */
function NextAction({
  record,
  now,
  onOpen,
}: {
  record: EmptyReturnRecord;
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
}) {
  if (record.stage === 'closed') {
    return <span className="text-xs text-muted-foreground">No action required</span>;
  }

  if (record.stage === 'paired') {
    return (
      <span className="block text-xs font-bold text-stage-paired-subtle-foreground">
        Paired
        <span className="block text-[10px] font-semibold text-muted-foreground">
          Execution is the Shipment module&rsquo;s
        </span>
      </span>
    );
  }

  if (record.stage === 'return_planned') {
    return (
      <Button
        size="sm"
        variant="primary"
        className="h-8 whitespace-nowrap bg-stage-returning text-stage-returning-foreground hover:brightness-105"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(record.id, 'return');
        }}
      >
        Confirm return
      </Button>
    );
  }

  const overdue = riskOf(record, now) === 'overdue';
  return overdue ? (
    <Button
      size="sm"
      variant="primary"
      leadingIcon={<RotateCcw className="size-3.5" />}
      className="h-8 whitespace-nowrap bg-stage-returning text-stage-returning-foreground hover:brightness-105"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(record.id, 'return');
      }}
    >
      Plan empty return
    </Button>
  ) : (
    <Button
      size="sm"
      variant="primary"
      leadingIcon={<Zap className="size-3.5" />}
      className="h-8 whitespace-nowrap"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(record.id, 'select');
      }}
    >
      Find full load
    </Button>
  );
}

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------- */

const COLUMNS = [
  'Container',
  'Shipping line',
  'Status',
  'Current location',
  'Paired shipment',
  'Transporter',
  'Decision window',
  'Risk',
  'Next action',
] as const;

function QueueTable({
  rows,
  now,
  onOpen,
  emptyCopy,
}: {
  rows: EmptyReturnRecord[];
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  emptyCopy: string;
}) {
  return (
    /* `w-0 min-w-full` rather than plain `overflow-x-auto`: this table is a flex
       child, and without it a long location name sets the intrinsic width and
       pushes the whole page off the right edge instead of scrolling inside. */
    <div className="w-0 min-w-full overflow-x-auto rounded-card-nested border border-border bg-card">
      <table className="w-full min-w-[64rem] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken text-[10px] uppercase tracking-wider text-muted-foreground">
            {COLUMNS.map((head) => (
              <th key={head} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr
              key={record.id}
              onClick={() => onOpen(record.id)}
              className="cursor-pointer border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-sunken/60"
            >
              <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <Mono className="text-xs font-semibold text-foreground">
                    {record.container || record.bookingReference}
                  </Mono>
                  <EmptyTag small />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {record.size} · Previous load <Mono>{record.prevLoad}</Mono>
                </div>
              </td>

              <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-foreground">
                {record.line}
              </td>

              <td className="px-3 py-3">
                <StageChip record={record} />
              </td>

              <td className="px-3 py-3 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  <span className="truncate" title={record.locationName}>
                    {record.locationName}
                  </span>
                </span>
              </td>

              <td className="px-3 py-3 text-xs">
                {record.nextFull ? (
                  <div className="min-w-0">
                    <Mono className="font-semibold text-stage-paired-subtle-foreground">
                      {record.nextFull.shipmentReference ?? record.nextFull.missionId ?? '—'}
                    </Mono>
                    <div className="text-[10px] text-muted-foreground">
                      Full container{' '}
                      <Mono className="font-semibold text-foreground">
                        {record.nextFull.container || '—'}
                      </Mono>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Pickup{' '}
                      <Mono className="font-semibold">{formatStamp(record.nextFull.pickupAt)}</Mono>
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground/60">Not paired</span>
                )}
              </td>

              <td className="px-3 py-3 text-xs">
                <CompanyName name={record.transporter} className="min-w-0" />
              </td>

              <td className="px-3 py-3">
                <DecisionWindow record={record} now={now} />
              </td>

              <td className="px-3 py-3">
                <RiskBadge risk={riskOf(record, now)} />
              </td>

              <td className="px-3 py-3">
                <NextAction record={record} now={now} onOpen={onOpen} />
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-3 py-8 text-center text-sm text-muted-foreground"
              >
                {emptyCopy}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One urgency band
 * ------------------------------------------------------------------------- */

export interface ContainerQueueTableProps {
  title: string;
  /** Class for the band's own heading colour. */
  tone: string;
  rows: EmptyReturnRecord[];
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  /** Bands nobody has to act on start closed. */
  collapsible?: boolean;
  emptyCopy: string;
  /** Anything that changes what the band contains, so paging resets to page 1. */
  resetKey?: unknown;
}

export function ContainerQueueTable({
  title,
  tone,
  rows,
  now,
  onOpen,
  collapsible = false,
  emptyCopy,
  resetKey,
}: ContainerQueueTableProps) {
  const [open, setOpen] = useState(!collapsible);
  const paged = usePagedRows(rows, { pageSize: PAGE_SIZE, resetKey });

  /* A band whose rows all left keeps its heading — the count going to zero is
     itself the answer to "what needs my attention", and hiding the row would
     make an empty morning look like a broken filter. */
  const body = useMemo(
    () => (
      <>
        <QueueTable rows={paged.rows} now={now} onOpen={onOpen} emptyCopy={emptyCopy} />
        {rows.length > PAGE_SIZE && <TablePager paged={paged} noun="containers" />}
      </>
    ),
    [paged, now, onOpen, emptyCopy, rows.length],
  );

  return (
    <section className="min-w-0 space-y-2">
      <button
        type="button"
        disabled={!collapsible}
        onClick={() => collapsible && setOpen((value) => !value)}
        aria-expanded={collapsible ? open : undefined}
        className={cn(
          'flex min-w-0 items-center gap-2 text-left',
          collapsible ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        {collapsible &&
          (open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ))}
        <h2 className={cn('text-[11px] font-extrabold uppercase tracking-widest', tone)}>{title}</h2>
        <Mono className="text-[11px] font-bold text-muted-foreground">{rows.length}</Mono>
      </button>

      {(!collapsible || open) && body}
    </section>
  );
}

export default ContainerQueueTable;
