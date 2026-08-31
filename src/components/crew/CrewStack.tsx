import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { Avatar, MARK_STACK_OVERLAP, Tooltip } from '@/design-system';
import { UserPlus } from '@/design-system/icons';
import { cn } from '@/utils';

/**
 * The crew stack — who at Fleetin is on this shipment.
 *
 * The shape it draws is deliberately the same one the transporter marks
 * already use on the row cards and the masthead: overlapping circles, names on
 * hover. A reader who has learned "a row of little circles means a list of
 * parties" learns nothing new here — the only question is which side of the
 * job they name, and a person's initials never look like a company's logo.
 *
 * Three things it says without a label:
 *
 * - **One person, one face.** The overlap only appears when there is something
 *   to overlap.
 * - **Who to call.** The lead wears a solid ring; the rest wear the surface's
 *   own colour, which is what cuts them apart where they overlap. The ring
 *   only appears on a crew of two or more — everybody leads a crew of one, so
 *   marking it would be noise.
 * - **Nobody.** A dashed circle, drawn only where the stack is `interactive`.
 *   A 200-row list of dashed circles is not a signal, it is a texture, which
 *   is why the row cards render nothing and the Unassigned filter answers that
 *   question instead.
 */

export interface CrewFace {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  roleName?: string | null;
  isLead?: boolean;
}

export interface CrewStackProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  crew: CrewFace[];
  /** Faces shown before the stack collapses into `+N`. */
  max?: number;
  size?: 'xs' | 'sm' | 'md';
  /**
   * Which surface it sits on.
   *
   * The three `tile-*` tones are the shipment masthead's own slabs — teal
   * booked, green in transit, ink once every box is home. The tile has to name
   * itself because the stack cannot see what it is sitting on, and every
   * colour in the treatment is derived from it: a white ring on a black slab
   * is invisible, and a hardcoded teal ink is wrong on two slabs out of three.
   */
  tone?: keyof typeof TONES;
  /**
   * Renders the stack as a button and shows the dashed placeholder when the
   * crew is empty. The handler is *not* supplied here: every call site so far
   * wraps this in a `CrewPicker`, whose `Popover.Trigger asChild` injects its
   * own `onClick`. An internal one would either be silently overwritten or
   * silently overwrite it, depending on spread order — so there isn't one.
   */
  interactive?: boolean;
}

/**
 * Per-surface colours, all derived from the surface itself.
 *
 * On a filled tile the plate takes the tile's *foreground* and the ink takes
 * the tile's own colour — the same inversion the masthead's status chip and
 * `IconChip`'s `on-teal` already use, and the only version that survives dark
 * mode, where `--tile-done` flips from near-black to near-white and a
 * literal-white plate would vanish into it.
 *
 * `separator` is the ring that cuts overlapping faces apart, so it is always
 * the *background*, never white.
 *
 * `lead` is a **halo**, not a coloured ring: a gap in the surface's colour and
 * then a ring outside it. A plain ring cannot work here, because on a filled
 * tile the plate already *is* the tile's foreground — a white ring on a white
 * plate on a black slab is invisible, which is exactly how the first version
 * of this failed. The halo's gap is what makes it read, and it reads the same
 * way on a white card as on any of the three slabs.
 */
const TONES = {
  card: {
    plate: '',
    separator: 'ring-card',
    lead: 'ring-primary ring-offset-2 ring-offset-card',
    placeholder: 'border-border-strong text-muted-foreground',
    overflow: 'bg-muted text-muted-foreground',
  },
  'tile-teal': {
    plate: 'bg-tile-teal-foreground [&_span]:text-tile-teal',
    separator: 'ring-tile-teal',
    lead: 'ring-tile-teal-foreground ring-offset-2 ring-offset-tile-teal',
    placeholder: 'border-tile-teal-foreground/70 text-tile-teal-foreground/90',
    overflow: 'bg-tile-teal-foreground text-tile-teal',
  },
  'tile-success': {
    plate: 'bg-success-foreground [&_span]:text-success',
    separator: 'ring-success',
    lead: 'ring-success-foreground ring-offset-2 ring-offset-success',
    placeholder: 'border-success-foreground/70 text-success-foreground/90',
    overflow: 'bg-success-foreground text-success',
  },
  'tile-done': {
    plate: 'bg-tile-done-foreground [&_span]:text-tile-done',
    separator: 'ring-tile-done',
    lead: 'ring-tile-done-foreground ring-offset-2 ring-offset-tile-done',
    placeholder: 'border-tile-done-foreground/70 text-tile-done-foreground/90',
    overflow: 'bg-tile-done-foreground text-tile-done',
  },
} as const;

