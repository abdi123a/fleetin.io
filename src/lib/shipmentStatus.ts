import type { StatusIntent } from '@/design-system/primitives/Layout/statusIntent';

/**
 * How a shipment-ladder status is spoken to a user — one vocabulary, shared by
 * everything that renders one.
 *
 * A shipment and a booking move through the identical ladder (the backend
 * reuses `shipment-status.util.ts` for both), so they must not read as two
 * different things. Before this lived in one place the same delivered
 * container was called `Completed` on the shipment overview, `Pending` on the
 * Shipments list, `REGISTERED` on the transporter's page and `Delivered` on
 * the shipper's — four words, one fact.
 *
 * The raw ladder still drives every transition, guard and empty-return rule
 * untouched; this only decides what the badge says.
 */

/**
 * The six steps, and which raw rung falls under each. Thirteen near-identical
 * status names made "what stage is this at" harder to read at a glance than it
 * needs to be; the user cut the vocabulary to six on 2026-08-26 — Created,
 * Picked Up, Delivered, Depotage, Empty Ready, Empty Returned.
 *
 * The order here matches the ladder's own order, so a step never reads as
 * being behind the one before it.
 */
const DISPLAY_STATUS_GROUP: Record<string, string> = {
  Pending: 'Created',
  Assigned: 'Created',
  'Driver Assigned': 'Picked Up',
  'Heading to Pickup': 'Picked Up',
  'At Pickup': 'Picked Up',
  Loading: 'Picked Up',
  Loaded: 'Picked Up',
  'En Route': 'Delivered',
  Arrived: 'Delivered',
  Unloading: 'Unstuffing',
  'POD Submitted': 'Unstuffing',
  'Empty Ready': 'Empty Ready',
  'Empty Picked Up': 'Empty Picked Up',
  Completed: 'Empty Returned',
};

/**
 * The six steps an operator actually picks between, in order.
 *
 * The thirteen-rung ladder underneath is unchanged — it still owns the
 * transitions, the guards and the timeline stamps, and every rung still
 * displays under the step it belongs to. What changed on 2026-08-26 is that
 * nobody is asked to choose between "Heading to Pickup" and "At Pickup" any
 * more: the user asked for six steps, so the picker offers six and the ladder
 * is walked to get there (`ladderPathTo`), stamping the rungs in between.
 *
 * `rung` is the status actually written — the TOP of each step's group, so
 * choosing a step means "this whole phase is done". `Created` is the one
 * exception: it is the state a booking starts in, never one you advance to,
 * so it writes the bottom rung.
 */
export const SHIPMENT_STEPS: readonly { rung: string; label: string }[] = [
  { rung: 'Pending', label: 'Created' },
  { rung: 'Loaded', label: 'Picked Up' },
  { rung: 'Arrived', label: 'Delivered' },
  { rung: 'POD Submitted', label: 'Unstuffing' },
  { rung: 'Empty Ready', label: 'Empty Ready' },
  { rung: 'Empty Picked Up', label: 'Empty Picked Up' },
  { rung: 'Completed', label: 'Empty Returned' },
];

/**
 * The steps a load with **no container** walks — the user's rule, 2026-08-27.
 *
 * Bulk cargo is tipped, not stripped: there is no box to empty, no depot to
 * return one to, and no dépotage in between. So the ladder is three rungs and
 * the last of them is the end of the job — a bulk load that has been delivered
 * is finished, where a containerized one is only half done.
 *
 * `Delivered` therefore writes `Completed`, not `Arrived`. The rungs between
 * are still walked and still stamped (`En Route`, `Arrived`, `Unloading`, `POD
 * Submitted`), so the reports keep a real delivery timestamp — what changes is
 * that nobody is asked to click through four more steps that describe a
 * container this load never carried.
 */
export const BULK_SHIPMENT_STEPS: readonly { rung: string; label: string }[] = [
  { rung: 'Pending', label: 'Created' },
  { rung: 'Loaded', label: 'Picked Up' },
  { rung: 'Completed', label: 'Delivered' },
];

/** The ladder this load actually walks, by whether it carries a box. */
export function shipmentStepsFor(hasContainer: boolean): readonly { rung: string; label: string }[] {
  return hasContainer ? SHIPMENT_STEPS : BULK_SHIPMENT_STEPS;
}

