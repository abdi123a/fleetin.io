/**
 * Upgrade the location catalogue to Google-verified places.
 *
 * The rows themselves no longer come from here: `20260902190200_locations_corridor_rows`
 * carries them, because the deploy script never seeds and this file refuses any
 * non-local database — so a seed-only catalogue would be empty in production and
 * the Locations page would look broken rather than unseeded.
 *
 * What this is FOR, now, is the second half: with `GOOGLE_MAPS_API_KEY` set it
 * looks each place up on Places and saves Google's name, address and
 * coordinates, turning the migration's published-coordinate rows into verified
 * ones. On a local database with no rows yet it still creates them, which keeps
 * a fresh checkout one command from a usable catalogue.
 *
 * ## With a Google key
 *
 * Each place is searched on Google Places and saved with GOOGLE's name, address
 * and coordinates — `source: 'google'`, `googlePlaceId` set. That is the same
 * path the UI takes, so a seeded place is indistinguishable from one an
 * operator added, and its distances are measured against verified positions.
 *
 * ## Without one
 *
 * Falls back to the published coordinates that were already in `bi-geo.ts`, and
 * marks them `source: 'manual'` — honestly, so anybody can see at a glance which
 * pins have been checked against Google and which are inherited.
 *
 * Idempotent, and safe to re-run. The gate is `googlePlaceId`, not `source`:
 * a row that has never been through Google gets upgraded, and a row that has is
 * left alone forever after.
 *
 * That distinction matters because the two are not the same thing. Dragging a
 * pin in the UI sets `source` back to `manual` while KEEPING `googlePlaceId` —
 * the place is still that Google place, the position is now the operator's. A
 * gate deliberately moved off Google's front-door coordinate is the most
 * carefully-placed pin in the catalogue, and gating on `source` would have this
 * script overwrite exactly those and no others.
 *
 * The NAME is never overwritten either. This office calls SGTD "Doraleh
 * Container Terminal (SGTD)"; Google calls it something else, and a batch job
 * does not get to rename the places people navigate by.
 *
 *     pnpm prisma:seed:locations
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { assertSeedTargetIsSafe } from './seed-target-guard';

const prisma = new PrismaClient();

/**
 * The corridor, as this account keeps it.
 *
 * `query` is what gets sent to Google — deliberately more specific than `name`,
 * because "DFZ" finds nothing and "Djibouti Free Zone, Djibouti" finds the gate.
 * `lat`/`lng` are the published fallbacks, carried over from `bi-geo.ts`.
 */
const CORRIDOR: {
  name: string;
  kind: string;
  query: string;
  lat: number;
  lng: number;
}[] = [
  // Ports — where a box comes off a ship.
  { name: 'Port of Djibouti', kind: 'port', query: 'Port of Djibouti, Djibouti', lat: 11.5951, lng: 43.1437 },
  { name: 'Doraleh Container Terminal (SGTD)', kind: 'port', query: 'Doraleh Container Terminal, Djibouti', lat: 11.6094, lng: 43.0567 },
  { name: 'Doraleh Multipurpose Port (DMP)', kind: 'port', query: 'Djibouti Multipurpose Port, Doraleh, Djibouti', lat: 11.6021, lng: 43.0473 },
  { name: 'Doraleh Oil Terminal / SJTP', kind: 'port', query: 'Horizon Djibouti Terminals, Doraleh, Djibouti', lat: 11.5931, lng: 43.0722 },
  { name: 'Port of Tadjourah', kind: 'port', query: 'Port of Tadjourah, Djibouti', lat: 11.7869, lng: 42.8822 },
  { name: 'Damerjog / DDID port infrastructure', kind: 'port', query: 'Damerjog, Djibouti', lat: 11.4322, lng: 43.2408 },
  { name: 'Damerjog Liquid Bulk Port (DLBP)', kind: 'port', query: 'Damerjog Liquid Bulk Port, Djibouti', lat: 11.4322, lng: 43.2408 },
  { name: 'Port of Ghoubet', kind: 'port', query: 'Port of Ghoubet, Djibouti', lat: 11.5203, lng: 42.4494 },

  // Free zones — where it is delivered.
  { name: 'Djibouti International Free Trade Zone (DIFTZ)', kind: 'free_zone', query: 'Djibouti International Free Trade Zone', lat: 11.5364, lng: 43.0244 },
  { name: 'Djibouti Free Zone (DFZ)', kind: 'free_zone', query: 'Djibouti Free Zone, Djibouti', lat: 11.5731, lng: 43.1069 },
  { name: 'UKAB Free Zone', kind: 'free_zone', query: 'UKAB Free Zone, Djibouti', lat: 11.5563, lng: 43.0958 },
  { name: "Jaban'as Free Zone", kind: 'free_zone', query: "Jaban As, Djibouti", lat: 11.5178, lng: 42.9891 },
  { name: 'Nagad Free Zone', kind: 'free_zone', query: 'Nagad, Djibouti', lat: 11.5472, lng: 43.1225 },
  /* Eleven shipments on the live book deliver here and it was in no list the
     system had. The fallback coordinate is Damerjog's own — the park sits
     beside the port — so this is the entry most worth a Google lookup. */
  { name: 'Damerjog Industrial Park', kind: 'free_zone', query: 'Damerjog Industrial Development, Djibouti', lat: 11.4322, lng: 43.2408 },

  // Depots — where the empty goes back.
  { name: 'Doraleh Empty Depot', kind: 'depot', query: 'Doraleh, Djibouti', lat: 11.5983, lng: 43.0611 },
  { name: 'PK12 Dry Port', kind: 'depot', query: 'PK12, Djibouti', lat: 11.5364, lng: 43.0244 },
];

