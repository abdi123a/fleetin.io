/**
 * Every reference number in FLEETIN, in one place.
 *
 * The rule, set by the user 2026-08-13: a reference is THREE LETTERS, a
 * hyphen, and at most FIVE DIGITS — `SHI-00412`. Short enough to read down a
 * phone line to a driver, wide enough to never run out, and fixed-width so a
 * column of them sorts and scans.
 *
 * Before this, the app spoke six dialects at once: `MSN-2026-8801` (twelve
 * characters), `ER-101` and `FM-210` (two letters), `C-101` and `D-001` (one),
 * `CYC-0001` and `CHN-001` (three widths in one module). Every one of them was
 * a Fleetin reference — ours to number — and none of them looked like any of
 * the others.
 *
 * Three families of prefix live here and they are not the same thing:
 *
 * - MINTED references are handed out by this module and nothing else may
 *   invent one. Money (`INV`, `PAY`, and the internal `HLD`/`DRW`/`RPY`/`LEG`),
 *   work (`PRJ`, `SHI`, `BKG`, `MSN`), and the register around them
 *   (`VEH`, `DRV`, `DOC`, `CTC`, `LOC`). Real `Booking`/`EmptyReturnCycle`/
 *   `EmptyReturnChain` references (`BKG-2026-#####`, `CYC-2026-#####`,
 *   `CHN-2026-#####`) are minted by the backend's own `nextReference` helper,
 *   a different scheme entirely — this module never parses or mints them.
 * - PARTY references (`SHP` shipper, `PTR` transporter) are NOT minted here.
 *   They are join keys that Shippers, Partners and the Empty Return module all
 *   key off; renaming them is a cross-module migration, not an ID cleanup.
 *   They are listed only so `idKindOf` can name one when it sees it.
 * - FOREIGN identifiers are not ours at all: an ISO 6346 container number
 *   (`MSCU-889-2314`), a driving licence (`DL-DJ-44821`), a client's contract
 *   reference (`CT-2026-AMN-04`), a bill of lading. They belong to somebody
 *   else's numbering system and renumbering them would be a lie. They are
 *   never touched, and `parseId` returning null for them is correct, not a gap.
 *
 * Note the deliberate near-collision: `SHP` is a SHIPPER and `SHI` is a
 * SHIPMENT. That is the user's chosen scheme — shipper ids predate shipments
 * everywhere in the codebase, so the new tier took the free prefix.
 */

// ─── The scheme ─────────────────────────────────────────────────────────────

/** Digits after the hyphen. Five, always — see the note above on width. */
export const ID_DIGITS = 5;

/** The ceiling the scheme allows. Passing it is a bug, not a rollover. */
export const ID_MAX = 10 ** ID_DIGITS - 1;

/** Reference kinds this module mints. */
export type IdKind =
  // ── The money hierarchy ───────────────────────────────────────────────
  | 'project'
  | 'shipment'
  | 'booking'
  | 'invoice'
  | 'payment'
  | 'hold'
  | 'draw'
  | 'repayment'
  | 'costLine'
  // ── Operations ────────────────────────────────────────────────────────
  | 'mission'
  // ── The register ──────────────────────────────────────────────────────
  | 'vehicle'
  | 'driver'
  | 'document'
  | 'contact'
  | 'location';

export const ID_PREFIX: Record<IdKind, string> = {
  project: 'PRJ',
  shipment: 'SHI',
  booking: 'BKG',
  invoice: 'INV',
  /** A transporter's settlement for one shipment — and the voucher he signs. */
  payment: 'PAY',
  hold: 'HLD',
  draw: 'DRW',
  repayment: 'RPY',
  /** One cost line on one booking. Internal — never shown as a headline. */
  costLine: 'LEG',
  /**
   * One operational trip in the Shipments module. Kept distinct from `BKG`
   * on purpose: finance's bookings and operations' missions are separate
   * records today, and giving them one prefix would advertise a join that
   * does not exist. When the two datasets are unified, this prefix retires.
   */
  mission: 'MSN',
  vehicle: 'VEH',
  driver: 'DRV',
  /** Any uploaded file on a party, vehicle or driver. */
  document: 'DOC',
  /** A named person at a shipper or transporter. */
  contact: 'CTC',
  location: 'LOC',
};

/** What each prefix is called on screen. */
export const ID_LABEL: Record<IdKind, string> = {
  project: 'Project',
  shipment: 'Shipment',
  booking: 'Booking',
  invoice: 'Invoice',
  payment: 'Payment',
  hold: 'Hold',
  draw: 'Draw',
  repayment: 'Repayment',
  costLine: 'Cost line',
  mission: 'Mission',
  vehicle: 'Vehicle',
  driver: 'Driver',
  document: 'Document',
  contact: 'Contact',
  location: 'Location',
};

/**
 * Prefixes owned elsewhere. Read-only knowledge: this module recognises them
 * so `idKindOf` can label one, and never mints them.
 *
 * `SHP`/`PTR` are Fleetin's own party keys — minted by whatever creates a
 * shipper or a partner, joined on by four modules, and out of scope for a
 * renumbering. The rest are other people's numbers.
 */
export const FOREIGN_PREFIX: Record<string, string> = {
  SHP: 'Shipper',
  PTR: 'Transporter',
  CF: 'Contract facility',
  CL: 'Credit line',
  DPCS: 'DPCS allocation',
};