/**
 * The raw rungs in ladder order.
 *
 * Taken from `DISPLAY_STATUS_GROUP`'s own keys rather than restated, so the two
 * cannot drift: that map is written in ladder order and says so, and a rung
 * added to it is a rung this knows about for free.
 */
const LADDER_ORDER = Object.keys(DISPLAY_STATUS_GROUP);

export interface ShipmentProgress {
  /** 0–100, rounded. */
  percent: number;
  /** Which step of `of` this shipment is standing on, 1-based. */
  step: number;
  of: number;
}

/**
 * How far through its job a shipment is — one number instead of two words.
 *
 * The list used to print the status *and* the container mark side by side —
 * "RETURNED  Completed", "FULL  Created" — which is the same fact twice in two
 * vocabularies, and the user could not read it at a glance. A row now says what
 * stage it is at once and how far along that is, which is the question the list
 * is actually being scanned for.
 *
 * Measured in **steps a person can name**, not in raw rungs: the ladder's
 * thirteen rungs collapse to the seven steps the picker offers (three for a
 * bulk load, which ends at delivery — there is no box to bring back), so 4 of 7
 * on the page means the same thing as 4 of 7 in the picker. Off-ladder statuses
 * — `Cancelled`, `Failed` — return `null`: a job that stopped has no progress,
 * and drawing a part-filled rail for one would say it is still running.
 */
export function shipmentProgress(status: string, hasContainer: boolean): ShipmentProgress | null {
  const rank = LADDER_ORDER.indexOf(status);
  if (rank < 0) return null;

  const steps = shipmentStepsFor(hasContainer);

  /*
   * Counted by the step's NAME, not by its rung.
   *
   * A step's `rung` is the TOP of its group — choosing "Picked Up" writes
   * `Loaded` — so a shipment sitting at `Driver Assigned` has not reached that
   * rung even though it displays as "Picked Up". Ranking by rung therefore drew
   * 0% beside a chip reading "Picked Up", which is the same disagreement between
   * two marks that this figure exists to remove. Grouping is what the chip uses,
   * so grouping is what the rail counts: the two can no longer contradict.
   */
  let index = steps.findIndex((step) => step.label === displayShipmentStatus(status));

  if (index < 0) {
    /*
     * The status belongs to a step this ladder does not have — a containerized
     * rung ("Depotage", "Empty Ready") on a bulk load, which is tipped rather
     * than stripped and ends at delivery. Fall back to the last step whose rung
     * it has actually passed, which keeps a bulk load monotonic: it cannot read
     * 100% at `Arrived` and 50% again at `Unloading`.
     */
    index = 0;
    steps.forEach((step, i) => {
      if (rank >= LADDER_ORDER.indexOf(step.rung)) index = i;
    });
  }

  return {
    percent: Math.round((index / (steps.length - 1)) * 100),
    step: index + 1,
    of: steps.length,
  };
}

/** The step-rung a raw status sits under — what the six-option picker shows as selected. */
export function stepRungFor(status: string): string {
  const label = DISPLAY_STATUS_GROUP[status] ?? status;
  return SHIPMENT_STEPS.find((step) => step.label === label)?.rung ?? status;
}

/**
 * The step name, for a BOOKING by default.
 *
 * A shipment is not a container, so the last step reads differently at each
 * level: a booking ends "Empty Returned" because its own box came back, while
 * the shipment over it ends **Completed** — every one of its containers is
 * home and the job is over. Reading "Empty Returned" on a four-container
 * shipment invited the question "which empty?".
 */
