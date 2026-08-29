/**
 * Is the box FULL or EMPTY? — the app's one container-state rule.
 *
 * Set by the user on 2026-08-29: **teal while the box is still full, brand
 * yellow once it is empty, and grey once it is back at the depot.** One axis,
 * three colours, every surface. Open a shipment and its bookings sort
 * themselves at a glance — teal boxes are still carrying cargo, yellow boxes
 * owe a return, grey boxes are finished.
 *
 * ## Where it moves
 *
 * Twice, and only on rungs that mean something physical.
 *
 * **Teal → yellow on `Empty Ready`.** That rung is not a cosmetic step — it is
 * the moment Operations records that the box was actually stripped (with the
 * time it happened, which is often hours before the click), and it is the same
 * moment the empty return opens and the detention clock starts. The colour flip
 * and the obligation it signals are the same event.
 *
 * `POD Submitted` is still teal: the paperwork is in, but the cargo is in the
 * box until someone says otherwise. `Empty Picked Up` is still yellow: a truck
 * has the box but the depot does not, so it is still out and still counting.
 *
 * **Yellow → grey on `Completed`.** The box is home, the detention clock has
 * stopped, and nothing is owed. Grey is the point: a finished container should
 * stop asking for attention, and a shipment whose boxes are all grey is done.
 * The user asked for this on 2026-08-29, right after the pair went in — yellow
 * on a closed booking read as work outstanding when there was none.
 *
 * ## What it is NOT
 *
 * Not progress, and not urgency. A shipment's status ladder still says how far
 * along the job is (`@/lib/shipmentStatus`), and the urgency scale still says
 * how close a return is to its deadline (`--urgency-*`). This says only what is
 * physically inside the container — the one fact an operator scanning a list of
 * boxes needs before anything else.
 *
 * Colour never carries it alone: `ContainerStateTag` also differs in fill,
 * border style and icon, so the pair survives monochrome and colour blindness.
 */

export type ContainerState = 'full' | 'empty' | 'returned';

/**
 * The rungs on which the box is out and empty — stripped, not yet home.
 *
 * Both of them still owe a return, which is the whole reason they share a
 * colour; what separates them is only the *label* ("Empty", "Empty · in
 * transit").
 */
const EMPTY_RUNGS: ReadonlySet<string> = new Set(['Empty Ready', 'Empty Picked Up']);

/** The box is back at the depot and the job is closed. */
const RETURNED_RUNGS: ReadonlySet<string> = new Set(['Completed']);

/**
 * Statuses with no box state at all.
 *
 * A cancelled or failed shipment left the ladder; asking whether its container
 * is full is asking about a job that is not happening. Those render no mark
 * rather than a misleading teal one.
 */
const NO_STATE: ReadonlySet<string> = new Set(['Cancelled', 'Failed']);

/**
 * What is in this container right now — `null` when the question does not apply.
 *
 * `hasContainer` is load-bearing, not defensive. A bulk or machinery load is
 * tipped, not stripped: it has no box, so it has no full/empty state and must
 * show no mark. Its ladder also ends at `Completed`-as-delivered, which would
 * otherwise read as "empty" and invent a return that will never exist.
 */
export function containerStateOf(status: string, hasContainer: boolean = true): ContainerState | null {
  if (!hasContainer) return null;
  if (NO_STATE.has(status)) return null;
  if (RETURNED_RUNGS.has(status)) return 'returned';
  return EMPTY_RUNGS.has(status) ? 'empty' : 'full';
}

/** Every box on this shipment is home — what makes a shipment read as finished. */
export function allContainersReturned(states: readonly (ContainerState | null)[]): boolean {
  const boxes = states.filter((state): state is ContainerState => state !== null);
  return boxes.length > 0 && boxes.every((state) => state === 'returned');
}

/**
 * Does this shipment carry a box at all?
 *
 * A shipment does not hold the booking-level container number reliably — a
 * four-container consignment carries one of them at most — so the category is
 * the honest answer and the number is the fallback. Bulk, machinery and bulky
 * goods are tipped rather than stripped: no box, no full/empty state, no mark.
 */
export function carriesContainer(shipment: {
  containerNumber?: string | null;
  shipmentCategory?: string | null;
}): boolean {
  const category = shipment.shipmentCategory;
  if (category) return ['container_20', 'container_40', 'containerized'].includes(category);
  return Boolean(shipment.containerNumber);
}

/** The one-word mark. */
export const CONTAINER_STATE_LABEL: Record<ContainerState, string> = {
  full: 'Full',
  empty: 'Empty',
  returned: 'Returned',
};

/** The mark plus what the box is doing — for a row that has space for a phrase. */
export function containerStateLabel(state: ContainerState, status?: string): string {
  if (state === 'full') return 'Full';
  if (state === 'returned') return 'Returned';
  if (status === 'Empty Picked Up') return 'Empty · in transit';
  return 'Empty';
}

/** The sentence the detail surfaces use, where there is room to say why it matters. */
export const CONTAINER_STATE_SENTENCE: Record<ContainerState, string> = {
  full: 'Still loaded — the cargo is in the box.',
  empty: 'Stripped — the box is empty and owes a return.',
  returned: 'Back at the depot — nothing is owed on this box.',
};

/**
 * The `Badge` intent that carries the pair.
 *
 * The brand roles themselves, because the live pair *is* the brand pair:
 * `primary` is the teal, `accent` the yellow. `default` closes it out in grey —
 * a finished container is the one state that should not carry a brand hue.
 */
export const CONTAINER_STATE_BADGE_INTENT: Record<ContainerState, 'primary' | 'accent' | 'default'> = {
  full: 'primary',
  empty: 'accent',
  returned: 'default',
};

/**
 * The `CornerBadge` intent that carries the pair.
 *
 * The card's corner tab is the loudest thing on a booking card, so it is what
 * turns: a shipment of four boxes shows at a glance which two are still
 * carrying cargo, which one is waiting to go back and which one is done.
 * `orange` is the badge's name for `--accent`, the brand yellow; `neutral` is
 * its grey.
 */
export const CONTAINER_STATE_CORNER_INTENT: Record<ContainerState, 'teal' | 'orange' | 'ink'> = {
  full: 'teal',
  empty: 'orange',
  returned: 'ink',
};

/**
 * Extra classes a status chip needs on top of its intent.
 *
 * `full` and `empty` are brand roles the `Badge` already owns, so they need
 * nothing. `returned` is ink, which no `Badge` intent expresses — `default`
 * renders grey-on-grey and washes out — so it carries its own pair. Empty
 * strings rather than `undefined` so a caller can always spread it into
 * `className` without a guard.
 */
export const CONTAINER_STATE_BADGE_CLASS: Record<ContainerState, string> = {
  full: '',
  empty: '',
  returned: 'bg-container-returned-subtle text-container-returned-subtle-foreground',
};
