import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * DataTable
 * ---------------------------------------------------------------------------
 * The app's one list-of-records surface, generalised out of the Empty Container
 * Control Tower's queue on 2026-08-30.
 *
 * ## Why a table at all, when the house idiom is cards
 *
 * A directory is a *comparison* surface. Someone scanning forty shippers is
 * asking "which of these is which, and which one do I want" — that is a
 * question about columns lining up, and a stack of cards answers it badly:
 * every value sits at a different x, so the eye has to re-find each field on
 * every row. Browse surfaces stay cards; lists you compare become this.
 *
 * ## The rule that makes it responsive without a drag
 *
 * The table renders **only at widths where all of its columns fit**, measured
 * with a container query on the width the table is actually handed rather than
 * on the viewport — the two differ by the whole sidebar. Below that it renders
 * the same records as cards. There is no horizontal scrolling in either mode
 * and no `min-width`: a row you have to drag sideways to finish reading is a
 * row you cannot compare, which was the only thing the table was for.
 *
 * Columns therefore declare a **width share** and a **card slot**, and the two
 * renderings read the same `cell` functions, so they can never drift apart.
 * ------------------------------------------------------------------------- */

/**
 * The widths the table is allowed to appear at, spelled out so Tailwind can
 * see them. Add a size here rather than passing an arbitrary one.
 */
export type DataTableBreakpoint = '40rem' | '48rem' | '56rem' | '64rem' | '72rem';

const BREAKPOINTS: Record<DataTableBreakpoint, { cards: string; table: string }> = {
  '40rem': { cards: '@[40rem]/list:hidden', table: '@[40rem]/list:block' },
  '48rem': { cards: '@[48rem]/list:hidden', table: '@[48rem]/list:block' },
  '56rem': { cards: '@[56rem]/list:hidden', table: '@[56rem]/list:block' },
  '64rem': { cards: '@[64rem]/list:hidden', table: '@[64rem]/list:block' },
  '72rem': { cards: '@[72rem]/list:hidden', table: '@[72rem]/list:block' },
};