const GOOGLE_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

interface GoogleHit {
  id: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

/** One Google text search. Returns null on any failure — the fallback covers it. */
async function lookUp(apiKey: string, query: string): Promise<GoogleHit | null> {
  try {
    const response = await fetch(GOOGLE_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    if (!response.ok) {
      console.warn(`   Google said ${response.status} for "${query}"`);
      return null;
    }

    const body = (await response.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
      }[];
    };

    const place = body.places?.[0];
    if (!place?.id || place.location?.latitude == null || place.location?.longitude == null) {
      return null;
    }

    const part = (type: string) =>
      place.addressComponents?.find((component) => component.types?.includes(type));
    const country = part('country');

    return {
      id: place.id,
      name: place.displayName?.text ?? query,
      formattedAddress: place.formattedAddress ?? '',
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      city: part('locality')?.longText ?? null,
      country: country?.longText ?? null,
      countryCode: country?.shortText ?? null,
    };
  } catch (error) {
    console.warn(`   Could not reach Google for "${query}": ${(error as Error).message}`);
    return null;
  }
}

/** `LOC-00001`. Scans existing rows rather than counting them. */
async function nextReference(): Promise<string> {
  const rows = await prisma.location.findMany({ select: { reference: true } });
  const highest = rows.reduce((max, row) => {
    const digits = /(\d+)(?!.*\d)/.exec(row.reference)?.[1];
    const value = digits ? Number.parseInt(digits, 10) : 0;
    return value > max ? value : max;
  }, 0);
  return `LOC-${String(highest + 1).padStart(5, '0')}`;
}

async function main() {
  assertSeedTargetIsSafe('seed-locations.ts');

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  console.log(
    apiKey
      ? '→ GOOGLE_MAPS_API_KEY found — looking each place up on Google.'
      : '→ No GOOGLE_MAPS_API_KEY — seeding published coordinates, marked `manual`.\n' +
          '  Add the key and re-verify from the Locations page to upgrade them.',
  );

  let added = 0;
  let upgraded = 0;
  let skipped = 0;
  let viaGoogle = 0;

  for (const place of CORRIDOR) {
    const existing = await prisma.location.findFirst({
      where: { name: place.name, deletedAt: null },
    });

    /* Been through Google already, or nothing to look it up with: leave it
       exactly as it is. See the header for why this checks `googlePlaceId`
       rather than `source` — a dragged pin keeps the id and loses the source,
       and it is the one row that most needs protecting. */
    if (existing && (existing.googlePlaceId || !apiKey)) {
      skipped += 1;
      continue;
    }

    const hit = apiKey ? await lookUp(apiKey, place.query) : null;

    if (existing) {
      if (!hit) {
        skipped += 1;
        continue;
      }
      /* Somebody else's row already claims this Google place — two of the
         corridor's entries share a site. Leave both alone rather than break the
         unique index. */
      const claimed = await prisma.location.findFirst({
        where: { googlePlaceId: hit.id, id: { not: existing.id } },
      });
      if (claimed) {
        console.log(`   ${place.name} → same Google place as ${claimed.name}; left as-is.`);
        skipped += 1;
        continue;
      }

      await prisma.location.update({
        where: { id: existing.id },
        data: {
          googlePlaceId: hit.id,
          formattedAddress: hit.formattedAddress,
          city: hit.city ?? existing.city,
          country: hit.country ?? existing.country,
          countryCode: hit.countryCode ?? existing.countryCode,
          latitude: new Prisma.Decimal(hit.latitude),
          longitude: new Prisma.Decimal(hit.longitude),
          source: 'google',
          /* The name stays ours. See the header. */
        },
      });

      /* The pin moved, so every distance measured from the old position is
         wrong — same rule the Locations service applies on an edit. */
      await prisma.locationDistance.deleteMany({
        where: { OR: [{ originId: existing.id }, { destinationId: existing.id }] },
      });

      upgraded += 1;
      console.log(`   ↑ ${place.name} (verified on Google)`);
      continue;
    }

    /* Google's id may already belong to a place saved under a different name —
     * two of the corridor's entries share a site. Skip rather than collide on
     * the unique index. */
    if (hit) {
      const byPlaceId = await prisma.location.findFirst({
        where: { googlePlaceId: hit.id },
      });
      if (byPlaceId) {
        console.log(`   ${place.name} → same Google place as ${byPlaceId.name}; skipped.`);
        skipped += 1;
        continue;
      }
    }

    await prisma.location.create({
      data: {
        reference: await nextReference(),
        /* Our name, always. "Doraleh Container Terminal (SGTD)" is what this
         * office calls it, and Google's display name is not always that. */
        name: place.name,
        kind: place.kind,
        googlePlaceId: hit?.id ?? null,
        formattedAddress: hit?.formattedAddress ?? null,
        city: hit?.city ?? 'Djibouti',
        country: hit?.country ?? 'Djibouti',
        countryCode: hit?.countryCode ?? 'DJ',
        latitude: new Prisma.Decimal(hit?.latitude ?? place.lat),
        longitude: new Prisma.Decimal(hit?.longitude ?? place.lng),
        source: hit ? 'google' : 'manual',
        active: true,
      },
    });

    added += 1;
    if (hit) viaGoogle += 1;
    console.log(`   + ${place.name}${hit ? ' (Google)' : ''}`);
  }

  console.log(
    `\nDone. ${added} added (${viaGoogle} verified by Google), ` +
      `${upgraded} upgraded to Google-verified, ${skipped} left as they were.`,
  );
  if (added > 0 || upgraded > 0) {
    console.log(
      'Next: POST /locations/distances/build measures every pair once, so the\n' +
        'shipment form never waits on Google while somebody is filling it in.',
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
