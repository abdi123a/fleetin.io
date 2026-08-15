/**
 * Every human-readable reference the backend mints, in one shape:
 * THREE LETTERS, a hyphen, and FIVE DIGITS — `INV-00004`, `MSN-08817`.
 *
 * That is the frontend's scheme (`src/lib/ids.ts`), and this file is the
 * server half of it. Before this the backend spoke a longer dialect with the
 * year baked in — `INV-2026-1`, `MSN-2026-8802`, `BKG-2026-1187` — up to
 * thirteen characters for something a dispatcher reads down a phone line.
 * The year carried no information a timestamp column does not already hold.
 *
 * Legacy values still sitting in the database are read, never written: the
 * scan below takes each row's LAST run of digits, so `MSN-2026-8802` counts
 * as 8802 and the next mint lands at `MSN-08803` rather than colliding with
 * it. Renumbering the rows themselves is `scripts/renumber-references.ts`.
 */

/** Digits after the hyphen. Five, always. */
export const ID_DIGITS = 5;

/** The ceiling the scheme allows. Passing it is a bug, not a rollover. */
export const ID_MAX = 10 ** ID_DIGITS - 1;

/** The trailing number of a reference in either dialect. NaN if it has none. */
function sequenceOf(value: string): number {
  const digits = /(\d+)(?!.*\d)/.exec(value)?.[1];
  return digits ? parseInt(digits, 10) : NaN;
}

/** `formatReference('INV', 4)` -> `INV-00004`. */
export function formatReference(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(ID_DIGITS, '0')}`;
}

/**
 * The next free reference for a `PREFIX-#####` id space, scanning existing
 * rows rather than a `Math.random()` generator — the frontend's own id
 * generators are flagged as collision-prone (BUSINESS_RULES.md §9). Not a
 * real database sequence/counter table; that is out of scope here, but this
 * at minimum can't collide the way the frontend's generators can.
 */
export async function nextReference(
  delegate: { findMany: (args: unknown) => Promise<{ reference: string }[]> },
  prefix: string,
  startAt = 0,
): Promise<string> {
  return nextReferenceField(delegate, 'reference', prefix, startAt);
}

/**
 * Same scan as `nextReference`, generalised to a named field — the finance
 * models predate the `reference` convention and each mint their own
 * human-readable id under a differently-named unique column (`Invoice.number`,
 * `CreditFacility.facilityNumber`, etc).
 */
export async function nextReferenceField(
  delegate: { findMany: (args: unknown) => Promise<Record<string, unknown>[]> },
  field: string,
  prefix: string,
  startAt = 0,
): Promise<string> {
  const rows = await delegate.findMany({
    select: { [field]: true },
    where: { [field]: { startsWith: `${prefix}-` } },
  });
  const max = rows.reduce((highest, row) => {
    const value = row[field];
    const n = typeof value === 'string' ? sequenceOf(value) : NaN;
    return Number.isFinite(n) && n > highest ? n : highest;
  }, startAt);
  const next = max + 1;
  if (next > ID_MAX) {
    throw new Error(`nextReference: ${prefix} sequence ${next} exceeds the ${ID_DIGITS}-digit scheme`);
  }
  return formatReference(prefix, next);
}
