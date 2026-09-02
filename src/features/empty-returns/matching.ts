import { HOUR_MS, TIGHT_PAIRING_WINDOW_MS } from '@/data/emptyReturnData';
import { formatSpan } from '@/stores/emptyReturn.store';
import type {
  EmptyReturnRecord,
  FullLoadMission,
  IncompatibleLoad,
  PairingFriction,
  PairingSuggestion,
  SuggestionLabel,
} from '@/types/emptyReturn';

/**
 * The matching engine — one engine, two directions.
 *
 * It answers a single question from either end: *can this empty container's
 * next movement be welded to an upcoming full load, before the line's return
 * deadline?* Ask it from the container (`suggestLoadsFor`) or from the load
 * (`suggestEmptiesFor`) and the compatibility rule, the margin arithmetic and
 * the ranking are literally the same code path — which is what stops the
 * Matching workbench and a container's own detail dialog from recommending
 * different things about the same pair.
 *
 * ## Two hard gates, and everything else is a price
 *
 * The engine refuses a pairing for exactly two reasons, because exactly two
 * things cannot be arranged by a dispatcher on a phone:
 *
 * 1. **Same transporter.** The pairing exists so one truck drops the full load
 *    and takes the empty away on the same trip. Two carriers cannot share a
 *    trip, so a different transporter is not a worse pairing — it is not a
 *    pairing at all. A load with no transporter yet fails this too: confirming
 *    against one would book a trip nobody is committed to running.
 * 2. **Same container size.** A 40HC chassis is not a 20′ chassis. Physics.
 *    Since 2026-08-30 this is the *only* hard gate on equipment — see
 *    `incompatibilityReasons` for why the shipping line stopped being one.
 *
 * Everything else is a **friction** — real cost, named on the card, priced into
 * the score, and left for the operator to accept or refuse:
 *
 * - **Different port** (`reposition`) — the return depot and the pickup hub are
 *   two of Djibouti's four ports. That is a leg between them, not an
 *   impossibility.
 * - **Pickup after the deadline** (`reschedule`) — the appointment has to move
 *   earlier. Appointments move.
 * - **No deadline recorded** (`no-deadline`) — the margin is unknown, so the
 *   engine cannot promise the pairing beats a clock it cannot see.
 *
 * ### Why they stopped being gates
 *
 * They were gates until 2026-08-27, and on the real book they refused
 * **every single pairing**: 920 candidate pairs, 92 of which already agreed on
 * transporter and size, and the port gate rejected all 92 — because the empty
 * goes back to one port and the load is collected from another, which is the
 * normal shape of the work rather than an error. A gate that rejects everything
 * is not a rule, it is a bug, and it left an operator staring at 23 open loads
 * and 40 waiting boxes with the screen insisting none of them fit.
 *
 * **Shipping line is not a gate either** (the user's rule, 2026-08-27). What the
 * truck is carrying is the shipper's problem, not the carrier's. The line still
 * shows on the card so an operator can see it differs; it just cannot veto.
 *
 * ## Why a load whose slot has passed still counts
 *
 * A real open booking often sits past its own scheduled pickup — that is
 * precisely the backlog worth clearing. Rejecting those (as a demo with clean
 * data can afford to) would hide the most urgent half of the pool. Instead the
 * margin is measured from `max(pickupAt, now)`: the earliest the load can
 * actually be collected is now, so a stale slot stops flattering the score and
 * says so in its own reason line.
 */

/* ---------------------------------------------------------------------------
 * Compatibility
 * ------------------------------------------------------------------------- */

/** Two places are the same place iff their matching keys are equal. */
export function isSameLocation(record: EmptyReturnRecord, load: FullLoadMission): boolean {
  return Boolean(record.locationId) && record.locationId === load.locationId;
}