/**
 * The four words a WHOLE SHIPMENT is described by — the user's ruling,
 * 2026-09-01.
 *
 * A shipment is many containers. The seven-step ladder is the right grain for
 * one of them — a booking genuinely is at Unstuffing rather than at Delivered
 * — but rolled up over a job with four boxes on it, that precision is noise:
 * you want to know whether the job is starting, running, coming home or done.
 *
 * So the shipment speaks four:
 *
 * | Shipment says | Because its containers are at |
 * |---|---|
 * | **Created** | Created |
 * | **In Transit** | Picked Up · Delivered · Unstuffing |
 * | **Empty Return** | Empty Ready · Empty Picked Up |
 * | **Completed** | Empty Returned |
 *
 * The BOOKING ladder is deliberately untouched — the user was explicit. A
 * container keeps all seven steps, its own colours, and its own picker; only
 * the badge over the shipment gets coarser.
 *
 * Note what this costs, on purpose: Unstuffing's red — the one rung the user
 * once asked to be visible across the room, because it starts the detention
 * clock — is not a shipment-level state any more, and reads as In Transit
 * green there. It is still red on the booking, which is the thing that
 * actually owes the clock.
 */
const SHIPMENT_DISPLAY_GROUP: Record<string, string> = {
  Created: 'Created',
  'Picked Up': 'In Transit',
  Delivered: 'In Transit',
  Unstuffing: 'In Transit',
  'Empty Ready': 'Empty Return',
  'Empty Picked Up': 'Empty Return',
  'Empty Returned': 'Completed',
};

export function displayShipmentStatus(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
): string {
  const label = DISPLAY_STATUS_GROUP[status] ?? status;
  if (scope !== 'shipment') return label;
  return SHIPMENT_DISPLAY_GROUP[label] ?? label;
}

/** Every status of the pickup leg — the truck is working, but the container hasn't left yet. */
export const PICKUP_LEG_STATUSES: readonly string[] = [
  'Heading to Pickup',
  'At Pickup',
  'Loading',
  'Loaded',
];

/**
 * A display-only colour intent — resolved through the seven-step grouping, not
 * off the raw rung.
 *
 * It used to read the rungs directly, which meant one label could take two
 * colours: `Driver Assigned` was orange while the rest of "Picked Up" was
 * blue, and `POD Submitted` was green while the rest of "Depotage" was blue.
 * A step that changes colour without changing its name reads as a state change
 * that did not happen.
 *
 * ## The four colours are four phases of one job
 *
 * The ladder is not seven unrelated states; it is a job in four phases, and the
 * colour is the phase rather than the rung:
 *
 * - **Created** — teal. Booked, nothing has moved yet.
 * - **Picked Up · Delivered · Depotage** — green. *In transit*: the driver has
 *   the box, has delivered it, and the consignee is stripping it. All three are
 *   the same answer to "is work happening" — yes — which is why they used to be
 *   one blue and are now one green. Set on 2026-08-30 at the user's direction.
 * - **Empty Ready · Empty Picked Up** — amber. Work is done and the box now
 *   *owes a return*, which is the same amber the container-state scale uses for
 *   an empty box; the two systems agree here on purpose.
 * - **Empty Returned** — slate. Home, closed, nothing owed.
 *
 * ## Two rungs to a phase, two steps to a colour (2026-09-01)
 *
 * Green and amber each cover two rungs, and one flat colour across a pair left
 * the picker unable to say which of the two a booking had reached — Picked Up
 * and Delivered were the same dot, and so were Empty Ready and Empty Picked Up.
 * The later rung of each pair now takes the `-deep` step of the same ramp.
 *
 * A step, not a hue. The four phases still read as four colours from across a
 * desk; the depth answers "how far into this one" on the second look. Anything
 * that speaks in phases — the `Badge`, the card's corner tab — folds the deep
 * variants back onto their phase below, because a within-phase step is not
 * something those primitives are for.
 */
const STEP_INTENT: Record<string, StatusIntent> = {
  Created: 'teal',
  'Picked Up': 'green',
  Delivered: 'green-deep',
  /* Red, and alone in it. Unstuffing is the client's own step and the one that
     starts the detention clock, so the user asked for it to be visible from
     across the room — the booking's badge, its corner tab and its rung in the
     picker all take this. Every other rung keeps its phase. */
  Unstuffing: 'red',
  'Empty Ready': 'orange',
  'Empty Picked Up': 'orange-deep',
  'Empty Returned': 'slate',
};

/**
 * The four general states, in the same colour language as the seven.
 *
 * Not a new palette — each takes the colour its own group already wore:
 * teal starting, green running, amber owing a return, slate closed.
 */
