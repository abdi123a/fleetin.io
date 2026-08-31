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
 * Marks therefore only just overlap now, and that is the intended result — the
 * shape says "these belong to one job", it does not have to say it by hiding
 * half of somebody's initials.
 */
export const MARK_STACK_OVERLAP = {
  xs: '-ml-0.5',
  sm: '-ml-1',
  md: '-ml-1',
  lg: '-ml-1.5',
  xl: '-ml-2',
} as const;

export type MarkStackSize = keyof typeof MARK_STACK_OVERLAP;
