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
  Unloading: 'Depotage',
  'POD Submitted': 'Depotage',
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
  { rung: 'POD Submitted', label: 'Depotage' },
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
export function displayShipmentStatus(
  status: string,
  scope: 'booking' | 'shipment' = 'booking',
): string {
  const label = DISPLAY_STATUS_GROUP[status] ?? status;
  if (scope === 'shipment' && label === 'Empty Returned') return 'Completed';
  return label;
}

/** Every status of the pickup leg — the truck is working, but the container hasn't left yet. */
export const PICKUP_LEG_STATUSES: readonly string[] = [
  'Heading to Pickup',
  'At Pickup',
  'Loading',
  'Loaded',
];

/**
 * A display-only colour intent — resolved through the six-step grouping, not
 * off the raw rung.
 *
 * It used to read the rungs directly, which meant one label could take two
 * colours: `Driver Assigned` was orange while the rest of "Picked Up" was
 * blue, and `POD Submitted` was green while the rest of "Depotage" was blue.
 * A step that changes colour without changing its name reads as a state
 * change that did not happen.
 */
const STEP_INTENT: Record<string, 'green' | 'orange' | 'blue' | 'slate'> = {
  Created: 'orange',
  'Picked Up': 'blue',
  Delivered: 'blue',
  Depotage: 'blue',
  'Empty Ready': 'green',
  'Empty Picked Up': 'green',
  'Empty Returned': 'green',
};

export function statusIntentOf(status: string): 'green' | 'orange' | 'blue' | 'slate' {
  const step = STEP_INTENT[displayShipmentStatus(status)];
  if (step) return step;
  // Off the ladder entirely — `Payment Pending` still reads as money waiting.
  if (status === 'Payment Pending') return 'orange';
  return 'slate';
}
