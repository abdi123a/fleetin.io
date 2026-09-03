/**
 * Fleetin Impact — the arithmetic of a repositioning that was not driven.
 *
 * ## Two questions, never one
 *
 * The carbon module answers "how much CO₂ did the trucks put out?" from the
 * kilometres they actually covered (`Booking.co2EmissionsKg`). This file
 * answers a different question — "how much empty driving did Fleetin
 * eliminate?" — and the two are never netted against each other. A truck that
 * drove 35 km emitted 35 km of carbon, whatever else it did not have to drive.
 *
 * ## What is avoided
 *
 * A truck does not carry a shipment for its whole journey. The normal full
 * container cycle is
 *
 *     Garage → Port → Free Zone → Garage
 *
 * loaded only in the middle leg; the normal empty cycle is
 *
 *     Garage → Free Zone → Port → Garage
 *
 * carrying an empty box in the middle and nothing at all at either end. What
 * Fleetin changes happens at the free zone: without a match the truck goes
 *
 *     Free Zone → Garage → Port
 *
 * before its next job, and with a realized match it simply continues
 *
 *     Free Zone → Port
 *
 * So the distance avoided is exactly `Free Zone → Garage` plus
 * `Garage → Port`. Not the shipment's quoted lane, not the truck's total, not
 * a percentage of anything.
 *
 * ## A match is an opportunity; a saving is a fact
 *
 * The pairing engine offers a continuation and Operations confirms it — that
 * is a `matched` cycle, and it has saved nothing yet. The saving exists only
 * once the physical operation avoided the garage: the empty left the free zone
 * on a truck, the same transporter's next load was collected at the port a
 * short while later, and nothing on record says the truck went home in
 * between. `classifyContinuation` is that judgement, written once and kept
 * pure so it can be tested against every case the business named.
 *
 * ## Transporter-level, not vehicle-level
 *
 * Matching is done per transporter, and the truck that took the empty away is
 * not assumed to be the truck that ran the next load. The *distance* avoided
 * does not depend on which truck it was. The *carbon* avoided does — it needs
 * a factor — so the vehicle is used only when both legs name the same one,
 * and a continuation whose truck cannot be established keeps its kilometres
 * and leaves the carbon unpriced rather than inventing a factor.
 */

/**
 * How long after the empty left the free zone the next load may be collected
 * and still count as the same trip.
 *
 * Twelve hours is a working day plus a port queue. A truck that collected the
 * empty at 15:00 and loaded at the port at 07:00 the next morning went home
 * in between, on any reading of this corridor — and a match realized the
 * following day does not retroactively save the previous evening's drive.
 */
export const CONTINUITY_WINDOW_HOURS = 12;
export const CONTINUITY_WINDOW_MS = CONTINUITY_WINDOW_HOURS * 3_600_000;

/**
 * Timeline keys that put the truck at the port with the next load. The
 * earliest one recorded is the moment of the continuation.
 */
export const PICKUP_EVIDENCE_KEYS: readonly string[] = [
  'gate_in',
  'loading_start',
  'pickup',
  'departure',
];

/** The rung at which a truck demonstrably has the empty. */
export const EMPTY_COLLECTED_KEY = 'empty_picked_up';

/** Last resort for the pickup moment when the pickup rungs were skipped. */
export const ARRIVAL_KEY = 'arrival';

export type ImpactStatus = 'matched' | 'realized' | 'not_realized';
export type ImpactSource = 'automatic' | 'operator';

export interface ContinuationInput {
  /** Transporter that delivered the empty and owes its return. */
  emptyPartnerId: string | null;
  /** Transporter assigned to the next load. */
  nextPartnerId: string | null;
  /** The truck that fetched the empty: the return truck, else the delivery truck. */
  emptyVehicleId: string | null;
  /** The truck on the next load. */
  nextVehicleId: string | null;
  /** Epoch ms — when the empty left the free zone on a truck. */
  emptyCollectedAt: number | null;
  /** Epoch ms — when the next load was collected at the port. */
  nextCollectedAt: number | null;
  /** Has the next load reached a delivered rung? That is the evidenced one. */
  nextDelivered: boolean;
  /** A recorded route leg puts a truck at the garage between the two jobs. */
  garageStopRecorded: boolean;
}

