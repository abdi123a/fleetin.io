import type { ReactNode } from 'react';

import { CheckCircle2, Package, PackageOpen } from '@/design-system/icons';
import { cn } from '@/utils';

import { Mono } from './marks';

/**
 * A container, drawn as a container — the one card the whole module uses.
 *
 * Every surface in Empty Container that says "this box, in this state" draws
 * this: the chain strip on Cycles, and the operation flow inside the dialog
 * that Control Tower, Matching and Cycles all open. They were three separate
 * hand-rolled boxes with three different paddings, three colour schemes and
 * three ideas of what belonged on them, which is why the same container looked
 * like a different object depending on which way you had arrived at it.
 *
 * ## Three lines, and they are always the same three
 *
 * State, number, line. That is the whole card.
 *
 * It used to carry a timestamp too — `Collected 24/07/2026 · 07:15` on the full
 * half and `Since 26/07/2026 · 07:15` on the empty one — and side by side the
 * two dates could not be told apart: nothing on the card said which event each
 * belonged to, so the reader was left doing forensics on a strip meant to be
 * scanned. Every one of those dates is in the dialog, labelled, one click away.
 * The strip's job is *which box, in what state*; the dialog's job is *when*.
 *
 * ## One state, one colour — everywhere, every time
 *
 * A full box is this green and an empty box is this amber on every surface in
 * the module, with no second strength for "not the box you are looking at".
 * That variant existed to mark the paired container as a different one, and it
 * broke the rule it was drawn beside: two FULL cards in one strip came out two
 * different greens, so the colour stopped meaning *loaded* and started meaning
 * something about relevance. The bracket around the pair, and the caption over
 * the one outside it, already say which box is which — and they say it in
 * words, which is where that distinction belongs.
 *
 * ## Width says how long the box is
 *
 * A 20ft container is drawn shorter than a 40ft one — three quarters of it, not
 * the true half, which at these sizes would leave the short card too narrow to
 * hold a container number. Every card was one width before, which threw away
 * the one property of a shipping container a picture of it can carry for free,
 * and made "20 ft" a string you had to stop and read on every row.
 *
 * The width is never set by CONTENT, only by the box. That distinction is the
 * whole reason a row of these lines up: they were content-sized once, which
 * made a chain of four cycles a ragged fence and made the size of a card look
 * like it meant something when it did not. Now it does.
 *
 * ## What may go inside, and what may not
 *
 * `children` adds lines under the three; `aside` puts one mark in the top-right
 * corner. Both are for a card that stands ALONE in its row — the matching
 * page's yard column, where every card carries the same extra lines and so they
 * all still match each other.
 *
 * They are not for a card standing beside other cards. The dialog's flow strip
 * tried exactly that: each step's dates and links went inside the box, the box
 * grew to fit whatever text it was handed, and three steps in a row came out
 * three different shapes — none of which read as a container. There the facts
 * live under the card instead. The rule is not "nothing inside the box", it is
 * "every box in the same row is the same box".
 */
export type ContainerCardState = 'full' | 'empty' | 'returned';

/**
 * A 20-footer, off the raw size string the API stores (`20'`, `40'`, `40HC`).
 *
 * Anything unrecognised is drawn full length: a box of unknown size is more
 * likely to be a 40 on this corridor, and guessing short makes the card too
 * narrow for the number it has to hold.
 */
function isTwentyFoot(size: string | null | undefined): boolean {
  return (size ?? '').trim().startsWith('20');
}

const STATE: Record<
  ContainerCardState,
  { label: string; Icon: typeof Package; skin: string; paint: string; plate: string }
> = {
  /* Green, filled — the box is loaded and moving. Its opposite number is the
     container yellow: one meaning, one hue, in every place this card lands. */
  full: {
    label: 'Full',
    Icon: Package,
    skin: 'fl-container-skin',
    paint: 'border-2 border-transparent bg-stage-loaded text-stage-loaded-foreground',
    /* Green-800 on the card surface, not the card's own white-on-green: a plate
       exists to be read, and its whole point is to stop being the card for one
       line. Inverts to green-200 in dark, where the surface is dark too. */
    plate: '[--fl-plate-ink:var(--stage-loaded-subtle-foreground)]',
  },
  /* Dashed, because an empty box is an open one — and because colour must never
     be the only channel carrying the pair. */
  empty: {
    label: 'Empty',
    Icon: PackageOpen,
    skin: 'fl-container-skin fl-container-skin--pale',
    paint:
      'border-2 border-dashed border-container-empty-border bg-container-empty-subtle text-container-empty-subtle-foreground',
    plate: '[--fl-plate-ink:var(--container-empty-subtle-foreground)]',
  },
  /* Home, and quiet about it: the one state that carries no hue at all, because
     nothing is owed on a box that is back at the depot. */
  returned: {
    label: 'Returned',
    Icon: CheckCircle2,
    skin: 'fl-container-skin fl-container-skin--pale',
    paint:
      'border-2 border-container-returned-border bg-container-returned-subtle text-container-returned-subtle-foreground',
    plate: '[--fl-plate-ink:var(--container-returned-subtle-foreground)]',
  },
};

