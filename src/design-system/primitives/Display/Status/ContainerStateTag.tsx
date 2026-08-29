import { Package, PackageCheck, PackageOpen } from '@/design-system/icons';

import {
  CONTAINER_STATE_SENTENCE,
  containerStateLabel,
  type ContainerState,
} from '@/lib/containerState';
import { cn } from '@/utils';

/* ---------------------------------------------------------------------------
 * ContainerStateTag
 * ---------------------------------------------------------------------------
 * The FULL / EMPTY mark — the single component every surface uses to say what
 * is inside a container.
 *
 * **Teal while the box is full, yellow once it is empty, grey once it is back
 * at the depot.** The rule and the rungs it moves on live in
 * `@/lib/containerState`; this file owns nothing but how it looks. It moved here
 * from the Empty Container module's own `marks.tsx` on 2026-08-29, when the user
 * made the scale system-wide — a mark that means "this box is empty" cannot be a
 * private idiom of the one module that happens to care most.
 *
 * ## The rule this component exists to hold
 *
 * **FULL and EMPTY must never be mistakable for each other.** A pairing links
 * two different physical containers, and every misreading of this product comes
 * from someone thinking the empty box becomes the next full box. So the two
 * marks differ in every channel at once: full is a solid teal slab with a
 * closed-box icon, empty is a dashed yellow outline with an open-box icon.
 * Colour alone would not survive a monochrome print or a colour-blind reader;
 * the dash and the icon do.
 *
 * RETURNED closes the set and is deliberately the quiet one: solid grey, closed
 * box, a check. It has to be legible without competing — a finished container
 * on a page of live ones should be the thing your eye skips.
 * ------------------------------------------------------------------------- */

export type ContainerTagTone = 'solid' | 'subtle';

export interface ContainerStateTagProps {
  state: ContainerState;
  /**
   * The raw ladder status, when the caller has it.
   *
   * Only ever changes the *word* — an empty box on its way to the depot reads
   * "Empty · in transit" — never the colour. Omit it and the tag says Full or
   * Empty flat.
   */
  status?: string;
  /**
   * `solid` is the slab that rides inside a card; `subtle` is the tinted form
   * for a dense row that already carries a saturated mark of its own.
   */
  tone?: ContainerTagTone;
  /** The 8px form for card headers, beside a company name. */
  small?: boolean;
  className?: string;
}

const TONE: Record<ContainerTagTone, Record<ContainerState, string>> = {
  solid: {
    full: 'bg-container-full text-container-full-foreground border border-transparent',
    empty:
      'border border-dashed border-container-empty-border bg-container-empty text-container-empty-foreground',
    returned:
      'border border-container-returned-border/60 bg-container-returned text-container-returned-foreground',
  },
  subtle: {
    full: 'border border-container-full-border/40 bg-container-full-subtle text-container-full-subtle-foreground',
    empty:
      'border border-dashed border-container-empty-border bg-container-empty-subtle text-container-empty-subtle-foreground',
    returned:
      'border border-container-returned-border/40 bg-container-returned-subtle text-container-returned-subtle-foreground',
  },
};

const ICON = { full: Package, empty: PackageOpen, returned: PackageCheck } as const;

export function ContainerStateTag({
  state,
  status,
  tone = 'solid',
  small,
  className,
}: ContainerStateTagProps) {
  const Icon = ICON[state];

  return (
    <span
      title={CONTAINER_STATE_SENTENCE[state]}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm font-extrabold uppercase tracking-widest',
        small ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
        TONE[tone][state],
        className,
      )}
    >
      <Icon className={small ? 'size-2' : 'size-2.5'} aria-hidden />
      {containerStateLabel(state, status)}
    </span>
  );
}

/** A loaded container. Solid brand slab, closed box. */
export function FullTag(props: Omit<ContainerStateTagProps, 'state'>) {
  return <ContainerStateTag state="full" {...props} />;
}

/** An emptied container. Dashed brand-yellow outline, open box — the visual opposite of Full. */
export function EmptyTag(props: Omit<ContainerStateTagProps, 'state'>) {
  return <ContainerStateTag state="empty" {...props} />;
}

/** A container that is home. Grey, closed box, checked — done, and quiet about it. */
export function ReturnedTag(props: Omit<ContainerStateTagProps, 'state'>) {
  return <ContainerStateTag state="returned" {...props} />;
}

/**
 * The container pair as plain classes, for surfaces that tint something other
 * than a tag — a status pill, a dot, a card edge.
 *
 * Exported so no page has to restate "teal means full": there is one place the
 * pairing is written down, and this is it.
 */
export const containerStateClasses: Record<
  ContainerState,
  { text: string; dot: string; solid: string; subtle: string; border: string }
> = {
  full: {
    text: 'text-container-full',
    dot: 'bg-container-full',
    solid: 'bg-container-full text-container-full-foreground',
    subtle: 'bg-container-full-subtle text-container-full-subtle-foreground',
    border: 'border-container-full-border',
  },
  empty: {
    text: 'text-container-empty-subtle-foreground',
    dot: 'bg-container-empty',
    solid: 'bg-container-empty text-container-empty-foreground',
    subtle: 'bg-container-empty-subtle text-container-empty-subtle-foreground',
    border: 'border-container-empty-border',
  },
  returned: {
    text: 'text-container-returned-subtle-foreground',
    dot: 'bg-container-returned-border',
    solid: 'bg-container-returned text-container-returned-foreground',
    subtle: 'bg-container-returned-subtle text-container-returned-subtle-foreground',
    border: 'border-container-returned-border',
  },
};