/**
 * The port or free zone a place belongs to.
 *
 * Necessary because the three sides of a pairing name places from three
 * different vocabularies, and none of them overlaps by string:
 *
 * - loads are collected at `Port de Djibouti`, `DCT Doraleh`, `SGTD`, `Horizon Terminal`
 * - empties go back to `Damerjog Depot`, `SGTD Yard`, `PK12 Park`, `Doraleh Depot`
 * - empties currently sit at `Boulaos Whse`, `Ambouli Depot`, `DIFTZ`, `Gabode Whse`
 *
 * `SGTD` and `SGTD Yard` are one zone. So are `DCT Doraleh` and `Doraleh
 * Depot`. Comparing the raw strings would make "same port / free zone" false
 * for every pair in the book, which is a gate that rejects everything rather
 * than a rule.
 *
 * Matched on a keyword so a depot renamed `SGTD Yard 2` keeps working, and
 * ordered because `Djibouti Multipurpose Port — Doraleh` names two of them: the
 * more specific zone has to win. An unrecognised place falls back to its own
 * normalised name, so it matches itself and nothing else — a new location is
 * conservative rather than promiscuous.
 */
const ZONE_KEYWORDS: readonly (readonly [keyword: string, zone: string])[] = [
  ['doraleh', 'doraleh'],
  ['sgtd', 'sgtd'],
  ['pk12', 'pk12'],
  ['damerjog', 'damerjog'],
  ['horizon', 'horizon'],
  ['diftz', 'diftz'],
  ['boulaos', 'boulaos'],
  ['ambouli', 'ambouli'],
  ['gabode', 'gabode'],
  ['tadjourah', 'tadjourah'],
  /* Before the country fallback: "Djibouti Free Zone (DFZ)" carries the
     country's name but is a free zone, not the port — without its own keyword
     it fell through to `djibouti-port` and the Port filter claimed it. */
  ['dfz', 'dfz'],
  /* Last: "Port de Djibouti" is the city's own port, but half the other names
     carry the country in them too. */
  ['djibouti', 'djibouti-port'],
];

export function zoneOf(place: string | null | undefined): string {
  const text = (place ?? '').trim().toLowerCase();
  if (!text) return '';
  for (const [keyword, zone] of ZONE_KEYWORDS) {
    if (text.includes(keyword)) return zone;
  }
  return text;
}

/**
 * Which of the known zones are actual ports — quay, gate, vessel — as opposed
 * to the free zones and inland depots the cargo is delivered into.
 *
 * The split exists because a filter has to offer them separately: a full load
 * is *collected at a port* and *delivered to a free zone*, and one combined
 * "Port / free zone" list asked the operator to know which was which.
 */
const PORT_ZONES: ReadonlySet<string> = new Set([
  'doraleh',
  'sgtd',
  'horizon',
  'damerjog',
  'tadjourah',
  'djibouti-port',
]);

export function isPortZone(zone: string): boolean {
  return PORT_ZONES.has(zone);
}

/** Display names for the known zones. An unknown zone has none — show its raw place name. */
const ZONE_LABELS: Record<string, string> = {
  doraleh: 'Doraleh',
  sgtd: 'SGTD',
  horizon: 'Horizon Terminal',
  damerjog: 'Damerjog',
  tadjourah: 'Tadjourah',
  'djibouti-port': 'Port of Djibouti',
  dfz: 'Djibouti Free Zone (DFZ)',
  diftz: 'DIFTZ',
  pk12: 'PK12 Free Zone',
  boulaos: 'Boulaos',
  ambouli: 'Ambouli',
  gabode: 'Gabode',
};

export function zoneLabel(zone: string): string | undefined {
  return ZONE_LABELS[zone];
}

/** The earliest the load can really be collected. Never earlier than now. */
export function effectivePickup(load: FullLoadMission, now: number): number {
  return Math.max(load.pickupAt, now);
}

/** Margin between collecting the full load and the empty's own deadline. Null with no deadline. */
export function marginFor(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number,
): number | null {
  if (!record.deadline) return null;
  return record.deadline - effectivePickup(load, now);
}

/** True when the empty goes back to the same port the load is collected from. */
export function isSamePort(record: EmptyReturnRecord, load: FullLoadMission): boolean {
  return zoneOf(record.returnDepot) === zoneOf(load.pickupHub);
}

/**
 * Why this load **cannot** take this container. Empty means it can.
 *
 * Only the two things a dispatcher cannot arrange. Everything else that used to
 * live here is now a friction — see `frictionsFor` and the note at the top of
 * this file about the day these gates refused all 920 pairs in the book.
 *
 * Returned as a list rather than a boolean because the screen shows it: an
 * operator who asks "why is there nothing to pair with?" gets the reason, not
 * silence.
 */
