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
 * ## One size, whatever is on it
 *
 * Fixed width and a floor on the height, so a row of these lines up on all
 * three lines no matter how long a shipping line's name runs. They were sized
 * by their content before, which made a chain of four cycles a ragged fence —
 * and made the height of a card look like it meant something.
 *
 * There is no slot for anything else, on purpose. The dialog's flow strip needs
 * dates and a shipment link per step, and the moment those went *inside* the box
 * it stopped being a box — it grew with its text, so three steps in a row were
 * three different shapes. They live under the card now, labelled, where a date
 * can say which event it belongs to.
 */
export type ContainerCardState = 'full' | 'empty' | 'returned';

const STATE: Record<
  ContainerCardState,
  { label: string; Icon: typeof Package; skin: string; paint: string }
> = {
  /* Green, filled — the box is loaded and moving. Its opposite number is the
     container yellow: one meaning, one hue, in every place this card lands. */
  full: {
    label: 'Full',
    Icon: Package,
    skin: 'fl-container-skin',
    paint: 'border-2 border-transparent bg-stage-loaded text-stage-loaded-foreground',
  },
  /* Dashed, because an empty box is an open one — and because colour must never
     be the only channel carrying the pair. */
  empty: {
    label: 'Empty',
    Icon: PackageOpen,
    skin: 'fl-container-skin fl-container-skin--pale',
    paint:
      'border-2 border-dashed border-container-empty-border bg-container-empty-subtle text-container-empty-subtle-foreground',
  },
  /* Home, and quiet about it: the one state that carries no hue at all, because
     nothing is owed on a box that is back at the depot. */
  returned: {
    label: 'Returned',
    Icon: CheckCircle2,
    skin: 'fl-container-skin fl-container-skin--pale',
    paint:
      'border-2 border-container-returned-border bg-container-returned-subtle text-container-returned-subtle-foreground',
  },
};

export function ContainerCard({
  state,
  container,
  /** The shipping line — whose box it is. */
  line,
  /** Overrides the state's own word, for a card that names the moment instead. */
  label,
  onClick,
  className,
}: {
  state: ContainerCardState;
  container?: string | null;
  line?: string | null;
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  const meta = STATE[state];

  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest opacity-90">
        <meta.Icon className="size-3 shrink-0" aria-hidden />
        {label ?? meta.label}
      </div>
      <Mono className="mt-0.5 block truncate text-sm font-bold">{container || '—'}</Mono>
      {/* Held even when there is no line on file, so the third line is always a
          third line and the row keeps its shape. */}
      <div className="truncate text-[9px] opacity-75">{line || '—'}</div>
    </>
  );

  const shell = cn(
    'w-44 min-h-[4.25rem] shrink-0 rounded-lg px-3 py-2 text-left',
    meta.skin,
    meta.paint,
    onClick &&
      'transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button type="button" onClick={onClick} className={shell}>
      {body}
    </button>
  );
}