export function ContainerCard({
  state,
  container,
  /** The shipping line — whose box it is. */
  line,
  /** Overrides the state's own word, for a card that names the moment instead. */
  label,
  /** The raw size string — `20'`, `40'`, `40HC`. Sets how long the box is drawn. */
  size,
  /**
   * How much room the surface has.
   *
   * `strip` is the dialog's flow, where three boxes and two connectors share a
   * dialog — a 40ft is 176px there. `list` is a column of one box per row, where
   * it is 384px. Two scales, one ratio: a 20-footer is three quarters of a
   * 40-footer on both.
   */
  scale = 'strip',
  aside,
  children,
  onClick,
  /** Mirrors `aria-pressed` when the card is itself the selection control. */
  pressed,
  className,
}: {
  state: ContainerCardState;
  container?: string | null;
  line?: string | null;
  label?: string;
  size?: string | null;
  scale?: 'strip' | 'list';
  /** One mark in the top-right corner — a risk badge, a state chip. */
  aside?: ReactNode;
  /** Extra lines under the three. See the note above before reaching for it. */
  children?: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  className?: string;
}) {
  const meta = STATE[state];
  const short = isTwentyFoot(size);

  const body = (
    <>
      {/* Sizes and opacities raised across the board. Every line was 9px at
          75–90% opacity, which is legible on a flat fill and not on the ribbed
          one these cards actually wear — the shipping line in particular
          disappeared into the corrugation. */}
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest">
        <meta.Icon className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{label ?? meta.label}</span>
        {aside && <span className="ml-auto shrink-0">{aside}</span>}
      </div>
      <Mono className="mt-0.5 block truncate text-[15px] font-bold leading-tight">
        {container || '—'}
      </Mono>
      {/* Held even when there is no line on file, so the third line is always a
          third line and the row keeps its shape. */}
      {/* On its own plate — see `.fl-container-skin__plate`. At 11px over the
          corrugation this line lost its shape entirely; opacity was never the
          problem, the ribs behind the glyphs were. */}
      <div className="mt-0.5 flex min-w-0">
        <span className="fl-container-skin__plate truncate text-[11px] font-semibold">
          {line || '—'}
        </span>
      </div>
      {children}
    </>
  );

  const shell = cn(
    /* `max-w-[24rem]` is a floor under every caller, not a style choice.
     *
     * 176px is the width; a caller that needs the card to fill a list row
     * overrides it with `w-full`. That override has now produced a 500px
     * container in a stacked dialog and a 790px one in the matching page's
     * right-hand pane — twice the same bug, because `w-full` means "however
     * wide the parent is" and some parents are very wide. The cap makes the
     * override safe: fill the row, up to a width a container can still be.
     *
     * An explicit rem value rather than `max-w-sm`, deliberately. This theme
     * clears Tailwind's own scales with `--radius-*: initial` and friends, and
     * a rung the theme does not define compiles to NOTHING rather than falling
     * back — which is exactly how the bracket around these cards came to have
     * square corners while looking like it asked for round ones. */
    'min-h-[4.25rem] shrink-0 rounded-lg px-3 py-2 text-left',
    /* An exact width, from the BOX — never `w-full`.
     *
     * Every stretched-container bug in this module came from a width that asked
     * the parent how wide to be: 500px in a stacked dialog, 790px in the
     * matching pane, and then 324px for a 40-footer whose column happened to be
     * narrower than the cap, sitting beside a 288px 20-footer that had reached
     * its own. The same box came out a different length depending on where you
     * were standing.
     *
     * `max-w-full` is the only concession: a pane narrower than the box still
     * has to fit it. */
    'max-w-full',
    scale === 'list'
      ? short
        ? 'w-[18rem]'
        : 'w-[24rem]'
      : short
        ? 'w-[8.25rem]'
        : 'w-44',
    meta.skin,
    meta.paint,
    meta.plate,
    onClick &&
      'transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={shell}>
      {body}
    </button>
  );
}
