/**
 * Does the Google Maps key actually work? And if not, which part?
 *
 * "It doesn't work" has five common causes here and they look identical from
 * the app: no key, key typo'd, Places API (New) not enabled, Routes API not
 * enabled, or the key restricted to the wrong IP. Each needs a different fix
 * in a different corner of the Cloud console, so this calls both APIs
 * separately and names the one that failed.
 *
 * Reads the same `GOOGLE_MAPS_API_KEY` the server reads. The key is never
 * printed — only whether it is present, and what Google said about it.
 *
 *   pnpm check:maps
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read the key straight out of `.env`.
 *
 * `dotenv` is not a direct dependency here — Nest reaches it through
 * `@nestjs/config`, and Prisma loads `.env` on its own — so rather than add a
 * package for a preflight, this parses the one line it needs. Falls back to the
 * real environment, so `GOOGLE_MAPS_API_KEY=… pnpm check:maps` works too.
 */
function readKey(): string | undefined {
  const fromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const file = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of file.split(/\r?\n/)) {
      const match = /^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      /* Strip surrounding quotes and any trailing comment — both are easy to
         paste in by accident, and both produce a "key not valid" from Google
         that reads as if the key itself were wrong. */
      const value = match[1].trim().replace(/^["']|["']$/g, '').split(/\s+#/)[0].trim();
      if (value) return value;
    }
  } catch {
    /* No .env — the environment fallback above already covers that case. */
  }
  return undefined;
}

const KEY = readKey();

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const ok = (msg: string) => console.log(`${GREEN}  ✓${OFF} ${msg}`);
const bad = (msg: string) => console.log(`${RED}  ✖${OFF} ${msg}`);
const hint = (msg: string) => console.log(`${DIM}    ${msg}${OFF}`);

/**
 * Google's error payloads carry the actionable sentence; surface it verbatim.
 *
 * The two APIs do not agree on the envelope. Places returns `{error:{...}}`;
 * Routes returns `[{error:{...}}]` — an ARRAY, because computeRouteMatrix
 * streams one element per origin/destination pair and an error is just the
 * first element. Reading only the object shape turned every Routes failure
 * into a bare "HTTP 400", which is the one thing this script exists not to say.
 */
async function reason(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const envelope = (Array.isArray(body) ? body[0] : body) as
      | { error?: { message?: string } }
      | undefined;
    return envelope?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Maps Google's failure onto the one thing to go and change. */
function diagnose(status: number, message: string, api: string): void {
  const text = message.toLowerCase();

  if (text.includes('has not been used') || text.includes('is disabled')) {
    hint(`${api} is not enabled on this Cloud project.`);
    hint('Enable it: console.cloud.google.com → APIs & Services → Library → search it → Enable.');
    return;
  }
  if (text.includes('api key not valid') || text.includes('invalid api key')) {
    hint('The key itself is wrong — a typo, or a key from a different project.');
    hint('Check for a trailing space or a line break in .env.');
    return;
  }
  if (text.includes('referer') || text.includes('referrer') || text.includes('ip address')) {
    hint("The key's restrictions reject this machine.");
    hint('This key is used SERVER-side, so restrict by IP address — not by HTTP referrer.');
    hint('While developing from your laptop, add your own public IP, or set restriction to None.');
    return;
  }
  if (text.includes('billing')) {
    hint('Billing is not enabled on the Cloud project. Both APIs require it, even inside the free tier.');
    hint('console.cloud.google.com → Billing → link a billing account.');
    return;
  }
  if (status === 403) {
    hint(`403 usually means ${api} is not enabled, or the key is restricted away from this server.`);
    return;
  }
  hint(`Unrecognised failure — the message above is Google's own.`);
}

async function checkPlaces(key: string): Promise<boolean> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: 'Doraleh Container Terminal, Djibouti', maxResultCount: 1 }),
  });

  if (!response.ok) {
    const message = await reason(response);
    bad(`Places API (New) — ${message}`);
    diagnose(response.status, message, 'Places API (New)');
    return false;
  }

  const body = (await response.json()) as {
    places?: { displayName?: { text?: string }; formattedAddress?: string }[];
  };
  const first = body.places?.[0];
  if (!first) {
    bad('Places API (New) answered, but found nothing for a place that exists.');
    return false;
  }
  ok(`Places API (New) — found "${first.displayName?.text}"`);
  hint(first.formattedAddress ?? '');
  return true;
}