const KIND_OF_PREFIX = new Map<string, IdKind>(
  (Object.entries(ID_PREFIX) as [IdKind, string][]).map(([kind, prefix]) => [prefix, kind]),
);

// ─── Formatting & parsing ───────────────────────────────────────────────────

/**
 * `formatId('shipment', 412)` -> `SHI-00412`.
 *
 * Throws past the ceiling rather than truncating: a silently-wrapped reference
 * would collide with a live record, and a collision in a payment reference is
 * the one failure this whole module exists to prevent.
 */
export function formatId(kind: IdKind, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`formatId: sequence must be a positive integer, got ${sequence}`);
  }
  if (sequence > ID_MAX) {
    throw new Error(
      `formatId: ${ID_PREFIX[kind]} sequence ${sequence} exceeds the ${ID_DIGITS}-digit scheme`,
    );
  }
  return `${ID_PREFIX[kind]}-${String(sequence).padStart(ID_DIGITS, '0')}`;
}

export interface ParsedId {
  prefix: string;
  kind: IdKind | null;
  sequence: number;
}

/** Null for anything that is not `AAA-12345`, including legacy references. */
export function parseId(id: string): ParsedId | null {
  const match = /^([A-Z]{2,4})-(\d{1,5})$/.exec(id.trim());
  if (!match) return null;
  const [, prefix = '', digits = ''] = match;
  return { prefix, kind: KIND_OF_PREFIX.get(prefix) ?? null, sequence: Number(digits) };
}

/**
 * Where hashed references start. Everything below is reserved for numbers a
 * human chose — seed data, hand-written fixtures, the first few of anything —
 * so a hash can never land on one of them.
 */
const HASH_FLOOR = 10_000;

/**
 * A reference derived from arbitrary text, not from a counter:
 * `hashedId('location', 'Obock Transit Yard')` -> `LOC-43108`.
 *
 * For records that have no number of their own and must not get a fresh one
 * every time they are rebuilt — a destination the yard list has never heard of,
 * for instance. The same text always yields the same reference, which is what
 * makes equality comparisons on it meaningful.
 *
 * It lands at or above `HASH_FLOOR`, so it cannot collide with a seeded id.
 */
export function hashedId(kind: IdKind, text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % (ID_MAX - HASH_FLOOR);
  }
  const id = formatId(kind, HASH_FLOOR + hash);
  registerId(id);
  return id;
}

/**
 * Re-numbers a legacy reference into the scheme, keeping its digits:
 * `derivedId('mission', 'MSN-2026-8801')` -> `MSN-08801`.
 *
 * The point is DETERMINISM. Old ids are scattered across data files that
 * reference each other by string — a shipment naming its bookings, a return
 * record naming its shipment — so the migration has to map the same input to
 * the same output every time it runs, from any file, without a shared table.
 * Taking the trailing digits does that; minting a fresh sequence would not.
 *
 * Only the LAST run of digits is kept, so `MSN-2026-8801` and `ER-101` both
 * work. Text with no digits at all falls through to `hashedId`.
 */
export function derivedId(kind: IdKind, legacy: string): string {
  const digits = /(\d+)(?!.*\d)/.exec(legacy)?.[1];
  if (digits) {
    const sequence = Number(digits.slice(-ID_DIGITS));
    if (sequence >= 1) {
      const id = formatId(kind, sequence);
      registerId(id);
      return id;
    }
  }
  return hashedId(kind, legacy);
}

export function isId(id: string, kind: IdKind): boolean {
  return parseId(id)?.kind === kind;
}

/** Human label for a reference — 'Shipment', 'Shipper', or null if unknown. */
export function idKindOf(id: string): string | null {
  const parsed = parseId(id);
  if (!parsed) return null;
  if (parsed.kind) return ID_LABEL[parsed.kind];
  return FOREIGN_PREFIX[parsed.prefix] ?? null;
}

// ─── The sequencer ──────────────────────────────────────────────────────────

/*
 * One counter per kind, held in module scope.
 *
 * Seed data and live records share a number line, so the counters must be
 * primed with everything already minted before the first `nextId`. Data
 * modules do that with `registerIds` at the bottom of their file; forgetting
 * to would hand a new payment the reference of an existing one.
 *
 * When a real backend owns these, `nextId` becomes a server call and this
 * counter becomes the optimistic local fallback — the call sites do not change.
 */
const counters = new Map<IdKind, number>();

/** Moves a kind's counter past `id` if that id is higher. Unknown ids ignored. */
export function registerId(id: string): void {
  const parsed = parseId(id);
  if (!parsed?.kind) return;
  const current = counters.get(parsed.kind) ?? 0;
  if (parsed.sequence > current) counters.set(parsed.kind, parsed.sequence);
}

export function registerIds(ids: Iterable<string>): void {
  for (const id of ids) registerId(id);
}

/** The next free reference of this kind. Never returns one already registered. */
export function nextId(kind: IdKind): string {
  const next = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, next);
  return formatId(kind, next);
}

/** Highest sequence handed out (or registered) for a kind. Mostly for tests. */
export function peekSequence(kind: IdKind): number {
  return counters.get(kind) ?? 0;
}

/** Tests only — drops every counter back to zero. */
export function resetIdSequences(): void {
  counters.clear();
}
