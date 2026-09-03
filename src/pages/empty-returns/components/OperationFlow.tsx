import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import {
  ArrowLeftRight,
  ArrowRight,
  ExternalLink,
  MapPin,
  Package,
  RotateCcw,
  Warehouse,
} from '@/design-system/icons';
import { cn } from '@/utils';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

import { ContainerCard } from './ContainerCard';
import { Mono } from './marks';

/**
 * One container's whole story in three steps: where it came from, where it is,
 * what happens next.
 *
 * This is the diagram the product turns on, so it is drawn rather than
 * described. Read left to right:
 *
 * ```
 *   [ FULL  COSU4497024 ]  ──unloaded──▶  [ EMPTY  COSU4497024 ]  ──paired──▶  [ FULL  CMAU2376957 ]
 *      ▣ 813834                                📍 UKAB Free Zone                  ▣ 375792
 * ```
 *
 * The first arrow is thin and neutral: same container, new state. The second is
 * the pairing connector and is labelled *different container* in as many words,
 * because the single most damaging misreading of this product is believing the
 * empty box becomes the next full box. It does not. It travels *with* a
 * different full-load operation so the empty leg is not driven on its own.
 *
 * ## Three shapes, and the eye lands on them first
 *
 * The boxes are the anchor. Every step is the same column — caption, box, one
 * line — so the three read as one strip rather than three arrangements.
 *
 * It took four goes, and the three failures are the whole design:
 *
 *  1. The facts were INSIDE the box. The shape then grew and shrank with its
 *     text, so three steps in a row were three different objects and none of
 *     them read as a container.
 *  2. They came out, but as a three-row label/value table per step. In a 176px
 *     column `24/07/2026 · 07:15` broke over two lines, and a stamp in two
 *     pieces reads as two figures. Nine wrapping rows of 10px grey is a wall
 *     with nothing in it to look at first.
 *  3. The stamps were shortened, which fixed the wrap and not the wall.
 *
 * ## No clock on this strip at all
 *
 * Every timestamp here already existed, ordered and labelled, in the dialog's
 * Activity log a few hundred pixels below — the flow was a second, worse
 * telling of it, with the events split across three columns so no two could be
 * compared. So the times went to Activity (which gained the paired load's
 * pickup, the one event it was missing) and each step keeps the single fact
 * Activity cannot carry: *which shipment, which place, which depot*.
 *
 * One line, led by a glyph rather than a label. At this size a word like
 * "Shipment" costs a third of the row to say what a package mark says for free
 * — and it is the glyphs that let the three lines scan as a set.
 */

/**
 * Three layouts, two breakpoints.
 *
 * A row of three cards needs 176 × 3 plus two connectors — about 650px — and a
 * dialog on a phone has 340. One breakpoint was not enough: between the two
 * there is a wide band (a tablet, a narrow laptop, this dialog at 716px) where
 * the strip stacked and the cards, told to fill their column, came out 600px
 * wide and 69px tall. A container card that long stops reading as a container.
 *
 *   < 26rem   everything stacked, cards fill the column
 *   26–40rem  the bracket's two legs pair up; the third group sits below them
 *   ≥ 40rem   all three across, one row
 *
 * The middle step is the one that matters: two legs plus their connector need
 * only ~410px, so the pair can go side by side long before the whole strip can.
 */
/** A container card's height, so the one card that is not a container matches it. */
const CARD_H = 'h-[4.25rem]';

function Leg({
  children,
  icon: Icon,
  /** Names the glyph for a screen reader and on hover — see the note above. */
  factLabel,
  fact,
}: {
  children: ReactNode;
  icon: typeof Package;
  factLabel: string;
  fact: ReactNode;
}) {
  return (
    /* A fixed width, not a flex share.
       Shares looked right and measured wrong: the bracket holds two legs plus a
       connector plus its own inset, the group beside it holds one leg, and no
       ratio of 2:1 makes those come out equal — the lone card measured 193px
       against the bracketed pair's 168. The card has a width of its own; the
       leg takes it, and the row distributes what is left over as space. */
    /* 176px, always — not `w-full` with a breakpoint to rein it back in.
       The elastic version had the card fill its column when the strip was
       stacked, which is right on a 340px phone and wrong at every width above
       it: a container 500px long and 69px tall stops reading as a container.
       It also made the shape depend on a container-query variant firing, and
       when one did not the card silently stretched with nothing to catch it.
       A shipping container is a fixed size. So is this. */
    <div className="w-44 min-w-0 shrink-0">
      {children}
      <div className="mt-2 flex items-center gap-1.5 text-2xs" title={factLabel}>
        <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{fact}</span>
        <span className="sr-only">{factLabel}</span>
      </div>
    </div>
  );
}