const SHIPMENT_STEP_INTENT: Record<string, StatusIntent> = {
  Created: 'teal',
  'In Transit': 'green',
  'Empty Return': 'orange',
  Completed: 'slate',
};

export function statusIntentOf(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
): StatusIntent {
  const label = displayShipmentStatus(status, scope);
  const step = scope === 'shipment' ? SHIPMENT_STEP_INTENT[label] : STEP_INTENT[label];
  if (step) return step;
  // Off the ladder entirely — `Payment Pending` still reads as money waiting.
  if (status === 'Payment Pending') return 'orange';
  return 'slate';
}

/**
 * The status's PHASE, with the within-phase step folded away.
 *
 * `statusIntentOf` distinguishes the two rungs inside green and inside amber
 * (`green-deep`, `orange-deep`) so the picker can show which of the two a
 * booking has reached. Most callers do not want that distinction — they are
 * asking "is this in transit?" or "does this owe a return?" — and an equality
 * test against `'green'` silently stopped matching Delivered the day those
 * steps were added. Three did: the shipment masthead's slab and two counts on
 * the reports panel, all of which went quietly wrong rather than failing.
 *
 * Ask this when you mean the phase. Ask `statusIntentOf` when you mean the
 * exact rung's colour.
 */
export type StatusPhase = 'teal' | 'orange' | 'green' | 'blue' | 'red' | 'slate';

export function phaseOfIntent(intent: StatusIntent): StatusPhase {
  if (intent === 'green-deep') return 'green';
  if (intent === 'orange-deep') return 'orange';
  return intent;
}

export function statusPhaseOf(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
): StatusPhase {
  return phaseOfIntent(statusIntentOf(status, scope));
}

/**
 * The phase colour as a `Badge` intent.
 *
 * Surfaces were each writing their own switch over `statusIntentOf`, and one of
 * them let the container state win: a booking in transit wore the teal FULL
 * colour because the box happened to be loaded, so the ladder's own phase never
 * showed. The two facts are both true and both worth printing — which is why
 * the card carries a FULL/EMPTY tag *and* a status badge — but the status badge
 * has to be about the status.
 */
export function statusBadgeIntentOf(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
):
  | 'primary'
  | 'success'
  | 'success-deep'
  | 'warning'
  | 'warning-deep'
  | 'info'
  | 'destructive'
  | 'default' {
  /* The deep step is CARRIED, not folded away.
   *
   * It used to fold back onto its phase, on the reasoning that a within-phase
   * step was something only the picker drew. That left one rung wearing two
   * colours on one screen: a card badged "Empty Picked Up" in mid amber, with
   * the picker hanging off that very badge drawing the same rung a step
   * deeper. Hue says the phase and depth says how far into it — a badge that
   * keeps the hue and drops the depth is telling half of what it knows. */
  switch (statusIntentOf(status, scope)) {
    case 'teal':
      return 'primary';
    case 'green':
      return 'success';
    case 'green-deep':
      return 'success-deep';
    case 'orange':
      return 'warning';
    case 'orange-deep':
      return 'warning-deep';
    case 'blue':
      return 'info';
    case 'red':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * The phase colour as a `CornerBadge` intent.
 *
 * The card's corner tab wears the same phase as its status badge. It used to
 * read the container state instead, so an "Empty Ready" booking got an amber
 * tab — the state and the phase happen to agree at that rung — while the three
 * transit rungs got the teal of a loaded box and the tab looked stuck. Two
 * marks on one card saying different things about the same booking is worse
 * than either mark alone.
 */
export function statusCornerIntentOf(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
): 'teal' | 'green' | 'green-deep' | 'orange' | 'orange-deep' | 'blue' | 'red' | 'ink' {
  /* Same ramp as the badge — the tab and the badge on one card must not
     disagree about how far along the phase the booking is. */
  switch (statusIntentOf(status, scope)) {
    case 'green':
      return 'green';
    case 'green-deep':
      return 'green-deep';
    case 'orange':
      return 'orange';
    case 'orange-deep':
      return 'orange-deep';
    case 'blue':
      return 'blue';
    case 'red':
      return 'red';
    case 'slate':
      return 'ink';
    default:
      return 'teal';
  }
}
