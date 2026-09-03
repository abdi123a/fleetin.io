import type { ReactNode } from 'react';

import { Button, Card } from '@/design-system';
import { AlertTriangle, ArrowLeftRight, CheckCircle2 } from '@/design-system/icons';
import { formatContainerSize } from '@/data/emptyReturnData';
import { formatSpan, formatStamp } from '@/stores/emptyReturn.store';
import type { PairingSuggestion, SuggestionLabel } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono } from './marks';
import { ContainerCard } from './ContainerCard';

/**
 * One full load a container could travel out under — the same card wherever
 * the offer is made.
 *
 * It lived inside `MatchingPage`, which was fine while Matching was the only
 * place a pairing could be confirmed. The Control Tower now makes the same
 * offer in the container's own dialog, and an operator who has learned to read
 * this card on one screen must not meet a different one on the other. One card,
 * two hosts; the hosts differ in how they FRAME the choice, never in how they
 * draw it.
 */

/* Ink on white, all three.
   These used to be filled chips, which was right when they sat on a pale card
   header and wrong the moment they moved onto the green container: a teal
   `RECOMMENDED` slab on a saturated green ribbing went muddy and stopped
   reading as the most important word on the card. White ground, coloured ink
   and a coloured edge — the same treatment the risk badges opposite needed for
   the same reason. */
const LABEL_STYLE: Record<SuggestionLabel, string> = {
  RECOMMENDED: 'bg-card text-primary-bold border-primary-bold',
  ALTERNATIVE: 'bg-card text-muted-foreground border-border',
  /* Amber, not red: a tight pairing is a real option somebody may have to take,
     and colouring it as a failure pushes them into a worse one. */
  'LAST OPTION': 'bg-card text-stage-returning-subtle-foreground border-stage-returning-border',
};


/**
 * The compatibility checklist — what this particular pairing turns on.
 *
 * The shipping line is **read**, not asserted. It used to be hardcoded to
 * `Same shipping line ✓`, which was safe only while the line was a gate: once
 * it stopped being one (2026-08-30, see `incompatibilityReasons`) a cross-line
 * pairing started reaching this card, and a hardcoded tick would have printed
 * a claim about the paperwork that was simply false. It now says which case it
 * is — and when the lines differ that is a *note*, not a warning, because
 * nothing is wrong: the tone stays with the passing items and only the wording
 * changes.
 *
 * Size and the deadline are still the gates, so those two can be asserted:
 * nothing incompatible on either reaches a suggestion at all.
 */
function CompatChecklist({ suggestion }: { suggestion: PairingSuggestion }) {
  const tight = suggestion.tight;
  const { line: emptyLine } = suggestion.record;
  const { line: loadLine } = suggestion.load;
  const sameLine = Boolean(emptyLine) && emptyLine === loadLine;
  const items: { ok: boolean; label: string }[] = [
    {
      ok: true,
      label: sameLine
        ? 'Same shipping line'
        : `Across lines — ${emptyLine ?? 'unrecorded'} → ${loadLine ?? 'unrecorded'}`,
    },
    { ok: true, label: 'Same container size' },
    { ok: !tight, label: tight ? 'Tight window — under 6h of margin' : 'Pickup beats the deadline' },
  ];
  return (
    /* Chips, not a row of grey text.
     *
     * These are the EVIDENCE for a recommendation — the reason the operator is
     * being asked to trust it — and at 10px with no ground they read as
     * decoration under the card rather than as three findings. On their own
     * subtle fills they read as checks that were run, and the tight-window case
     * separates from the passing ones at a glance instead of only by hue.
     *
     * No `mt-2`. It had one, inside a row that centres its children, which
     * pushed the whole set below the actions' centre line — the misalignment
     * that made this band look unfinished. */
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            item.ok
              ? 'border-stage-closed-border/60 bg-stage-closed-subtle text-stage-closed-subtle-foreground'
              : 'border-stage-returning-border/60 bg-stage-returning-subtle text-stage-returning-subtle-foreground',
          )}
        >
          {item.ok ? (
            <CheckCircle2 className="size-3 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * One datum on a suggestion card — label and value on the SAME line.
 *
 * Stacked was tried and made the card twice as tall as it needed to be: six
 * facts became twelve lines, and a card that is one row of a scannable list
 * cannot afford that. Inline halves the height and still keeps the label, which
 * matters — "4646" and "+3d 18h" mean nothing on their own.
 */
/**
 * One fact, label inline.
 *
 * A ruled label-left/value-right sheet was tried here and reverted: this card
 * is a row in a list the operator scans, and five ruled rows made it three
 * times as tall to align values nobody compares across cards. Height is the
 * scarce resource on this page, not alignment.
 */
function SpecRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-baseline gap-1.5', className)}>
      <dt className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-[11px]">{children}</dd>
    </div>
  );
}

