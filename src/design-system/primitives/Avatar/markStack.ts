/**
 * How far a mark slides under the one before it, in a row of marks.
 *
 * One scale, because the app draws this shape in four places — the crew stack,
 * the transporter marks on a row card, the same marks on the shipment
 * masthead, and `AvatarGroup` — and four hardcoded overlaps is how they drift.
 *
 * The numbers are set by the initials, not by taste. A mark is a circle with
 * two capitals centred in it, and the space either side of those capitals is
 * all the room an overlap has to work in:
 *
 * | size | plate | initials | air each side |
 * |------|-------|----------|---------------|
 * | xs   | 24px  | ~13px    | ~5px          |
 * | sm   | 32px  | ~15px    | ~8px          |
 * | md   | 36px  | ~19px    | ~8px          |
 *
 * The covering mark eats the overlap **plus its own 2px ring**, which is the
 * part the old values missed: at `-ml-2` on a 32px plate that is 10px off a
 * disc with 8px of air, so the neighbour's first letter was cut in half. Every
 * value here leaves at least 1px of air after the ring is counted.
 *
 * ## Why `xs` buys itself more air
 *
 * At 24px the air ran out first, and a 2px overlap on a 24px plate is 8% — the
 * marks stopped reading as a stack and read as a row of circles jammed
 * together, which is a worse shape than a slight clip would have been. The fix
 * is not a bigger overlap on the same disc but a smaller pair of capitals: the
 * stack renders `xs` initials one step down (see `CrewStack`'s `SIZE`), which
 * takes them from ~13px to ~10px wide and hands the overlap the 2px it needed.
 * A quarter of a 24px disc can then slide under its neighbour with the letters
 * still whole.
 */
export const MARK_STACK_OVERLAP = {
  /* 3px, not the scale's usual 4: measured, 4px put the covering mark's ring
     exactly on the next mark's first letter — whole, but touching. */
  xs: '-ml-[3px]',
  sm: '-ml-1',
  md: '-ml-1',
  lg: '-ml-1.5',
  xl: '-ml-2',
} as const;

/**
 * The overlap for the mark that follows the lead.
 *
 * The lead's halo is a ring drawn *outside* its plate — 3px of it — and the
 * mark behind it pays that on top of the overlap. Without this the two
 * closest marks in the row are the two with the least air between them, which
 * is backwards: the lead is the one mark whose neighbour has to stay legible.
 *
 * Kept within 3px of the shared overlap on purpose. The first attempt at this
 * was a positive margin, which set the lead apart from an otherwise even row
 * and read as a gap somebody forgot to close.
 */
export const MARK_STACK_LEAD_GAP = {
  xs: '-ml-px',
  sm: '-ml-px',
  md: '-ml-px',
  lg: '-ml-0.5',
  xl: '-ml-1',
} as const;

export type MarkStackSize = keyof typeof MARK_STACK_OVERLAP;
