/**
 * The pairing engine — one engine, two directions, ported from the v19
 * Empty Container design and made authoritative here on 2026-08-29.
 *
 * It answers a single question from either end: *can this empty container's
 * next movement be welded to an upcoming full load, before the line's return
 * deadline?* Ask it from the container (`loadsFor`) or from the load
 * (`emptiesFor`) and the gate, the arithmetic and the ranking are literally
 * the same code — which is what stops the board and a container's own dialog
 * from recommending different things about the same pair.
 *
 * ## One hard gate
 *
 * **Same container size.** A 40HC chassis is not a 20' chassis. Physics.
 *
 * There were two until 2026-08-30. Same shipping line was the other, on the
 * argument that the line owns the equipment — the user removed it the day
 * after it was introduced: a pairing across two lines is still a pairing, and
 * refusing it costs a trip nobody needed to drive. The line is still reported
 * on the pairing, it just does not veto.
 *
 * Plus one window rule: the load's appointment must fall between *now* and the
 * empty's own return deadline. A slot in the past cannot be driven, and a slot
 * after the deadline does not save the detention it exists to avoid.
 *
 * > History, because this gate has now moved twice. Before 2026-08-29 the rule
 * > was "same transporter, line irrelevant" — one truck runs both legs. v19
 * > inverted it on 2026-08-29: transporter out, line in. On 2026-08-30 the
 * > user took the line out too, leaving size alone. Transporter has not gated
 * > since v19 and does not now; anything that reads a transporter here is
 * > reading the wrong field.
 *
 * ## Score is an argument, not a number
 *
 * 100, less the repositioning distance, less how long the box must wait for the
 * slot, less a penalty when the margin is under six hours. From the load's side
 * an urgent box gains a bump, because pairing it removes a detention risk
 * today. Every deduction is named in `reasons` so an operator can argue with
 * the ranking instead of trusting it.
 */

export const HOUR_MS = 3_600_000;
/** Under this much margin between pickup and deadline, a pairing is "risky". */
export const TIGHT_WINDOW_MS = 6 * HOUR_MS;

export type SuggestionLabel = 'RECOMMENDED' | 'ALTERNATIVE' | 'LAST OPTION';

/** The empty side, reduced to only what the engine reads. */
export interface MatchEmpty {
  id: string;
  line: string | null;
  size: string | null;
  /** Epoch ms. */
  deadline: number | null;
  /** Road distance from where the box sits to the load's pickup hub. */
  distanceKm: number;
  stage: string;
}

/** The full-load side, reduced to only what the engine reads. */
export interface MatchLoad {
  id: string;
  line: string | null;
  size: string | null;
  /** Epoch ms — the booked pickup slot. */
  appointment: number | null;
  /** How many empties this load can absorb in total (v19's `qty`). */
  slots: number;
  /** How many it has already taken. */
  taken: number;
}

export interface Suggestion<E, L> {
  empty: E;
  load: L;
  /** Margin between collecting the full load and the empty's own deadline. */
  windowMs: number;
  risky: boolean;
  score: number;
  label: SuggestionLabel;
  reasons: string[];
}