export interface ContinuationVerdict {
  status: ImpactStatus;
  /** Why, in the operator's words. Null for a clean realization. */
  note: string | null;
  /** Epoch ms — the continuation moment. Only on `realized`. */
  realizedAt: number | null;
  /** Minutes between the empty leaving and the next load being collected. */
  continuationMinutes: number | null;
  /** The truck that ran both legs, when both legs name the same one. */
  vehicleId: string | null;
}

const pending = (note: string): ContinuationVerdict => ({
  status: 'matched',
  note,
  realizedAt: null,
  continuationMinutes: null,
  vehicleId: null,
});

const refused = (note: string): ContinuationVerdict => ({
  status: 'not_realized',
  note,
  realizedAt: null,
  continuationMinutes: null,
  vehicleId: null,
});

/**
 * Did the truck really continue from the free zone to the port?
 *
 * Reads only recorded facts. `matched` means the question cannot be answered
 * yet; `not_realized` means it was answered no; `realized` means every piece
 * of evidence lines up. Nothing here estimates, and nothing here forgives a
 * missing timestamp — an unanswerable case stays `matched` so a person can
 * answer it, rather than being rounded to a saving.
 */
export function classifyContinuation(input: ContinuationInput): ContinuationVerdict {
  if (!input.nextPartnerId) return pending('The next load has no transporter yet');
  if (!input.emptyPartnerId) return pending('The empty has no transporter recorded');
  if (input.emptyPartnerId !== input.nextPartnerId) {
    return refused('Different transporters — the next load was not a continuation of this truck’s trip');
  }
  if (input.garageStopRecorded) return refused('A garage stop is recorded between the two jobs');
  if (input.emptyCollectedAt === null) return pending('The empty has not been collected yet');
  if (!input.nextDelivered) return pending('The next load has not been delivered yet');
  if (input.nextCollectedAt === null) return pending('The next load’s pickup time is not recorded');

  const gapMs = input.nextCollectedAt - input.emptyCollectedAt;
  if (gapMs < 0) return refused('The next load was collected before the empty left the free zone');
  if (gapMs > CONTINUITY_WINDOW_MS) {
    return refused(
      `The next load was collected ${formatHours(gapMs)} after the empty left — no direct continuation`,
    );
  }

  const sameTruck =
    Boolean(input.emptyVehicleId) &&
    Boolean(input.nextVehicleId) &&
    input.emptyVehicleId === input.nextVehicleId;

  return {
    status: 'realized',
    note: sameTruck ? null : 'Different trucks on the two legs — distance kept, carbon not priced',
    realizedAt: input.nextCollectedAt,
    continuationMinutes: Math.round(gapMs / 60_000),
    vehicleId: sameTruck ? input.nextVehicleId : null,
  };
}

/**
 * The provider of a two-leg distance. One straight line anywhere in it makes
 * the whole figure a straight line — a road plus a crow-flight is not a road.
 */
export function avoidedProvider(toGarage: string, fromGarage: string): 'google' | 'haversine' {
  return toGarage === 'haversine' || fromGarage === 'haversine' ? 'haversine' : 'google';
}

/**
 * Of several empties that rode out under one load, the one whose cycle
 * carries the count.
 *
 * One truck made one continuation, however many boxes it took — so one
 * `Garage → Port` was eliminated, not one per box. Earliest pairing wins,
 * with the id as a tie-break, so re-running never moves the count.
 */
export function pickCounted<T extends { id: string; createdAt: Date }>(realized: T[]): T | null {
  if (realized.length === 0) return null;
  return [...realized].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )[0];
}

/**
 * The share of the road these jobs would have needed that was not driven.
 *
 * The baseline is the counterfactual total: what was actually driven plus
 * what was eliminated — the only baseline this data can defend. Null when
 * either side is zero, because a rate over nothing is not a rate, and the
 * dashboard shows no rate rather than a made-up one.
 */
export function avoidanceRate(avoidedKm: number, actualKm: number): number | null {
  if (!(avoidedKm > 0) || !(actualKm > 0)) return null;
  return Math.round((avoidedKm / (avoidedKm + actualKm)) * 1000) / 10;
}

/** The earliest recorded timestamp among the named timeline keys. */
export function earliestTimestamp(
  steps: { key: string; timestamp: Date | null }[],
  keys: readonly string[],
): number | null {
  let earliest: number | null = null;
  for (const step of steps) {
    if (!keys.includes(step.key) || !step.timestamp) continue;
    const at = step.timestamp.getTime();
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours >= 48) return `${Math.round(hours / 24)} days`;
  return `${Math.round(hours)}h`;
}