async function checkRoutes(key: string): Promise<boolean> {
  const response = await fetch(
    'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'distanceMeters,duration,condition',
      },
      body: JSON.stringify({
        origins: [
          { waypoint: { location: { latLng: { latitude: 11.6094, longitude: 43.0567 } } } },
        ],
        destinations: [
          { waypoint: { location: { latLng: { latitude: 11.5364, longitude: 43.0244 } } } },
        ],
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    },
  );

  if (!response.ok) {
    const message = await reason(response);
    bad(`Routes API — ${message}`);
    diagnose(response.status, message, 'Routes API');
    return false;
  }

  const rows = (await response.json()) as { distanceMeters?: number; duration?: string }[];
  const leg = Array.isArray(rows) ? rows[0] : undefined;
  if (!leg?.distanceMeters) {
    bad('Routes API answered, but found no road between two Djibouti terminals.');
    return false;
  }

  const km = Math.round(leg.distanceMeters / 100) / 10;
  const minutes = Math.round(Number.parseFloat(leg.duration ?? '0') / 60);
  ok(`Routes API — SGTD → DIFTZ is ${km} km, about ${minutes} min by road`);
  /* The number this whole feature exists to replace. Worth printing side by
     side: it is the clearest possible proof the key is doing something. */
  hint(`the old hardcoded guess for this lane was 25 km, and the straight line is 8.8 km`);
  return true;
}

async function main() {
  console.log('\nGoogle Maps preflight\n');

  if (!KEY) {
    bad('GOOGLE_MAPS_API_KEY is not set.');
    hint('Add it to fleetin-backend/.env, then run this again.');
    process.exit(1);
  }
  /**
   * Does this even look like a key, before spending a call to find out?
   *
   * Google keys are `AIza` followed by 35 more characters. Two things land
   * here that are not keys and both fail confusingly: an unsubstituted
   * placeholder from a copy-pasted command, and a key that arrived wrapped in
   * quotes or with a trailing comment. Google answers both with "API key not
   * valid", which sends people to check the Cloud console when the problem is
   * three inches away in a text file.
   */
  const PLACEHOLDERS = [
    'paste_key_here',
    'paste_your_key_here',
    'your_key_here',
    'your-api-key',
    'changeme',
    '<-- paste here',
  ];
  if (PLACEHOLDERS.includes(KEY.toLowerCase())) {
    bad(`GOOGLE_MAPS_API_KEY is still the placeholder "${KEY}".`);
    hint('The line got written literally. Open fleetin-backend/.env and replace it');
    hint('with the key itself — everything after the "=" on that line.');
    process.exit(1);
  }
  if (!/^AIza[\w-]{35}$/.test(KEY)) {
    bad(`That does not look like a Google Maps key (${KEY.length} characters).`);
    hint('A Google API key is "AIza" followed by 35 more characters — 39 in total.');
    hint('Check for quotes, a trailing comment, or a line break in .env.');
    process.exit(1);
  }
  ok(`Key found (${KEY.length} characters, correct shape)`);
  console.log('');

  const places = await checkPlaces(KEY);
  console.log('');
  const routes = await checkRoutes(KEY);
  console.log('');

  if (places && routes) {
    console.log(`${GREEN}Both APIs work.${OFF} Next:`);
    console.log('  1. Restart the API so the server picks the key up.');
    console.log('  2. pnpm prisma:seed:locations      # verify the 16 places against Google');
    console.log('  3. Press "Measure Distances" on the Locations page');
    console.log('  4. pnpm backfill:distances --write # replace the guesses on 57 shipments');
    process.exit(0);
  }

  console.log(`${YELLOW}Fix the failure above, then run this again.${OFF}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