export function incompatibilityReasons(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number = Date.now(),
): string[] {
  const issues: string[] = [];

  /* ── One gate: size ───────────────────────────────────────────────────────
   *
   * **The shipping line stopped being a gate on 2026-08-30, at the user's
   * direction.** v19 had made it one the day before, on the argument that the
   * line owns the equipment; the yard's answer is that a pairing across two
   * lines is still a pairing, and refusing it costs a trip that did not need
   * driving. The line is not silent — `pairingReasons` names it as a note when
   * it differs, so nobody discovers it on the paperwork — it just cannot veto.
   *
   * That restores the rule of 2026-08-27 ("line never vetoes"), which the file
   * header still describes. What is NOT restored is the transporter gate that
   * came with it: transporter has not gated since v19 and still does not.
   *
   * Size stays, and it is the only thing here that is physics: a 40HC chassis
   * is not a 20′ chassis.
   *
   * Kept byte-identical in behaviour to the backend's
   * `empty-return-matching.util.ts`, which serves the same engine over
   * `/empty-returns/**\/suggestions`. If these two ever disagree the board
   * offers pairings the API refuses — so this change was made on both sides in
   * the same edit. */
  if (record.size !== load.size) issues.push('Different container size');

  /* The pickup has to beat the deadline. Measured from `effectivePickup`, not
     the raw slot: a real open booking often sits past its own scheduled
     pickup, and refusing those emptied the pool completely when v19's literal
     rule was tried against the live book on 2026-08-29. */
  if (record.deadline !== null && effectivePickup(load, now) > record.deadline) {
    issues.push('The pickup falls after this container’s return deadline');
  }
  return issues;
}

/**
 * What the operator has to arrange to make this pairing real.
 *
 * Each one is a cost the yard actually pays — a leg between two ports, a phone
 * call to move an appointment — so each is named in the operator's terms and
 * priced in `scoreOf`, rather than quietly deciding the answer for them.
 */
export function frictionsFor(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number,
): PairingFriction[] {
  const frictions: PairingFriction[] = [];

  if (!isSamePort(record, load)) {
    frictions.push({
      kind: 'reposition',
      label: 'Different port',
      detail: `The empty goes back to ${record.returnDepot} but the load is collected at ${load.pickupHub} — one leg between the two.`,
    });
  }

  if (!record.deadline) {
    frictions.push({
      kind: 'no-deadline',
      label: 'No deadline',
      detail: 'This container has no return deadline recorded, so the margin cannot be checked.',
    });
  } else if (effectivePickup(load, now) > record.deadline) {
    const late = effectivePickup(load, now) - record.deadline;
    frictions.push({
      kind: 'reschedule',
      label: 'Move the pickup',
      detail: `The pickup currently falls ${formatSpan(late)} after the return deadline — bring the appointment forward and the pairing holds.`,
    });
  }

  return frictions;
}

/* ---------------------------------------------------------------------------
 * Scoring
 * ------------------------------------------------------------------------- */

/**
 * 45–98, and it is an argument rather than a number.
 *
 * Three things move it, in the order an operator would weigh them: a
 * repositioning leg costs the most (the box is not already standing where the
 * truck collects, so somebody drives it there), a distant pickup costs a little
 * (the box sits longer), and a tight window costs a lot (it is one traffic jam
 * from a detention charge). Clamped at both ends so the label, not the decimal,
 * carries the recommendation.
 */
function scoreOf(params: {
  sameLocation: boolean;
  hoursToPickup: number;
  tight: boolean;
  frictions: PairingFriction[];
}): number {
  let score = 100;
  if (!params.sameLocation) score -= 8;
  score -= Math.min(25, Math.max(0, params.hoursToPickup) * 0.3);
  if (params.tight) score -= 20;

  /* Frictions are priced by how much work they actually are. Moving a booked
     appointment costs the most because it is a negotiation with the terminal;
     a leg between two ports is a truck-hour; an unknown deadline is a risk
     rather than a cost, so it is the cheapest of the three. */
  for (const friction of params.frictions) {
    if (friction.kind === 'reschedule') score -= 22;
    else if (friction.kind === 'reposition') score -= 12;
    else score -= 6;
  }

  return Math.min(98, Math.max(45, Math.round(score)));
}

