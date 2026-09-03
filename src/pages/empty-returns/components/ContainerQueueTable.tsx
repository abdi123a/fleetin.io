import { useMemo, useState } from 'react';

import { TablePager, usePagedRows } from '@/components/common/TablePager';
import { Button, CompanyAvatar } from '@/design-system';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ContainerIcon,
  MapPin,
  RotateCcw,
  Ship,
  Timer,
  Truck,
  Zap,
} from '@/design-system/icons';
import { companyInitials, detentionFor, formatDetention, riskTextClass } from '@/data/emptyReturnData';
import { useShippingLines } from '@/features/shipping-lines/shippingLines';
import { formatSpan, formatStamp, isAccruingDetention, riskOf } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono, RiskBadge, StageChip } from './marks';

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
    const tone = late ? 'text-destructive' : 'text-stage-closed-subtle-foreground';
    return (
      <Figure
        value={
          late && record.returnedAt && record.deadline
            ? formatSpan(record.returnedAt - record.deadline)
            : 'On time'
        }
        caption={late ? 'returned late' : 'closed'}
        reference={formatStamp(record.deadline)}
        tone={tone}
      />
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
    <Figure
      value={remaining === null ? '—' : formatSpan(remaining)}
      caption={
        remaining === null
          ? 'no deadline'
          : [remaining < 0 ? 'overdue' : 'remaining', detention > 0 ? formatDetention(detention) : null]
              .filter(Boolean)
              .join(' · ')
      }
      reference={formatStamp(record.deadline)}
      tone={riskTextClass(risk)}
    />
  );
}

/**
 * One figure, one caption, one reference — in that order and no other.
 *
 * This cell held four things in four different treatments: a bold mono span, an
 * uppercase label, a mono timestamp and a bordered money chip. Four styles is
 * four things asking to be read first, which is the same as none of them
 * asking. The magnitude is what the operator is scanning for, so it leads at
 * full size; what it *means* and what it has *cost* are the same thought and
 * share the line under it; the absolute deadline is a reference you look up
 * once you have decided to care, so it goes last and quiet.
 */