/**
 * One physical container and everything true of it, inside one frame.
 *
 * The bracket is the point. Read as three loose cards this strip said there
 * were three containers here, and there are two: the first two cards are one
 * box before and after it was stripped — same number, printed twice — and only
 * the third is a different box. That is the single most damaging misreading
 * this module can produce, and a frame around the pair settles it before a word
 * is read. It is the same bracket the chain strip on Cycles draws, for the same
 * reason and in the same shape.
 */
function Group({
  caption,
  bracket = false,
  className,
  children,
}: {
  caption: string;
  bracket?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 truncate text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        {caption}
      </div>
      <div
        className={cn(
          /* `rounded-lg`, and it has to be a rung that exists.
             This was `rounded-xl`, which is not on the app's radius ladder —
             `--radius-*: initial` in index.css clears Tailwind's own scale, so a
             rung the theme does not define compiles to NOTHING rather than to a
             fallback. The bracket had square corners around cards with 16px
             ones, and nothing anywhere said so. `lg` is the ladder's top step.

             The padding and the border box are on BOTH branches, visible on
             one. Without them the unbracketed card sat eight pixels higher than
             the two inside the frame — the bracket's own inset — and the strip
             stopped reading as one row of boxes. */
          /* The LEGS stack below the breakpoint as well as the groups. Only
             the groups did, so a 176px card + arrow + 176px card stayed a
             392px row inside a 340px dialog and the empty box ran off the
             right edge with nothing to say so. */
          'flex flex-col items-stretch gap-2 rounded-lg border p-2',
          '@[26rem]/flow:flex-row @[26rem]/flow:items-start',
          bracket
            ? 'border-dashed border-border-strong/50 bg-surface-sunken/40'
            : 'border-transparent',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A connector, on the cards' own centre line.
 *
 * The arrow sits in a box exactly one card tall and the word sits BELOW it, in
 * the same row the legs put their fact line. Both halves matter:
 *
 *  - The word used to be stacked under the arrow *inside* that box, and
 *    centring the pair put the glyph six pixels above the cards it joins — a
 *    connector that visibly does not point at anything. Twelve pixels out on
 *    the one between the groups, which also had a caption to clear.
 *  - On the fact row it lands on the same baseline as `669371` and
 *    `UKAB Free Zone`, so the strip reads on two lines rather than five.
 *
 * The caption above the groups is reproduced here as an invisible twin rather
 * than approximated with a padding value — the same trick, and for the same
 * reason, as the chain strip's ghost `LinkHeader`. A guessed offset drifts the
 * moment the caption's size or margin moves.
 */
function Connector({
  label,
  sub,
  tone = 'quiet',
  /**
   * WHICH row this connector belongs to, and therefore which breakpoint turns
   * it sideways.
   *
   * `leg` sits between the two halves of one container and goes horizontal as
   * soon as those two pair up. `group` sits between whole groups and cannot go
   * horizontal until the entire strip does — it also has a group caption and a
   * bracket inset to clear, which the leg connector does not. Written as two
   * literal class sets rather than composed from the breakpoint constants,
   * because Tailwind scans source text and never sees an interpolated variant.
   */
  scope,
  children,
}: {
  label: string;
  sub?: string;
  tone?: 'quiet' | 'loud';
  scope: 'leg' | 'group';
  children: ReactNode;
}) {
  const group = scope === 'group';
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col self-center',
        group ? '@[40rem]/flow:self-start' : '@[26rem]/flow:self-start',
      )}
    >
      {/* Stacked, there is nothing to the side to line up with, so the ghost
          collapses rather than opening twenty pixels of nothing. */}
      {group && (
        <div className="invisible mb-1.5 hidden text-2xs @[40rem]/flow:block" aria-hidden>
          &nbsp;
        </div>
      )}
      {/* A connector standing BETWEEN two groups has to clear a group's whole
          chrome, not just its caption: the body below that caption carries a
          1px border and 8px of padding before its first card. Reproducing the
          box rather than adding nine pixels of guess is the difference between
          this staying aligned and drifting the next time the bracket's inset
          changes — which is exactly how it came to be nine pixels out. */}
      <div
        className={cn(
          'flex flex-col',
          group && '@[40rem]/flow:border @[40rem]/flow:border-transparent @[40rem]/flow:p-2',
        )}
      >
        {/* A card's height is reserved only once this connector's neighbours
            are side by side, where the arrow has to sit on their centre line.
            Stacked it is just an arrow between two things, and reserving 68px
            for it left a hole you could see. */}
        <div
          className={cn(
            'flex items-center justify-center px-2 py-1',
            group ? `@[40rem]/flow:h-[4.25rem] @[40rem]/flow:py-0` : `@[26rem]/flow:h-[4.25rem] @[26rem]/flow:py-0`,
          )}
        >
          {children}
        </div>
        <div className={cn('mt-1 px-1 text-center', group ? '@[40rem]/flow:mt-2' : '@[26rem]/flow:mt-2')}>
          <div
            className={cn(
              'text-[8px] font-bold uppercase leading-none tracking-wide',
              tone === 'loud' ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {label}
          </div>
          {sub && (
            <div className="mt-px whitespace-nowrap text-[7px] leading-none text-muted-foreground">
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A shipment reference you can actually open.
 *
 * Both full legs get this. The delivered load had it and the paired load did
 * not — same kind of card, same kind of reference, one clickable and one plain
 * — so the strip read as though the paired shipment were a different sort of
 * thing with no page behind it. It has the same page.
 *
 * Keyed by the REFERENCE, not an id. An earlier version passed the uuid, and
 * `/shipments/<uuid>` renders a live page titled `53efcf7d-26b9-…` — the
 * overview resolves by reference, which is what every other link to it in the
 * app passes. It failed quietly, so it looked like it worked.
 */
function ShipmentLink({ reference }: { reference?: string | null }) {
  if (!reference) return <Mono>—</Mono>;
  return (
    <Link
      to={buildPath(ROUTES.shipmentOverview, { id: reference })}
      className="inline-flex min-w-0 max-w-full items-center gap-1 text-primary underline underline-offset-2 transition-opacity duration-fast hover:opacity-80"
    >
      <Mono className="truncate font-bold">{reference}</Mono>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

/** Same container, new state. Deliberately quiet — nothing changed hands here. */
function UnloadArrow() {
  return (
    <Connector label="Unloaded" scope="leg">
      <ArrowRight
        className="size-4 rotate-90 text-border-strong @[26rem]/flow:rotate-0"
        aria-hidden
      />
    </Connector>
  );
}

/** Two different containers, linked. The label is the whole point of the mark. */
function PairArrow() {
  return (
    <Connector label="Paired" sub="different container" tone="loud" scope="group">
      <ArrowLeftRight className="size-4 rotate-90 text-primary @[40rem]/flow:rotate-0" aria-hidden />
    </Connector>
  );
}

/**
 * What happened after the box was stripped, when nothing was paired to it.
 *
 * This used to be a second `UnloadArrow`, which put the word UNLOADED between
 * the empty box and the depot it went back to — nothing is unloaded there, and
 * the box had already been unloaded one arrow earlier. Each branch names its
 * own hand-off.
 */
function ThenArrow({ label }: { label: string }) {
  return (
    <Connector label={label} scope="group">
      <ArrowRight
        className="size-4 rotate-90 text-border-strong @[40rem]/flow:rotate-0"
        aria-hidden
      />
    </Connector>
  );
}

/**
 * The one step that is not a container.
 *
 * Every other step in this strip draws the box — including the planned return,
 * which is the same container still sitting empty. This branch is the exception
 * because there is genuinely nothing to draw: no load has been found and no
 * return has been booked, so the card is the shape of the decision that has not
 * been made, in the same footprint as the boxes beside it.
 */
function PlainCard({
  tone,
  label,
  headline,
}: {
  tone: 'return' | 'undecided';
  label: string;
  headline: string;
}) {
  return (
    <div
      className={cn(
        /* The container card's own footprint, so a row that mixes the two still
           lines up on one baseline. */
        CARD_H,
        'w-44 shrink-0 overflow-hidden rounded-lg px-3 py-2',
        tone === 'return'
          ? 'border-2 border-warning bg-warning-subtle text-warning-subtle-foreground'
          : 'border-2 border-dashed border-border-strong bg-surface-sunken text-muted-foreground',
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest">
        {tone === 'return' && <RotateCcw className="size-3 shrink-0" aria-hidden />}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-bold leading-tight">{headline}</div>
    </div>
  );
}

export interface OperationFlowProps {
  record: EmptyReturnRecord;
  now: number;
  className?: string;
}

export function OperationFlow({ record, className }: OperationFlowProps) {
  const next = record.nextFull;
  const returned = record.stage === 'closed';
  const planning = record.stage === 'return_planned';

  return (
    /* Stacks below 40rem instead of scrolling sideways. The bracket alone wants
       ~380px and the paired box another ~190, and inside a dialog on a phone
       there are 340. Sideways was the old answer and it hid the last box — the
       one that says what happens next — behind a drag nobody performs. The
       query is on the flow itself, not the viewport: this strip is dropped into
       a dialog, a row card and a page, each of which hands it a different width
       at the same screen size. */
    <div className={cn('@container/flow', className)}>
      <div className="flex flex-col items-stretch gap-3 @[40rem]/flow:flex-row @[40rem]/flow:items-start @[40rem]/flow:justify-between @[40rem]/flow:gap-0">
        {/* ── ONE BOX, TWO STATES ── */}
        <Group
          caption="This container"
          bracket
          /* Two legs to the other group's one, so every card in the strip comes
             out the same width. */
          >
          <Leg
            icon={Package}
            factLabel="Shipment that brought this container in"
            fact={<ShipmentLink reference={record.shipmentReference ?? record.prevLoad} />}
          >
            <ContainerCard
              state="full"
              container={record.container}
              line={record.line}
              size={record.size}
            />
          </Leg>

          <UnloadArrow />

          <Leg
            icon={MapPin}
            factLabel="Where the empty is sitting"
            fact={record.locationName || '—'}
          >
            <ContainerCard
              state="empty"
              container={record.container}
              line={record.line}
              size={record.size}
            />
          </Leg>
        </Group>

        {next ? (
          <PairArrow />
        ) : (
          <ThenArrow label={returned ? 'Returned' : planning ? 'Planned' : 'Then'} />
        )}

        {/* ── THE OTHER BOX, or where this one went ── */}
        {next ? (
          <Group caption="A different container">
            <Leg
              icon={Package}
              /* The SAME fact the first leg carries, because it is the same kind
                 of card: a full box under a shipment. Two cards of one kind that
                 answer two different questions read as arbitrary. */
              factLabel="Shipment the empty travels out under"
              fact={<ShipmentLink reference={next.shipmentReference} />}
            >
              <ContainerCard
                state="full"
                container={next.container}
                line={next.line}
                size={next.size}
              />
            </Leg>
          </Group>
        ) : returned ? (
          <Group caption="Back at the depot">
            <Leg icon={Warehouse} factLabel="Depot the box went back to" fact={record.returnDepot || '—'}>
              {/* Still the same box, home — grey is the container scale's third
                  state, not a fourth kind of object. */}
              <ContainerCard
                state="returned"
                container={record.container}
                line={record.line}
                size={record.size}
              />
            </Leg>
          </Group>
        ) : planning ? (
          <Group caption="Return planned">
            <Leg
              icon={Warehouse}
              factLabel="Depot the box is going back to"
              fact={record.returnDepot || '—'}
            >
              {/* The container, not a tile about it.
               *
               * This drew a plain amber card naming the depot, which made it the
               * one step in the strip that was not a box — and the depot was
               * already on the fact line right under it, so the card said
               * nothing the row did not.
               *
               * It is the SAME container, still empty: it has not gone back yet,
               * which is the whole meaning of "planned". So it wears the empty
               * amber every other empty box wears, and the caption above plus
               * the word on the card carry the "not yet". */}
              <ContainerCard
                state="empty"
                label="Going back"
                container={record.container}
                line={record.line}
                size={record.size}
              />
            </Leg>
          </Group>
        ) : (
          <Group caption="Next decision">
            <Leg
              icon={ArrowLeftRight}
              factLabel="What can happen next"
              fact="A full load, or an empty return"
            >
              <PlainCard tone="undecided" label="Undecided" headline="Nothing chosen yet" />
            </Leg>
          </Group>
        )}
      </div>
    </div>
  );
}
