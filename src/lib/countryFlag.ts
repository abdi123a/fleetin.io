/**
 * A country name to its ISO 3166-1 alpha-2 code.
 *
 * Countries are stored in this app as English names (`"Djibouti"`), never as
 * codes, so anything that keys off a country — the flag artwork in
 * `CountryFlag`, above all — has to resolve the name back to a code first.
 *
 * This used to also build a flag **emoji** from that code. It no longer does:
 * emoji flags are drawn by the operating system, so they differ machine to
 * machine and are missing entirely on Windows. `CountryFlag` renders real
 * artwork instead. That map is built by walking the whole alpha-2 space through
 * `Intl.DisplayNames` — 676 candidates, cheap enough to do once — rather than
 * keeping a hand-written table of 195 rows that starts drifting the day a
 * country is renamed.
 *
 * ## Why it is not just `Intl.DisplayNames`
 *
 * `Intl` still resolves **withdrawn** codes, and it resolves them to the
 * *modern* name of whatever succeeded them. Walking the space naively means
 * `DD` (East Germany) and `DE` both answer to "Germany", `RH` (Rhodesia) and
 * `ZW` both answer to "Zimbabwe", `ZR` (Zaire) shadows `CD`, `SU` (the Soviet
 * Union) shadows `RU`. No alphabetical tie-break saves it — `DD` sorts before
 * `DE` but `FR` sorts before `FX` — so the withdrawn codes are named and
 * refused outright. Every one below was found by auditing this file against
 * `ALL_COUNTRIES`, and ISO does not reissue a retired code, so the list is
 * closed rather than merely current.
 */

/** Codes ISO has withdrawn that `Intl` still answers to a live country's name. */
const WITHDRAWN = new Set([
  'AN', // Netherlands Antilles → shadows CW Curaçao
  'BU', // Burma → shadows MM Myanmar
  'CS', // Serbia and Montenegro → shadows RS Serbia
  'DD', // East Germany → shadows DE Germany
  'DY', // Dahomey → shadows BJ Benin
  'FX', // Metropolitan France → shadows FR France
  'HV', // Upper Volta → shadows BF Burkina Faso
  'NH', // New Hebrides → shadows VU Vanuatu
  'RH', // Rhodesia → shadows ZW Zimbabwe
  'SU', // Soviet Union → shadows RU Russia
  'TP', // East Timor (old) → shadows TL Timor-Leste
  'UK', // never ISO; GB is → shadows GB United Kingdom
  'VD', // North Vietnam → shadows VN Vietnam
  'YD', // South Yemen → shadows YE Yemen
  'YU', // Yugoslavia → shadows RS Serbia
  'ZR', // Zaire → shadows CD Congo - Kinshasa
]);

/**
 * Names this app spells differently from the platform.
 *
 * `Intl` says "Czechia", "Türkiye", "Côte d'Ivoire", "Congo - Brazzaville";
 * `ALL_COUNTRIES` says "Czech Republic", "Turkey", "Ivory Coast", "Congo". The
 * app's spelling is what a shipper record holds, so the app's spelling is what
 * has to resolve.
 */
const ALIASES: Record<string, string> = {
  'antigua and barbuda': 'AG',
  'bosnia and herzegovina': 'BA',
  congo: 'CG',
  'czech republic': 'CZ',
  'ivory coast': 'CI',
  myanmar: 'MM',
  palestine: 'PS',
  'saint kitts and nevis': 'KN',
  'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC',
  'sao tome and principe': 'ST',
  'trinidad and tobago': 'TT',
  turkey: 'TR',
};

/** Lazily built on first use, then reused for the life of the tab. */
let codesByName: Map<string, string> | null = null;

function buildCodeIndex(): Map<string, string> {
  const index = new Map<string, string>(Object.entries(ALIASES));
  /* `DisplayNames` throws on an unsupported locale rather than degrading, so
     the whole build is guarded — a missing flag is not worth a blank page. */
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        if (WITHDRAWN.has(code)) continue;
        const label = names.of(code);
        /* An unassigned code echoes itself back. */
        if (!label || label === code) continue;
        const key = label.toLowerCase();
        /* Aliases are deliberate and outrank whatever the platform calls it. */
        if (!index.has(key)) index.set(key, code);
      }
    }
  } catch {
    /* Leaves only the aliases: every other lookup misses and the caller falls
       back to the country's name, which is the unsupported-platform path. */
  }
  return index;
}

/** ISO 3166-1 alpha-2 for a country name, or null if it is not a country. */
export function countryCode(name: string | null | undefined): string | null {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return null;
  codesByName ??= buildCodeIndex();
  return codesByName.get(wanted) ?? null;
}