function Figure({
  value,
  caption,
  reference,
  tone,
}: {
  value: string;
  caption: string;
  reference: string;
  tone: string;
}) {
  return (
    <div className="min-w-0">
      <div className={cn('font-mono text-base font-bold leading-none', tone)}>{value}</div>
      <div className={cn('mt-1 truncate text-[11px] font-semibold leading-none', tone)}>
        {caption}
      </div>
      <Mono className="mt-1.5 block truncate text-[10px] leading-none text-muted-foreground">
        {reference}
      </Mono>
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
/**
 * Whether this row has an action at all.
 *
 * A closed cycle and a paired one both render prose rather than a button —
 * "No action required", "Paired · execution is the Shipment module's". The
 * table needs that text because a cell cannot be empty without the row looking
 * broken; a card can simply stop, and should: "Paired" printed under a card
 * whose header already says Paired is the same word twice.
 */
function hasAction(record: EmptyReturnRecord): boolean {
  return record.stage !== 'closed' && record.stage !== 'paired';
}

function NextAction({
  record,
  now,
  onOpen,
  /* The table's column is 140px and "⟲ Plan empty return" wants 167 — the one
     thing left that made the table overflow its own width. The glyph is the
     part that goes: the column is headed "Next action" and the words say what
     the action is, so the icon was the only redundant pixel in the cell. The
     card keeps it, having the room. */
  dense = false,
}: {
  record: EmptyReturnRecord;
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  dense?: boolean;
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
        className={cn(
          'h-8 whitespace-nowrap bg-stage-returning text-stage-returning-foreground hover:brightness-105',
          dense && 'px-3',
        )}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(record.id, 'return');
        }}
      >
        {/* Same trade the plan button makes below: the column is narrow and
            the full phrase truncates to "Confirm empty r…", which is worse than
            a shorter true label. The card, which has the room, says it in
            full. */}
        {dense ? 'Confirm return' : 'Confirm empty return'}
      </Button>
    );
  }

  const overdue = riskOf(record, now) === 'overdue';
  return overdue ? (
    <Button
      size="sm"
      variant="primary"
      leadingIcon={dense ? undefined : <RotateCcw className="size-3.5" />}
      className={cn(
        'h-8 whitespace-nowrap bg-stage-returning text-stage-returning-foreground hover:brightness-105',
        dense && 'px-3',
      )}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(record.id, 'return');
      }}
    >
      {/* "Plan return" in the table, "Plan empty return" on a card. The column
          is headed "Next action" and every row in it is an empty container, so
          the word "empty" is the one the cell can spare — and it was the last
          17px standing between the table and fitting its own width. */}
      {dense ? 'Plan return' : 'Plan empty return'}
    </Button>
  ) : (
    <Button
      size="sm"
      variant="primary"
      leadingIcon={dense ? undefined : <Zap className="size-3.5" />}
      className={cn('h-8 whitespace-nowrap', dense && 'px-3')}
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
 * Fragments shared by the table and the small-screen cards
 * ------------------------------------------------------------------------- */

/** State, number, and the leg it owes — the identity of the row. */
function ContainerIdentity({ record }: { record: EmptyReturnRecord }) {
  return (
    <>
      {/* State and number as one mark, not two things that happen to sit next
          to each other. They are one fact — *this* box is empty — and the row
          was printing the state in a chip and the number in loose mono beside
          it, so the number read as an unrelated code. The colour is still the
          container scale's: yellow owes a return, teal is loaded, grey is home. */}
      {/* State and number as one mark: "EMPTY: 4745745" is one sentence about
          one box, which is why the two used to sit in separate chips and read
          as unrelated. White throughout, so the words carry no colour of their
          own and the chip's amber is the only thing saying "owes a return". */}
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-dashed border-container-empty-border bg-container-empty px-2 py-1 text-white">
        <ContainerIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="shrink-0 text-[10px] font-extrabold uppercase leading-none tracking-wider">
          Empty:
        </span>
        <Mono className="truncate text-sm font-bold leading-none">
          {record.container || record.bookingReference}
        </Mono>
      </span>
      {/* The leg runs the other way round from the shipment that made it: the
          container is standing in the free zone and owes itself back to the
          port, not the port → free zone of the delivery everyone remembers.

          `min-w-0` on both ends and no wrapping: an arrow left stranded at the
          end of one line with its destination on the next reads as two places
          rather than one journey. If there is genuinely not enough room, both
          ends give up characters evenly and the tooltips carry the full names. */}
      <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="size-3 shrink-0" aria-hidden />
        <span
          className="min-w-0 truncate"
          title={`Pickup — the empty is standing at ${record.locationName}`}
        >
          {record.locationName}
        </span>
        <ArrowRight className="size-3 shrink-0 opacity-60" aria-hidden />
        <span
          className="min-w-0 truncate font-semibold text-foreground"
          title={`Drop off — it owes a return to ${record.returnDepot}`}
        >
          {record.returnDepot}
        </span>
      </div>
    </>
  );
}

/** A line is recognised by its mark long before its name is read — the same
    reason every shipper and transporter in the app wears one. */
function LineName({ name, logo }: { name: string; logo?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CompanyAvatar
        src={logo}
        name={name}
        fallback={companyInitials(name)}
        size="xs"
        shape="circle"
        className="shrink-0"
      />
      <span className="truncate text-xs font-semibold text-foreground" title={name}>
        {name}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Small screens: one card per container
 * -------------------------------------------------------------------------
 *
 * Not a fallback — a different answer to a different question. The table is a
 * comparison surface and needs its columns; below `lg` there is no room for
 * seven of them, and the honest options are to drag the table sideways or to
 * stop being a table. Dragging was tried and rejected: a row you have to scroll
 * to finish reading is a row you cannot compare, so the phone gets the whole
 * record at once and gives up the column alignment it could not have anyway.
 */
function QueueCards({
  rows,
  now,
  onOpen,
  emptyCopy,
  lineLogos,
}: {
  rows: EmptyReturnRecord[];
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
  emptyCopy: string;
  lineLogos: Map<string, string | null>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card-nested border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
        {emptyCopy}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((record) => (
        /* A `div`, not a `button`: this card carries the row's own action
           button inside it, and a button inside a button is invalid HTML that
           browsers resolve by dropping one of them. Keyboard parity is kept by
           hand — the role, the tab stop, and Enter/Space. */
        <div
          key={record.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(record.id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(record.id);
            }
          }}
          className="cursor-pointer rounded-card-nested border border-border bg-card p-3 transition-colors hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {/* The status chip rides beside the number, and the route gets the
              card's whole width underneath it — sharing a line with the chip
              squeezed two place names into half a phone. */}
          <div className="flex items-center justify-between gap-2">
            {/* Sized up from the table's own 12/14px: on a phone this pair is
                the headline of the card, not a cell in a grid of them, and it
                is what the operator is scrolling to find. */}
            {/* The same combined mark the table row carries, one step larger:
                on a phone this pair is the headline of the card. */}
            {/* The same mark the table row carries, one step larger: on a
                phone this is the headline of the card. */}
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-dashed border-container-empty-border bg-container-empty px-2.5 py-1.5 text-white">
              <ContainerIcon className="size-4 shrink-0" aria-hidden />
              <span className="shrink-0 text-[11px] font-extrabold uppercase leading-none tracking-wider">
                Empty:
              </span>
              <Mono className="truncate text-base font-bold leading-none">
                {record.container || record.bookingReference}
              </Mono>
            </span>
            <StageChip record={record} />
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span
              className="min-w-0 truncate"
              title={`Pickup — the empty is standing at ${record.locationName}`}
            >
              {record.locationName}
            </span>
            <ArrowRight className="size-3 shrink-0 opacity-60" aria-hidden />
            <span
              className="min-w-0 truncate font-semibold text-foreground"
              title={`Drop off — it owes a return to ${record.returnDepot}`}
            >
              {record.returnDepot}
            </span>
          </div>

          {/* The clock and what it is costing, ruled off from the identity: on a
              phone this is the half of the card that decides anything. */}
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-border-subtle pt-3">
            <DecisionWindow record={record} now={now} />
            <RiskBadge risk={riskOf(record, now)} />
          </div>

          {/* Two companies, and until now nothing saying which was which — a
              shipping line and a haulier sat side by side as two logos and two
              names, and the reader had to already know the industry to tell
              them apart. The table above them has column headers doing this
              job; the cards had dropped them along with the header row. */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
            <div className="min-w-0">
              <dt className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Shipping line
              </dt>
              <dd className="mt-0.5 min-w-0">
                <LineName name={record.line} logo={lineLogos.get(record.line) ?? undefined} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                Transporter
              </dt>
              <dd className="mt-0.5 min-w-0">
                <CompanyName name={record.transporter} className="min-w-0" />
              </dd>
            </div>
          </dl>

          {/* Full width and last. Right-aligned on its own line it read as an
              afterthought floating in the corner; it is the point of the card.
              Omitted entirely when there is nothing to do — the header chip has
              already said "Paired". */}
          {hasAction(record) && (
            <div className="mt-3 [&>button]:w-full">
              <NextAction record={record} now={now} onOpen={onOpen} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------- */

/**
 * Each column wears the icon of the thing it holds.
 *
 * Not decoration: seven columns of small uppercase text are hard to re-find
 * after scrolling a long band, and the glyph is what the eye actually
 * remembers — it is the same reason a spreadsheet header gets a type marker.
 */
/* The shares are `table-fixed` widths, and they are set from what each column
   cannot shrink below rather than from how important it looks. The chips and
   the button do not truncate — a half-printed "Deadline Prot…" is worse than a
   narrower column next door — so Status, Decision window and Risk are sized to
   hold their longest label whole, and Container and Transporter, whose text
   truncates gracefully with the full value on hover, give up the difference. */
const COLUMNS = [
  { label: 'Container', icon: ContainerIcon, width: 'w-[21%]' },
  { label: 'Shipping line', icon: Ship, width: 'w-[12%]' },
  { label: 'Status', icon: Activity, width: 'w-[13%]' },
  { label: 'Transporter', icon: Truck, width: 'w-[12%]' },
  { label: 'Decision window', icon: Timer, width: 'w-[14%]' },
  { label: 'Risk', icon: AlertTriangle, width: 'w-[16%]' },
  { label: 'Next action', icon: Zap, width: 'w-[12%]' },
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
  /* Resolved once for the whole band, not once per row: the hook publishes every
     line's mark into the company registry as a side effect, and forty rows
     asking for that is thirty-nine registrations nobody needs. */
  const lines = useShippingLines();
  const lineLogos = useMemo(
    () => new Map(lines.map((line) => [line.name, line.logoUrl])),
    [lines],
  );

  return (
    /* A CONTAINER query, not a viewport one. `lg:` measures the browser window,
       but this table lives in the main column with a 220px sidebar beside it —
       so on a 1200px screen the table was handed 982px, decided it was "large",
       and then scrolled sideways inside its own 1024px minimum. The switch has
       to be made on the width the table actually gets.

       68rem, because the seven columns' unshrinkable content — two chips, a
       badge and a button, none of which can truncate without lying — measured
       1065px. Below that the cards are not a downgrade, they are the layout
       that fits. */
    <div className="@container/band w-full min-w-0">
      <div className="@[64rem]/band:hidden">
        <QueueCards
          rows={rows}
          now={now}
          onOpen={onOpen}
          emptyCopy={emptyCopy}
          lineLogos={lineLogos}
        />
      </div>

      {/* No `min-w`. The table renders only where its seven columns fit, so
          there is nothing to drag: the cells truncate into the width they are
          given. `w-0 min-w-full` keeps it from setting its own intrinsic width
          as a flex child, and `overflow-x-auto` stays as a last-resort net that
          should never fire. */}
      <div className="hidden w-0 min-w-full overflow-x-auto rounded-card-nested border border-border bg-card @[64rem]/band:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          {/* Ruled between columns, not just between rows. Seven columns of
              numbers and codes need vertical guides or the eye slides sideways
              two cells while tracking a row — the same reason a ledger is
              ruled both ways. `type-label` puts the headings on the system's
              own label style instead of a hand-set 10px. */}
          <tr className="border-b border-border bg-surface-sunken text-muted-foreground [&>th]:border-r [&>th]:border-border-subtle [&>th:last-child]:border-r-0">
            {COLUMNS.map((head) => (
              <th
                key={head.label}
                className={cn(
                  'type-label whitespace-nowrap px-2.5 py-2.5 text-left align-middle',
                  head.width,
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <head.icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                  {head.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr
              key={record.id}
              onClick={() => onOpen(record.id)}
              className="cursor-pointer border-b border-border-subtle transition-colors last:border-0 hover:bg-surface-sunken/60 [&>td]:border-r [&>td]:border-border-subtle [&>td:last-child]:border-r-0"
            >
              <td className="px-2.5 py-3 align-middle">
                <ContainerIdentity record={record} />
              </td>

              <td className="px-2.5 py-3 align-middle">
                <LineName name={record.line} logo={lineLogos.get(record.line) ?? undefined} />
              </td>

              <td className="px-2.5 py-3 align-middle">
                <StageChip record={record} />
              </td>

              <td className="px-3 py-3 align-middle text-xs">
                <CompanyName name={record.transporter} className="min-w-0" />
              </td>

              <td className="px-2.5 py-3 align-middle">
                <DecisionWindow record={record} now={now} />
              </td>

              <td className="px-2.5 py-3 align-middle">
                <RiskBadge risk={riskOf(record, now)} />
              </td>

              <td className="px-2.5 py-3 align-middle">
                <NextAction record={record} now={now} onOpen={onOpen} dense />
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-2.5 py-10 text-center text-sm text-muted-foreground"
              >
                {emptyCopy}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One urgency band
 * ------------------------------------------------------------------------- */

export interface ContainerQueueTableProps {
  /** Omitted when the caller names the band elsewhere — the Control Tower's
      tab bar does, so repeating it above the rows was the same words twice. */
  title?: string;
  /** Class for the band's own heading colour. */
  tone?: string;
  /** What this band is made of — printed beside the count, where the rows are. */
  note?: string;
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
  note,
  rows,
  now,
  onOpen,
  collapsible = false,
  emptyCopy,
  resetKey,
}: ContainerQueueTableProps) {
  /* A foldable band starts folded: stacked open, "On track" sat below the whole
     of "Action required" and you had to scroll the page to the end to find out
     it was even there. Folded, both headings are on the first screen and the
     one you want is one click away. */
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
      {/* No title, no heading row. A caller that names the band elsewhere — the
          Control Tower's tab bar does — would otherwise get an empty 20px strip
          above its rows where the words used to be. */}
      {title && (
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
          <h2 className={cn('text-[11px] font-extrabold uppercase tracking-widest', tone)}>
            {title}
          </h2>
          <Mono className="text-[11px] font-bold text-muted-foreground">{rows.length}</Mono>
          {note && <span className="type-body-xs truncate text-muted-foreground">· {note}</span>}
        </button>
      )}

      {(!collapsible || open) && body}
    </section>
  );
}

export default ContainerQueueTable;
