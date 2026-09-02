/**
 * Which shipments this person has already opened.
 *
 * A shipment nobody has opened is news, and there is nowhere on the record to
 * say so: "seen" is per reader, not per shipment, and the API has no per-user
 * read state to hang it on. So it lives in this browser, next to the sidebar
 * and theme preferences — the same class of fact, and the same consequence if
 * it is lost (a row goes back to looking new, which is the safe direction).
 *
 * ## The mark means exactly what its tooltip says
 *
 * "Nobody has opened this shipment yet." Opening one therefore clears it, and
 * nothing else does — not a timer, not the status moving on.
 *
 * There used to be a ten-minute grace window: a shipment stayed flagged after
 * you opened it, so you could walk back to the row you had just visited. It
 * was removed on 2026-09-01, because the badge spent those ten minutes making
 * a claim its own tooltip contradicted — the reader who had just opened the
 * thing was being told nobody had. "Which row did I just check?" is a real
 * question and it wants its own mark, not this one wearing two meanings.
 */
const KEY = 'fleetin.shipments.seen';

/**
 * How many opened shipments to remember.
 *
 * Bounded by COUNT, never by AGE — see `markShipmentSeen`. Five hundred is far
 * past the working set: the mark only ever shows on a shipment still at
 * Created, and those leave that rung within days.
 */
const SEEN_LIMIT = 500;

type SeenMap = Record<string, number>;

/* Every access is guarded: `localStorage` throws outright in a browser set to
   block site data, and returns junk if another tab wrote something else here.
   A reader whose storage is unavailable sees every shipment as new, which is
   the honest fallback — this has never told them otherwise. */
function read(): SeenMap {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as SeenMap;
  } catch {
    return {};
  }
}

/**
 * Note that this shipment has been opened.
 *
 * The map is capped at `SEEN_LIMIT`, oldest dropped first, and that cap is the
 * ONLY thing that ever removes an entry.
 *
 * It used to drop anything older than the grace window instead, on the
 * reasoning that an aged-out entry "carries nothing". It carries everything:
 * `isShipmentNew` reads a missing entry as *never opened*, so a shipment you
 * had read went back to shouting NEW — permanently — the moment you opened any
 * other shipment. Proven on 2026-09-01: seeding one 30-minute-old entry and
 * then opening a different shipment left the first one unrecorded and flagged
 * again. Age is not what this map stores; the fact of having opened it is.
 */
export function markShipmentSeen(id: string, now = Date.now()): void {
  try {
    const others = Object.entries(read())
      .filter((entry): entry is [string, number] => entry[0] !== id && typeof entry[1] === 'number')
      /* Newest first, so the cap drops the reader's oldest history rather than
         whatever `Object.entries` happened to yield first. */
      .sort((a, b) => b[1] - a[1])
      .slice(0, SEEN_LIMIT - 1);

    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify(Object.fromEntries([[id, now], ...others])),
    );
  } catch {
    /* Nothing to do: unwritable storage means the row stays flagged. */
  }
}

/** The map, read once so a list of fifty rows costs one parse rather than fifty. */
export function readSeenShipments(): SeenMap {
  return read();
}

/**
 * Is this shipment still news?
 *
 * Never opened by this reader. A shipment nobody opens stays flagged
 * indefinitely — that is the point of the mark; it is waiting for somebody,
 * not for a timer.
 */
export function isShipmentNew(id: string, seen: SeenMap): boolean {
  return typeof seen[id] !== 'number';
}
