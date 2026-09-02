/**
 * The places a shipment can start and end, as this account keeps them.
 *
 * The lists began as two frozen constants — the corridor's ports and free
 * zones — with a "+ Add custom location" that could only ever append. A name
 * typed with a typo was permanent, a terminal this account never uses sat in
 * the picker forever, and the only repair was clearing site data.
 *
 * So the stored list IS the list. It is seeded from the built-in constants the
 * first time it is read (folding in whatever the old append-only key had
 * collected), and after that every add, rename and delete edits one array.
 * Nothing here is privileged: a port put in by us can be renamed or removed the
 * same way one typed here can, because that distinction only ever existed to
 * protect a list nobody could repair.
 *
 * Past shipments are unaffected. A shipment stores its pickup and drop-off as
 * text at creation, so editing this catalogue changes what the picker offers
 * next time and nothing that already happened — and `resetLocations` puts the
 * built-in list back when an edit turns out to be a mistake.
 */
const KEYS = {
  pickup: 'fleetin.pickupLocations',
  dropoff: 'fleetin.dropoffLocations',
} as const;

/* The append-only keys this replaces. Read once, on the first load of each
   side, so a location added before this existed is not silently dropped. */
const LEGACY_KEYS = {
  pickup: 'fleetin.customPickupLocations',
  dropoff: 'fleetin.customDropoffLocations',
} as const;

export type LocationSide = keyof typeof KEYS;

function readList(key: string): string[] | null {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return null;
  }
}

/** The list as it stands, seeding and migrating on first read. */
export function loadLocations(side: LocationSide, builtIns: string[]): string[] {
  const stored = readList(KEYS[side]);
  if (stored) return stored;
  const legacy = readList(LEGACY_KEYS[side]) ?? [];
  const seeded = [...builtIns];
  for (const name of legacy) {
    if (!seeded.some((existing) => existing.toLowerCase() === name.toLowerCase())) seeded.push(name);
  }
  return seeded;
}

export function saveLocations(side: LocationSide, locations: string[]): void {
  try {
    globalThis.localStorage.setItem(KEYS[side], JSON.stringify(locations));
  } catch {
    /* Storage unavailable (private browsing, quota) — this session still
       works, the edit just does not outlive it. */
  }
}

/** Forget every edit and go back to the built-in corridor list. */
export function resetLocations(side: LocationSide, builtIns: string[]): string[] {
  saveLocations(side, builtIns);
  return [...builtIns];
}