const SIZE = {
  xs: { avatar: 'xs' as const, overlap: MARK_STACK_OVERLAP.xs, chip: 'size-6 text-[9px]', icon: 'size-3' },
  sm: { avatar: 'sm' as const, overlap: MARK_STACK_OVERLAP.sm, chip: 'size-8 text-[10px]', icon: 'size-3.5' },
  md: { avatar: 'md' as const, overlap: MARK_STACK_OVERLAP.md, chip: 'size-9 text-[11px]', icon: 'size-4' },
};

/** Name, and the desk they sit at — the whole tooltip. */
function faceLabel(face: CrewFace, showLead: boolean) {
  const role = face.roleName ? titleCaseRole(face.roleName) : null;
  const lead = showLead && face.isLead ? 'Lead' : null;
  const second = [lead, role].filter(Boolean).join(' · ');
  return second ? `${face.fullName} · ${second}` : face.fullName;
}

/**
 * Role names are stored SHOUTING (`OPERATIONS`, `HR_ADMIN`) because they are
 * also permission keys. A tooltip is prose, so they are spoken here.
 */
function titleCaseRole(role: string) {
  return role
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const CrewStack = forwardRef<HTMLButtonElement, CrewStackProps>(function CrewStack(
  { crew, max = 4, size = 'sm', tone = 'card', interactive = false, className, ...props },
  ref,
) {
  const metrics = SIZE[size];
  const palette = TONES[tone];
  const visible = crew.slice(0, max);
  const overflow = crew.slice(max);
  // Everybody leads a crew of one. Marking it would be a ring that never means anything.
  const showLead = crew.length > 1;

  const faces = (
    <span className="inline-flex items-center">
      {visible.map((face, index) => {
        /* The lead's halo is a ring plus a 2px gap drawn OUTSIDE its plate, so
           it needs 4px of clearance that the plate's own box does not reserve.
           The face after it therefore takes a small positive gap instead of an
           overlap — which also sets the person to call slightly apart from the
           crew behind them, and is the reason the old stack cut the second
           face's initials in half. */
        const afterLead = index > 0 && showLead && visible[index - 1]?.isLead === true;

        return (
        <Tooltip key={face.id} content={faceLabel(face, showLead)}>
          <span
            /* Earlier faces paint over later ones, so a row reads left to
               right and no ring is ever half-covered by the next plate. */
            style={{ zIndex: visible.length - index }}
            className={cn(
              'relative inline-flex',
              index > 0 && (afterLead ? 'ml-1' : metrics.overlap),
            )}
          >
            <Avatar
              size={metrics.avatar}
              name={face.fullName}
              src={face.avatarUrl ?? undefined}
              className={cn(
                'ring-2',
                showLead && face.isLead ? palette.lead : palette.separator,
                palette.plate,
              )}
            />
          </span>
        </Tooltip>
        );
      })}

      {overflow.length > 0 && (
        <Tooltip content={overflow.map((face) => face.fullName).join(', ')}>
          <span
            className={cn(
              'relative inline-flex shrink-0 select-none items-center justify-center rounded-full',
              'font-bold ring-2',
              metrics.chip,
              metrics.overlap,
              palette.separator,
              palette.overflow,
            )}
          >
            +{overflow.length}
          </span>
        </Tooltip>
      )}

      {/* The marks carry the whole label, so the names still have to reach a
          screen reader — `alt` covers the photo case but not the initials. */}
      <span className="sr-only">
        {crew.length === 0
          ? 'No one assigned'
          : `Assigned to ${crew.map((face) => face.fullName).join(', ')}`}
      </span>
    </span>
  );

  if (!interactive) {
    if (crew.length === 0) return null;
    return <span className={cn('inline-flex items-center', className)}>{faces}</span>;
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={crew.length === 0 ? 'Assign a teammate' : 'Change who is assigned'}
      className={cn(
        'inline-flex items-center rounded-full transition-opacity',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'hover:opacity-85',
        className,
      )}
      {...props}
    >
      {crew.length === 0 ? (
        <Tooltip content="Assign a teammate">
          <span
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed',
              metrics.chip,
              palette.placeholder,
            )}
          >
            <UserPlus className={metrics.icon} />
          </span>
        </Tooltip>
      ) : (
        faces
      )}
    </button>
  );
});