export function SuggestionCard({
  suggestion,
  featured,
  disabled,
  onConfirm,
  onReject,
}: {
  suggestion: PairingSuggestion;
  featured: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { load, score, label, marginMs, tight } = suggestion;

  return (
    <Card
      className={cn(
        /* The other half of the workbench, and the other half of the pairing:
           every card here is a FULL load, so it sits on the full ground. Empty
           on the left, full on the right — the trade the page exists to make is
           legible from across the room.

           Padding lives on the bands below, not here: the card used one `p-4`
           box with everything inside a single column, so the header, the facts
           and the actions all shared one undifferentiated block and the reader
           had to find the structure themselves. */
        /* Every card here is a FULL load, so it sits on the full ground —
           empty on the left, full on the right, and the trade the page exists
           to make is legible from across the room. At full strength: the border
           carried a `/40` and the rules a `/25`, which is what made this side
           look faded next to the other.

           Violet stays the pairing hue and rides on top as the border: a
           pairing is the product's whole point, not a shade of "full". */
        'min-w-0 overflow-hidden rounded-card border bg-container-full-subtle',
        featured
          ? 'border-stage-paired ring-1 ring-stage-paired'
          : 'border-container-full-border',
      )}
    >
      {/* ── WHAT THIS IS ──
          The same box the empty column opposite draws, so the two halves of the
          pairing are the same kind of object. It was a header band of chips and
          text: a full container described in words, facing a column of empty
          containers drawn as containers.

          The card's own word is the RECOMMENDATION, not "Full" — the green
          ground and the package glyph already say full, and which of these to
          take is the only question this side of the page asks. */}
      {/* ── IDENTITY AND FACTS, ONE ROW ──
          The card is 384px and this pane is 630px, so stacking the specs under
          it left a quarter of the band empty beside the container. They sit
          next to it instead: the box keeps the size it has in the yard column
          opposite, and the row has no hole in it. `flex-wrap` drops the specs
          below the card when the pane is too narrow to hold both. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-container-full-border p-2">
        <ContainerCard
          state="full"
          container={load.container}
          /* Line for line, the card the yard column opposite draws:
               state + recommendation  ·  EMPTY + risk
               container number        ·  container number
               shipping line           ·  shipping line
               size · where it loads   ·  size · where it sits
               when it goes            ·  how long it has left
             It carried the size welded onto the shipping line, plus the
             shipment reference and the match score — four kinds of fact in a
             shape whose twin holds one kind, which is why the two never looked
             like the same card. The match and the shipment describe the
             PAIRING, not the box, so they sit with the other pairing facts
             beside it. */
          line={load.line}
          size={load.size}
          scale="list"
          /* The RECOMMENDATION, keeping its own colour.
             Making it the card's header word instead flattened three states
             into one uppercase string on a green ground — RECOMMENDED and
             ALTERNATIVE became indistinguishable, and LAST OPTION lost the
             amber that says "a real option, but a tight one". The `bg-card`
             backing is the same fix the risk badges opposite needed: these
             chips are calibrated against a white page, not against a card. */
          aside={
            <span
              className={cn(
                'rounded-sm border bg-card px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider',
                LABEL_STYLE[label],
              )}
            >
              {label}
            </span>
          }
          /* `basis-[24rem]` so it lands on the SAME 384px the yard column's
             cards do — the component's own `max-w-[24rem]` stops it there and
             the spec list takes whatever is left. Sharing the row as an equal
             flex child made it 313px: no dead space, but a full container a
             different size from every empty one beside it. */
          className="shrink"
        >
          <div className="mt-1 flex min-w-0">
            <span className="fl-container-skin__plate truncate text-[11px] font-medium">
              {formatContainerSize(load.size)} · {load.pickupHub}
            </span>
          </div>
          <div className="mt-1 flex min-w-0">
            <span className="fl-container-skin__plate truncate font-mono text-[11px] font-bold">
              Pickup {formatStamp(load.pickupAt)}
            </span>
          </div>
        </ContainerCard>

      {/* ── THE FACTS ──
          Label left, value right, ruled between — the same spec sheet the empty
          cards opposite now use, so the two halves of the pairing are read the
          same way. Inline `label value` pairs in a two-column grid put every
          value at a different x, which is exactly the thing that makes a card
          feel unorganised: nothing to run the eye down. */}
        <dl className="grid min-w-0 flex-1 basis-[12rem] grid-cols-1 gap-y-1 py-1">
        <SpecRow label="Match">
          <span className="font-bold text-stage-paired-subtle-foreground">{score}%</span>
        </SpecRow>
        <SpecRow label="Shipment">
          <Mono className="font-bold text-foreground">{load.shipmentReference ?? load.id}</Mono>
        </SpecRow>
        <SpecRow label="Margin">
          <Mono
            className={cn(
              'font-bold',
              tight
                ? 'text-stage-returning-subtle-foreground'
                : 'text-stage-closed-subtle-foreground',
            )}
          >
            +{formatSpan(marginMs)}
          </Mono>
        </SpecRow>
        <SpecRow label="Transporter">
          {load.transporter ? (
            <CompanyName name={load.transporter} className="min-w-0 font-semibold text-foreground" />
          ) : (
            <span className="font-semibold text-foreground">Not assigned yet</span>
          )}
        </SpecRow>
        </dl>
      </div>

      {/* ── WHY, AND WHAT TO DO ──
          The evidence for the recommendation on the left, the decision on the
          right, both on one centre line.
       *
       * `flex-1` on the checks rather than `justify-between` on the row. With
       * `justify-between` and `flex-wrap`, the moment the two could not share a
       * line the checks took a row of their own and the buttons dropped to the
       * LEFT of the next one — a primary action that moved across the card
       * depending on how long a shipping line's name was. Now the checks take
       * the slack and wrap inside themselves; the actions never move. */}
      <div className="flex items-center gap-4 border-t border-container-full-border px-3 py-2.5">
        <CompatChecklist suggestion={suggestion} />
        <div className="flex shrink-0 items-center gap-2">
          {/* An outline, not a ghost. `Not this one` is a real decision — it
              teaches the ranker — and as bare grey text it read as a caption
              beside the button rather than as the other half of a choice. */}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onReject}
            className="h-8 px-3 text-xs"
          >
            Not this one
          </Button>
          {/* The button that makes the pairing wears the pairing's colour and
              its glyph — `cn` runs `twMerge`, so these replace the variant's
              own fill rather than racing it. */}
          <Button
            size="sm"
            variant="primary"
            disabled={disabled}
            onClick={onConfirm}
            leadingIcon={<ArrowLeftRight className="size-3.5" />}
            className="h-8 bg-stage-paired px-3.5 text-xs font-bold text-stage-paired-foreground hover:bg-stage-paired/90 active:bg-stage-paired/80"
          >
            Confirm pairing
          </Button>
        </div>
      </div>
    </Card>
  );
}