/**
 * Why this pairing, in the operator's words.
 *
 * Deliberately concrete. "Score 84%" persuades nobody; "same yard, collected
 * 1d 16h before the deadline" is a sentence somebody can act on or argue with.
 */
function reasonsFor(params: {
  record: EmptyReturnRecord;
  load: FullLoadMission;
  now: number;
  marginMs: number;
  sameLocation: boolean;
  tight: boolean;
  frictions: PairingFriction[];
}): string[] {
  const { record, load, now, marginMs, sameLocation, tight, frictions } = params;
  const reasons: string[] = [];

  /* The transporter leads, because it is the gate that decided this pairing was
     possible at all and the one an operator most often doubts on sight. */
  reasons.push(`Same transporter — ${record.transporter} runs both legs`);
  reasons.push(
    isSamePort(record, load)
      ? `Same port — ${record.returnDepot} is where the load is collected`
      : `${record.returnDepot} → ${load.pickupHub} — one leg between two ports`,
  );
  if (sameLocation) {
    reasons.push(`No repositioning — the box is already at ${record.locationName}`);
  }
  /* Named only when it differs, and as a note rather than a warning: it no
     longer blocks anything, but an operator reading the card should not have to
     discover it on the paperwork. */
  if (record.line !== load.line) {
    reasons.push(`Different shipping line (${record.line} → ${load.line}) — allowed`);
  }

  const untilPickup = load.pickupAt - now;
  if (load.pickupAt < now) {
    reasons.push('Pickup slot already passed — this load is waiting for a truck now');
  } else if (untilPickup < 24 * HOUR_MS) {
    reasons.push('Pickup within 24h — a quick pairing');
  } else {
    reasons.push(`Pickup in ${formatSpan(untilPickup)}`);
  }

  if (!record.deadline) {
    reasons.push('No return deadline recorded — the margin cannot be checked');
  } else if (marginMs < 0) {
    reasons.push(
      `Pickup is ${formatSpan(-marginMs)} past the deadline — move it earlier and this holds`,
    );
  } else if (tight) {
    reasons.push(`Tight window — only ${formatSpan(marginMs)} of margin before the deadline`);
  } else {
    reasons.push(`${formatSpan(marginMs)} of margin before the return deadline`);
  }

  /* Named last and in full, because these are the sentences that turn a card
     into a task the operator can actually go and do. */
  for (const friction of frictions) reasons.push(friction.detail);

  return reasons;
}

/**
 * `RECOMMENDED` · `ALTERNATIVE` · `LAST OPTION`, applied after sorting.
 *
 * A tight pairing is never the recommendation, even when it is the only one —
 * the operator should see that it is the last resort before they take it.
 */
function labelSuggestions(sorted: PairingSuggestion[]): PairingSuggestion[] {
  return sorted.map((suggestion, index) => ({
    ...suggestion,
    /* A pairing that needs an appointment moved is never the headline, even when
       it is the only one left — the operator should see it is the last resort
       before they take it, exactly as a tight window is. */
    label: (suggestion.tight || suggestion.frictions.some((f) => f.kind === 'reschedule')
      ? 'LAST OPTION'
      : index === 0
        ? 'RECOMMENDED'
        : 'ALTERNATIVE') as SuggestionLabel,
  }));
}

/**
 * Clean pairings first, then safe ones, then best score.
 *
 * Friction count outranks score because a pairing needing nothing arranged is
 * categorically better than a cheaper-looking one that needs a phone call, and
 * tightness outranks score because it is a risk rather than a preference.
 */
function rank(a: PairingSuggestion, b: PairingSuggestion): number {
  return (
    a.frictions.length - b.frictions.length ||
    Number(a.tight) - Number(b.tight) ||
    b.score - a.score
  );
}

function buildSuggestion(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number,
): PairingSuggestion | null {
  if (incompatibilityReasons(record, load, now).length > 0) return null;

  const frictions = frictionsFor(record, load, now);
  /* Null margin means no deadline is recorded — that is a friction, not a
     refusal, so it scores as zero margin rather than dropping the pairing. */
  const marginMs = marginFor(record, load, now) ?? 0;

  const sameLocation = isSameLocation(record, load);
  /* Only a *positive* but small margin is "tight". A negative one is the
     reschedule friction, and calling it tight as well would price it twice. */
  const tight = marginMs > 0 && marginMs < TIGHT_PAIRING_WINDOW_MS;
  const hoursToPickup = Math.max(0, load.pickupAt - now) / HOUR_MS;

  return {
    record,
    load,
    marginMs,
    tight,
    sameLocation,
    frictions,
    score: scoreOf({ sameLocation, hoursToPickup, tight, frictions }),
    label: 'ALTERNATIVE',
    reasons: reasonsFor({ record, load, now, marginMs, sameLocation, tight, frictions }),
  };
}