export interface DataColumn<T> {
  /** Stable key — also the React key for the cell. */
  key: string;
  /** Column heading. Also the card's field label unless `cardLabel` says otherwise. */
  label: string;
  /** The heading's glyph. Seven columns of small uppercase text are hard to
      re-find after scrolling; the glyph is what the eye actually remembers. */
  icon?: ComponentType<{ className?: string }>;
  /** `table-fixed` share, e.g. `w-[22%]`. Sized from what the column cannot
      shrink below, not from how important it looks. */
  width?: string;
  cell: (row: T) => ReactNode;
  /**
   * Where this column goes on a card.
   * - `identity` — the card's headline, rendered bare at the top.
   * - `meta` — a labelled field in the card's two-column grid (the default).
   * - `trailing` — pinned opposite the identity, for a status chip.
   * - `action` — full width at the foot of the card.
   * - `hidden` — table only.
   */
  card?: 'identity' | 'meta' | 'trailing' | 'action' | 'hidden';
  /** Overrides `label` for the card's field label. */
  cardLabel?: string;
  /**
   * Cell alignment. `right` for numbers and actions, `center` for a column
   * whose whole content is one control — a selection checkbox, typically,
   * which looks dropped rather than placed when it sits against the left
   * padding of a column two or three times its width. The heading follows the
   * cell for `center` only, because a centred control needs its own control
   * centred over it; `right` headings stay left, see the note on the `th`.
   */
  align?: 'left' | 'right' | 'center';
  /**
   * Replaces the heading's text with a control — a select-all checkbox in a
   * selection column, typically.
   *
   * Without it a selection column has to ship a blank `th`, which reads as an
   * unfinished table rather than as a column whose heading is a control. The
   * `label` is still required and still used as the card's field label and as
   * the accessible name, so a column is never nameless.
   */
  header?: ReactNode;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyCopy: string;
  /** Offered inside the empty state — a "clear filters" escape, typically.
      The list owns its own emptiness; a second panel below it saying the same
      thing is the page telling you twice. */
  emptyAction?: ReactNode;
  /**
   * Container width at which the table replaces the cards. Measure the columns'
   * unshrinkable content and pick the next size up: too low and the table
   * scrolls, too high and cards show where a table would have fitted.
   *
   * A closed set rather than a free string because Tailwind cannot see a class
   * it never reads as a literal — an interpolated `@[${size}]/list:hidden`
   * compiles to nothing and the table would render at every width.
   */
  breakpoint: DataTableBreakpoint;
  /**
   * Draws the sub-breakpoint card, instead of the one assembled from the
   * columns' `card` slots.
   *
   * For a list that already *had* a card before it had a table. The generated
   * card is a good default — a headline, a grid of labelled fields — but it
   * cannot reproduce a designed one, and the Shipments list has a designed one:
   * a status-coloured corner badge carrying the reference, a tinted route
   * strip, the progress figure stacked over its chip. Rebuilding that out of
   * column slots would have meant redesigning the card in order to add a table,
   * which is the opposite of the trade.
   *
   * The columns are still the single source of truth for the *table*; this only
   * replaces the narrow rendering. `onRowClick` is not applied on top of it —
   * a designed card wires its own click, and wrapping it would double-fire.
   */
  renderCard?: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyCopy,
  emptyAction,
  breakpoint,
  renderCard,
  className,
}: DataTableProps<T>) {
  const identity = columns.find((column) => column.card === 'identity');
  /* More than one column can be trailing — a status chip and a row menu both
     belong at the card's top right, beside the name rather than below it. */
  const trailing = columns.filter((column) => column.card === 'trailing');
  const action = columns.find((column) => column.card === 'action');
  const meta = columns.filter(
    (column) => (column.card ?? 'meta') === 'meta' && column !== identity,
  );

  const { cards: cardsHidden, table: tableShown } = BREAKPOINTS[breakpoint];

  return (
    <div className={cn('@container/list w-full min-w-0', className)}>
      {/* ── CARDS ── every field of one record, no scrolling, on any phone. */}
      <div className={cn(renderCard ? 'space-y-3.5' : 'space-y-2', cardsHidden)}>
        {rows.length === 0 ? (
          <EmptyRow copy={emptyCopy} action={emptyAction} />
        ) : renderCard ? (
          rows.map((row) => <div key={rowKey(row)}>{renderCard(row)}</div>)
        ) : (
          rows.map((row) => (
            /* A `div`, not a `button`: a card carries the row's own action
               button, and a button inside a button is invalid HTML that
               browsers resolve by dropping one of them. Keyboard parity is
               kept by hand — the role, the tab stop, and Enter/Space. */
            <div
              key={rowKey(row)}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                '@container/card rounded-card-nested border border-border bg-card p-3 transition-colors',
                onRowClick &&
                  'cursor-pointer hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              )}
            >
              {(identity || trailing.length > 0) && (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">{identity?.cell(row)}</div>
                  {trailing.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {trailing.map((column) => (
                        <div key={column.key}>{column.cell(row)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {meta.length > 0 && (
                /* As many pairs per line as the card is wide enough to hold.
                   Two even on a phone: one field per line turned a card into a
                   six-line tower of near-identical "7 vehicles / 7 drivers"
                   rows, and a card you scroll is not a card. Two columns at
                   340px still leaves each field ~150px, which every cell here
                   fits. Three once the card is wide enough that two would
                   strand a field in the middle of a rule. The query is on the card, not the viewport:
                   the same card renders at 340px in a phone and at 800px in a
                   sidebar-narrowed column on the same machine.

                   The label sits **above** its value, not opposite it. Pushing
                   the two to opposite ends only ever worked while every value
                   was one short line; a cell that stacks — "7 vehicles / 7
                   drivers", a star over its mission count — left the label
                   floating against the top of a two-line block with a gulf
                   between them, and the `truncate` that held the row together
                   clipped the second line. Stacked, a field is one object, the
                   figures share a left edge the eye can run down, and no cell
                   has to be single-line to fit. */
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 @[34rem]/card:grid-cols-3">
                  {meta.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {column.cardLabel ?? column.label}
                      </dt>
                      <dd className="mt-1 min-w-0">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {action && (
                /* Full width and last. Right-aligned on its own line an action
                   reads as an afterthought floating in the corner; it is the
                   point of the card. */
                <div className="mt-3 border-t border-border-subtle pt-3 [&>button]:w-full">
                  {action.cell(row)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── TABLE ── the comparison surface, only where its columns fit. */}
      <div
        /* `overflow-hidden` is what makes the corners round.
           The frame has always had a radius, but the header row paints an
           opaque tinted band edge to edge and a `<tr>` has no corners of its
           own — so it filled the curve square and the table read as a sharp
           box with a rounded outline drawn over it. Clipping the contents is
           the fix rather than rounding the first and last `th`, because the
           last row's border needs the same treatment at the bottom and would
           otherwise need its own pair of corner classes.
           Safe against the row controls: the ⋮ menu and the column tooltips
           both render through a Radix portal, so neither is clipped by this. */
        className={cn(
          'hidden w-0 min-w-full overflow-hidden rounded-card-nested border border-border bg-card',
          tableShown,
        )}
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            {/* Ruled between columns, not just between rows. Columns of numbers
                and codes need vertical guides or the eye slides sideways two
                cells while tracking a row — the same reason a ledger is ruled
                both ways. */}
            {/* Tinted with the brand rather than grey. The header is the one
                row that is not data, and a grey band above grey labels left
                nothing separating the table's frame from its contents. */}
            <tr className="border-b border-primary/15 bg-primary-subtle text-primary-subtle-foreground [&>th]:border-r [&>th]:border-primary/10 [&>th:last-child]:border-r-0">
              {columns.map((column) => (
                <th
                  key={column.key}
                  /* Always left. Headings that follow their column's own
                     alignment put one label at the left edge and its neighbour
                     at the right, and the row stops reading as a single band of
                     headings. The cells still align however they like. */
                  /* Wraps rather than overflows. The table is `table-fixed`
                     with percentage widths, so a `whitespace-nowrap` heading
                     wider than its share does not widen the column — it spills
                     across the rule into its neighbour, which is what a long
                     heading like "Returned on time" did at anything below a
                     wide desktop. Two short lines inside the cell is the
                     correct answer; `align-bottom` keeps a wrapped heading
                     sitting on the same baseline as its single-line siblings. */
                  /* `py-3.5`, not `py-2.5`. The header is the table's frame
                     and it was the shortest row in it — a thin tinted stripe
                     that read as a rule with words in it rather than as a band
                     the columns hang from. The extra height is what makes it
                     look deliberate beside the 44px data rows. */
                  className={cn(
                    'type-label px-2.5 py-3.5 align-bottom',
                    column.align === 'center' ? 'text-center' : 'text-left',
                    column.width,
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center gap-2 leading-tight',
                      column.align === 'center' && 'justify-center',
                    )}
                  >
                    {/* A control in place of the words, when the column has
                        one. The label survives as the accessible name. */}
                    {/* `size-4` at 90%. At 3.5 and 70% the glyph was smaller
                       than the 10px capitals beside it and washed halfway into
                       the tinted band — and this glyph is the thing a reader
                       actually re-finds a column by after scrolling, which is
                       the whole reason it is there. */}
                    {column.header ?? (
                      <>
                        {column.icon && <column.icon className="size-4 shrink-0 opacity-90" />}
                        {/* `truncate`, so a heading wider than its column ends
                            in an ellipsis instead of being sliced mid-letter
                            and running into its neighbour. It is a safety net,
                            not a licence: a clipped heading still means the
                            column is too narrow, and the fix is the width. */}
                        <span className="min-w-0 truncate">{column.label}</span>
                      </>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-border-subtle transition-colors last:border-0',
                  '[&>td]:border-r [&>td]:border-border-subtle [&>td:last-child]:border-r-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-sunken/60',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-2.5 py-3 align-middle',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2.5 py-12 text-center">
                  <p className="text-sm text-muted-foreground">{emptyCopy}</p>
                  {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyRow({ copy, action }: { copy: string; action?: ReactNode }) {
  return (
    <div className="rounded-card-nested border border-border bg-card px-3 py-12 text-center">
      <p className="text-sm text-muted-foreground">{copy}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