function fmtSpan(ms: number): string {
  const a = Math.abs(ms);
  const d = Math.floor(a / 86_400_000);
  const h = Math.floor((a % 86_400_000) / HOUR_MS);
  const m = Math.floor((a % HOUR_MS) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Why this pair is refused, or an empty list when it is legal.
 *
 * Returned as reasons rather than a boolean because every surface shows it: an
 * operator asking "why is there nothing to pair with?" gets an answer, not
 * silence.
 */
export function incompatibility(empty: MatchEmpty, load: MatchLoad, now: number): string[] {
  const issues: string[] = [];
  if (load.slots - load.taken <= 0) issues.push('This load has no container slot left');
  /* The shipping line does NOT gate — removed 2026-08-30 at the user's
     direction, one day after v19 introduced it. A pairing across two lines is
     still a pairing, and refusing it costs a trip that did not need driving.
     The difference is still surfaced to the operator as a note by the
     frontend's `pairingReasons`; it simply cannot refuse the pair here.
     The frontend's `matching.ts` carries the identical change — these two are
     one engine, and if they disagree the board offers pairings this API
     refuses. */
  if (!empty.size || !load.size || empty.size !== load.size) {
    issues.push(
      load.size && empty.size
        ? `Different container size (${empty.size} → ${load.size})`
        : 'Container size not recorded on one side',
    );
  }
  if (load.appointment === null) issues.push('This load has no pickup slot booked');
  else if (effectivePickup(load, now) > (empty.deadline ?? Infinity)) {
    issues.push('The pickup falls after this container’s return deadline');
  }
  return issues;
}

/**
 * The earliest this load can really be collected. Never earlier than now.
 *
 * v19 refuses a load whose slot has already passed (`appointment < now`). That
 * is safe in a mockup, where every fixture is forward-dated — and wrong on the
 * real book, where an open booking routinely sits past its own scheduled
 * pickup because nobody has driven it yet. Measured live on 2026-08-29 the
 * literal rule rejected **every** load in the pool, which is not a rule but an
 * outage: the backlog is precisely the most urgent thing to clear.
 *
 * So a stale slot is not refused, it is re-based: the earliest it can actually
 * be collected is now, which stops it flattering its own score and still lets
 * the deadline gate do its job. Same correction the previous engine carried.
 */
export function effectivePickup(load: MatchLoad, now: number): number {
  return Math.max(load.appointment ?? now, now);
}

/** The shared body: gate, price, explain. `null` when the pair is refused. */
function build<E extends MatchEmpty, L extends MatchLoad>(
  empty: E,
  load: L,
  now: number,
  urgencyBump: boolean,
): Suggestion<E, L> | null {
  if (incompatibility(empty, load, now).length > 0) return null;

  const appointment = effectivePickup(load, now);
  const deadline = empty.deadline as number;
  const windowMs = deadline - appointment;
  const risky = windowMs < TIGHT_WINDOW_MS;

  let score =
    100 -
    Math.min(30, empty.distanceKm * 1.5) -
    Math.min(25, ((appointment - now) / HOUR_MS) * 0.3);
  if (risky) score -= 20;

  const reasons: string[] = [];
  /* From the load's side only: a box two days from its deadline outranks one
     with a week left, because pairing the urgent one removes a detention risk
     while pairing the relaxed one only saves a trip. From the container's own
     side its urgency is a constant, not a tie-breaker. */
  if (urgencyBump) {
    const urgency = deadline - now;
    if (urgency < 48 * HOUR_MS) {
      score += 15;
      reasons.push('Urgent deadline — pairing avoids a separate empty movement');
    } else if (urgency < 72 * HOUR_MS) {
      score += 8;
    }
  }

  reasons.push(
    (load.appointment ?? now) < now
      ? 'Pickup slot already passed — this load is waiting for a truck now'
      : appointment - now < 24 * HOUR_MS
        ? 'Pickup within 24h — a quick pairing'
        : `Pickup in ${fmtSpan(appointment - now)}`,
  );
  reasons.push(
    empty.distanceKm === 0
      ? 'Same hub as the pickup — no repositioning leg'
      : `${empty.distanceKm} km from the pickup`,
  );
  reasons.push(
    risky
      ? `Tight window — only ${fmtSpan(windowMs)} of margin before the deadline`
      : `${fmtSpan(windowMs)} of margin before the return deadline`,
  );

  return {
    empty,
    load,
    windowMs,
    risky,
    score: Math.round(Math.min(98, Math.max(1, score))),
    label: 'ALTERNATIVE',
    reasons,
  };
}

/**
 * Clean pairings first, then best score, then label.
 *
 * A risky pairing is never the headline even when it is the only one — the
 * operator should see it is the last resort before they take it.
 */
function rank<E, L>(list: Suggestion<E, L>[]): Suggestion<E, L>[] {
  const sorted = [...list].sort(
    (a, b) => Number(a.risky) - Number(b.risky) || b.score - a.score,
  );
  return sorted.map((s, index) => ({
    ...s,
    label: s.risky ? 'LAST OPTION' : index === 0 ? 'RECOMMENDED' : 'ALTERNATIVE',
  }));
}

/** Direction A — I have an empty container: which loads can take it? */
export function loadsFor<E extends MatchEmpty, L extends MatchLoad>(
  empty: E | null | undefined,
  loads: L[],
  now: number,
): Suggestion<E, L>[] {
  if (!empty || empty.stage !== 'empty') return [];
  return rank(
    loads
      .map((load) => build(empty, load, now, false))
      .filter((s): s is Suggestion<E, L> => s !== null),
  );
}

/** Direction B — I have an upcoming load: which empties can serve it? */
export function emptiesFor<E extends MatchEmpty, L extends MatchLoad>(
  load: L | null | undefined,
  empties: E[],
  now: number,
): Suggestion<E, L>[] {
  if (!load) return [];
  return rank(
    empties
      .filter((empty) => empty.stage === 'empty')
      .map((empty) => build(empty, load, now, true))
      .filter((s): s is Suggestion<E, L> => s !== null),
  );
}


/* ---------------------------------------------------------------------------
 * Booking → engine input
 * ------------------------------------------------------------------------- */

/**
 * A booking's container size, from the two fields that might carry it.
 *
 * A byte-for-byte mirror of `normalizeContainerSize`/`resolveContainerSize` in
 * the frontend's `@/data/emptyReturnData`. Size is now a **hard gate**, so the
 * two sides agreeing on what "40HC" means stopped being cosmetic: if the
 * backend normalised `"Container (40ft) HC"` differently from the UI, the board
 * would offer a pairing the API then refused. Change one, change both.
 */
export function normalizeContainerSize(cargo: string | null | undefined): string {
  const raw = (cargo ?? '').trim();
  if (!raw) return 'Unspecified';
  const flat = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (/40hc|highcube|hicube|45/.test(flat)) return '40HC';
  if (/40/.test(flat)) return "40'";
  if (/20/.test(flat)) return "20'";
  return raw;
}

const SIZES = ['20\'', '40\'', '40HC'];

export function resolveContainerSize(
  shipmentCategory: string | null | undefined,
  cargoType: string | null | undefined,
): string {
  const fromCategory = normalizeContainerSize(shipmentCategory);
  if (SIZES.includes(fromCategory)) return fromCategory;
  const fromCargo = normalizeContainerSize(cargoType);
  if (SIZES.includes(fromCargo)) return fromCargo;
  return fromCargo !== 'Unspecified' ? fromCargo : fromCategory;
}

/** Minimal booking shape the mappers read — keeps them testable without Prisma. */
export interface BookingLike {
  id: string;
  reference: string;
  shippingLine: string | null;
  shipmentCategory: string | null;
  cargoType: string | null;
  containerReturnDeadline: Date | null;
  scheduledPickupTime: Date | null;
  emptySlots: number | null;
  emptyReturnDistanceKm: unknown;
}

const toNumber = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v as never);
  return Number.isFinite(n) ? n : 0;
};

/** The empty side of the engine, read off a delivered booking. */
export function emptyFromBooking(b: BookingLike, stage = 'empty'): MatchEmpty & { reference: string } {
  return {
    id: b.id,
    reference: b.reference,
    line: b.shippingLine,
    size: resolveContainerSize(b.shipmentCategory, b.cargoType),
    deadline: b.containerReturnDeadline ? b.containerReturnDeadline.getTime() : null,
    distanceKm: toNumber(b.emptyReturnDistanceKm),
    stage,
  };
}

/** The full-load side, read off an open booking plus how many slots it has used. */
export function loadFromBooking(b: BookingLike, taken: number): MatchLoad & { reference: string } {
  return {
    id: b.id,
    reference: b.reference,
    line: b.shippingLine,
    size: resolveContainerSize(b.shipmentCategory, b.cargoType),
    appointment: b.scheduledPickupTime ? b.scheduledPickupTime.getTime() : null,
    slots: b.emptySlots ?? 1,
    taken,
  };
}
