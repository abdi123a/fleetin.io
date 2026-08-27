import { HOUR_MS, TIGHT_PAIRING_WINDOW_MS } from '@/data/emptyReturnData';
import { formatSpan } from '@/stores/emptyReturn.store';
import type {
  EmptyReturnRecord,
  FullLoadMission,
  IncompatibleLoad,
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
 * ## What "compatible" means
 *
 * Four hard gates, and they are hard because the yard is:
 *
 * 1. **Same transporter.** The pairing exists so one truck drops the full load
 *    and takes the empty away on the same trip. Two carriers cannot share a
 *    trip, so a different transporter is not a worse pairing — it is not a
 *    pairing at all.
 * 2. **Same container size.** A 40HC chassis is not a 20′ chassis.
 * 3. **Same port / free zone.** The depot the empty owes itself to and the hub
 *    the load is collected from have to be the same zone — that is what makes
 *    the two legs one trip instead of two. Compared by zone rather than by
 *    name, because `SGTD` and `SGTD Yard` are one place (see `zoneOf`).
 * 4. **Collected before the deadline.** A pickup after the empty's return
 *    deadline protects nothing — the box is already accruing detention by then.
 *
 * **Shipping line is deliberately not a gate** (the user's rule, 2026-08-27).
 * It was one until now, on the assumption that a Maersk box cannot go out under
 * a CMA CGM booking — but what the truck is carrying is the shipper's problem,
 * not the carrier's, and refusing those pairings only sent empty trucks across
 * Djibouti. The line still shows on the card so an operator can see it differs;
 * it just cannot veto.
 *
 * Nothing else can veto a pairing. Timing and tightness only move the *score*,
 * because they are trade-offs an operator is allowed to make and the engine is
 * not allowed to make for them.
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

/**
 * Why this load cannot take this container. Empty means it can.
 *
 * Returned as a list rather than a boolean because the screen shows it: an
 * operator who asks "why is there nothing to pair with?" gets the three
 * reasons, not silence.
 */
export function incompatibilityReasons(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number,
): string[] {
  const issues: string[] = [];
  if (!load.transporter || record.transporter !== load.transporter) {
    /* An unassigned load fails this too, and should: "same transporter" cannot
       be true of a load that has no transporter yet, and confirming a pairing
       on one would book a trip nobody is committed to running. */
    issues.push(
      load.transporter ? 'Different transporter' : 'Load has no transporter assigned yet',
    );
  }
  if (record.size !== load.size) issues.push('Different container size');
  if (zoneOf(record.returnDepot) !== zoneOf(load.pickupHub)) {
    issues.push('Different port / free zone');
  }
  if (!record.deadline) {
    issues.push('This container has no return deadline recorded');
  } else if (effectivePickup(load, now) > record.deadline) {
    issues.push('Pickup falls after the return deadline');
  }
  return issues;
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
function scoreOf(params: { sameLocation: boolean; hoursToPickup: number; tight: boolean }): number {
  let score = 100;
  if (!params.sameLocation) score -= 18;
  score -= Math.min(25, Math.max(0, params.hoursToPickup) * 0.3);
  if (params.tight) score -= 20;
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
}): string[] {
  const { record, load, now, marginMs, sameLocation, tight } = params;
  const reasons: string[] = [];

  reasons.push(
    sameLocation
      ? `Same location — the box is already at ${record.locationName}`
      : `Same zone — ${record.returnDepot} and ${load.pickupHub} are one trip`,
  );
  reasons.push(`Same transporter — ${record.transporter} runs both legs`);
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

  if (tight) {
    reasons.push(`Tight window — only ${formatSpan(marginMs)} of margin before the deadline`);
  } else {
    reasons.push(`${formatSpan(marginMs)} of margin before the return deadline`);
  }

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
    label: (suggestion.tight
      ? 'LAST OPTION'
      : index === 0
        ? 'RECOMMENDED'
        : 'ALTERNATIVE') as SuggestionLabel,
  }));
}

/** Safe first, then best score. Tightness outranks score because it is a risk, not a preference. */
function rank(a: PairingSuggestion, b: PairingSuggestion): number {
  return Number(a.tight) - Number(b.tight) || b.score - a.score;
}

function buildSuggestion(
  record: EmptyReturnRecord,
  load: FullLoadMission,
  now: number,
): PairingSuggestion | null {
  if (incompatibilityReasons(record, load, now).length > 0) return null;

  const marginMs = marginFor(record, load, now);
  if (marginMs === null) return null;

  const sameLocation = isSameLocation(record, load);
  const tight = marginMs < TIGHT_PAIRING_WINDOW_MS;
  const hoursToPickup = Math.max(0, load.pickupAt - now) / HOUR_MS;

  return {
    record,
    load,
    marginMs,
    tight,
    sameLocation,
    score: scoreOf({ sameLocation, hoursToPickup, tight }),
    label: 'ALTERNATIVE',
    reasons: reasonsFor({ record, load, now, marginMs, sameLocation, tight }),
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