/* ---------------------------------------------------------------------------
 * Direction A — I have an empty container: which loads can take it?
 * ------------------------------------------------------------------------- */

/**
 * Every viable pairing for one container, best first.
 *
 * Returns nothing at all unless the container is actually awaiting a decision.
 * A paired box has already been decided and a planned return has been chosen
 * against — offering either of them a suggestion invites an operator to
 * silently overwrite a decision somebody else made.
 */
export function suggestLoadsFor(
  record: EmptyReturnRecord | null | undefined,
  loads: FullLoadMission[],
  now: number,
  rejectedLoadIds: string[] = [],
): PairingSuggestion[] {
  if (!record || record.stage !== 'empty') return [];

  const suggestions = loads
    .filter((load) => !rejectedLoadIds.includes(load.id))
    .map((load) => buildSuggestion(record, load, now))
    .filter((suggestion): suggestion is PairingSuggestion => suggestion !== null)
    .sort(rank);

  return labelSuggestions(suggestions);
}

/** The loads that cannot take this container, each with its reasons. For the "Why?" disclosure. */
export function incompatibleLoadsFor(
  record: EmptyReturnRecord | null | undefined,
  loads: FullLoadMission[],
  now: number,
): IncompatibleLoad[] {
  if (!record) return [];
  return loads
    .map((load) => ({ load, issues: incompatibilityReasons(record, load, now) }))
    .filter((entry) => entry.issues.length > 0);
}

/* ---------------------------------------------------------------------------
 * Direction B — I have an upcoming load: which empties can serve it?
 * ------------------------------------------------------------------------- */

/**
 * Every container that could go out under this load, best first.
 *
 * The same engine read the other way, with one extra thumb on the scale:
 * urgency. A container two days from its deadline gains over one with a week
 * left, because pairing the urgent one removes a detention risk while pairing
 * the relaxed one only saves a trip. That preference belongs on this side of
 * the engine and not the other — from the container's point of view its own
 * urgency is a constant, not a tie-breaker.
 */
export function suggestEmptiesFor(
  load: FullLoadMission | null | undefined,
  records: EmptyReturnRecord[],
  now: number,
  rejectedRecordIds: string[] = [],
): PairingSuggestion[] {
  if (!load) return [];

  const suggestions = records
    .filter((record) => record.stage === 'empty' && !rejectedRecordIds.includes(record.id))
    .map((record) => {
      const suggestion = buildSuggestion(record, load, now);
      if (!suggestion || !record.deadline) return suggestion;
      const urgency = record.deadline - now;
      const bump = urgency < 48 * HOUR_MS ? 15 : urgency < 72 * HOUR_MS ? 8 : 0;
      if (bump === 0) return suggestion;
      return {
        ...suggestion,
        score: Math.min(98, suggestion.score + bump),
        reasons: [
          'Urgent deadline — pairing removes a detention risk today',
          ...suggestion.reasons,
        ],
      };
    })
    .filter((suggestion): suggestion is PairingSuggestion => suggestion !== null)
    .sort(rank);

  return labelSuggestions(suggestions);
}

/* ---------------------------------------------------------------------------
 * Pool hygiene
 * ------------------------------------------------------------------------- */

/**
 * Loads that no container has already claimed.
 *
 * The backend excludes claimed loads server-side (`asNextFull: null`), but a
 * pairing confirmed in this tab is real before the next refetch lands — without
 * this, the load an operator just used stays in the list long enough to be
 * offered to a second container and rejected by the API.
 */
export function unclaimedLoads(
  loads: FullLoadMission[],
  records: EmptyReturnRecord[],
): FullLoadMission[] {
  const claimed = new Set(
    records
      .map((record) => record.nextFull?.missionId)
      .filter((id): id is string => Boolean(id)),
  );
  return loads.filter((load) => !claimed.has(load.id));
}
