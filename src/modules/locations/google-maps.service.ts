import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The only place in this codebase that talks to Google.
 *
 * Two APIs, both of the "New" generation:
 *
 *   Places API (New) — `places:searchText`. Given "doraleh", returns the real
 *   terminals with their real addresses and coordinates. This is what replaces
 *   typing a place name into a text box and hoping.
 *
 *   Routes API — `computeRouteMatrix`. Given two coordinates, returns the
 *   distance a truck actually drives and how long it takes. This is what
 *   replaces `distanceForDropoff()`, a function that returned 10, 15, 20 or 25
 *   based on a substring match of the drop-off's name.
 *
 * ## The key
 *
 * Server-side only, read once at construction. It is never returned to a
 * caller and never reaches the browser — the frontend asks this backend, and
 * this backend asks Google. That means the key can be locked to the server's
 * IP rather than to an HTTP referrer, which is the stronger of the two
 * restrictions Google offers.
 *
 * ## Absent key
 *
 * `configured` is false and every method says so rather than throwing a 500 or,
 * worse, inventing an answer. Place search reports itself unavailable, which
 * the form handles by letting the operator enter the place by hand. Distance
 * falls back to `haversine` — the straight line — and labels it as such, so
 * nothing downstream can mistake a crow-flight number for a road.
 *
 * ## Field masks
 *
 * Both APIs bill by the fields you ask for, so both requests ask for exactly
 * what is stored and nothing else. Widening a mask widens the bill.
 */

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const ROUTE_MATRIX_URL =
  'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

/** How long we wait on Google before giving up. A form is being blocked on this. */
const REQUEST_TIMEOUT_MS = 8_000;

export interface PlaceCandidate {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  /** Google's own categories, e.g. `port`, `storage`. Used to guess `kind`. */
  types: string[];
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  provider: 'google' | 'haversine';
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  addressComponents?: {
    longText?: string;
    shortText?: string;
    types?: string[];
  }[];
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly apiKey: string | undefined;
  private readonly bias: { lat: number; lng: number; radius: number };

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    this.apiKey = key && key.trim().length > 0 ? key.trim() : undefined;
    this.bias = {
      lat: this.configService.get<number>('GOOGLE_MAPS_BIAS_LAT', 11.5721),
      lng: this.configService.get<number>('GOOGLE_MAPS_BIAS_LNG', 43.1456),
      radius: this.configService.get<number>('GOOGLE_MAPS_BIAS_RADIUS_M', 300_000),
    };

    if (!this.apiKey) {
      this.logger.warn(
        'GOOGLE_MAPS_API_KEY is not set — place search is unavailable and ' +
          'distances fall back to straight-line estimates. See .env.example.',
      );
    }
  }

  /** Whether Google is reachable at all. Callers branch on this, never on a throw. */
  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Search Google for a place. Nothing is saved — this returns candidates for a
   * human to choose from, which is the whole difference between this and typing
   * a name.
   *
   * Biased toward the corridor by a circle, not restricted to it: a shipment to
   * Addis or Berbera is a real shipment, and a hard restriction would hide it.
   */
  async searchPlaces(query: string, limit = 8): Promise<PlaceCandidate[]> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Place search needs a Google Maps API key. Add GOOGLE_MAPS_API_KEY to the server environment, or enter the location by hand.',
      );
    }

    const body = {
      textQuery: query,
      maxResultCount: Math.min(Math.max(limit, 1), 20),
      locationBias: {
        circle: {
          center: { latitude: this.bias.lat, longitude: this.bias.lng },
          radius: this.bias.radius,
        },
      },
    };

    const response = await this.post<{ places?: GooglePlace[] }>(
      PLACES_SEARCH_URL,
      body,
      {
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.types',
          'places.addressComponents',
        ].join(','),
      },
    );

    return (response.places ?? [])
      .map((place) => this.toCandidate(place))
      .filter((place): place is PlaceCandidate => place !== null);
  }

  /**
   * The authoritative record for one place id.
   *
   * Called when a candidate is actually saved rather than trusting the search
   * result verbatim: search is optimised for matching, details is what Google
   * stands behind, and a place saved today is read for years.
   */
  async placeDetails(placeId: string): Promise<PlaceCandidate> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Place lookup needs a Google Maps API key. Add GOOGLE_MAPS_API_KEY to the server environment, or enter the location by hand.',
      );
    }

    const url = `${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`;
    const place = await this.get<GooglePlace>(url, {
      'X-Goog-FieldMask': [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'types',
        'addressComponents',
      ].join(','),
    });

    const candidate = this.toCandidate(place);
    if (!candidate) {
      throw new ServiceUnavailableException(
        `Google returned no usable record for place ${placeId}.`,
      );
    }
    return candidate;
  }

  /**
   * The road between two points, driving.
   *
   * `ROUTE_MATRIX_URL` rather than the single-route endpoint because the same
   * call shape serves one pair and a whole grid, and the corridor's book of
   * distances is built a grid at a time.
   *
   * Falls back to the straight line, marked `haversine`, when there is no key —
   * a number that is always short (on this corridor by roughly a third) but is
   * never passed off as anything else.
   */
  async routeDistance(origin: Coordinates, destination: Coordinates): Promise<RouteLeg> {
    if (!this.apiKey) {
      return {
        distanceMeters: Math.round(haversineMeters(origin, destination)),
        durationSeconds: 0,
        provider: 'haversine',
      };
    }

    const body = {
      origins: [
        {
          waypoint: {
            location: {
              latLng: { latitude: origin.latitude, longitude: origin.longitude },
            },
          },
        },
      ],
      destinations: [
        {
          waypoint: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
        },
      ],
      travelMode: 'DRIVE',
      /* Not TRAFFIC_AWARE. This distance is cached and reused for months; a
       * number that moved with this morning's congestion would be a lie by
       * tomorrow, and it costs more per element besides. */
      routingPreference: 'TRAFFIC_UNAWARE',
    };

    const rows = await this.post<
      {
        distanceMeters?: number;
        duration?: string;
        condition?: string;
      }[]
    >(ROUTE_MATRIX_URL, body, {
      'X-Goog-FieldMask': 'distanceMeters,duration,condition',
    });

    const leg = Array.isArray(rows) ? rows[0] : undefined;
    if (!leg || leg.condition === 'ROUTE_NOT_FOUND' || leg.distanceMeters == null) {
      /* No road between them — an island, a closed border, a pin dropped in the
       * sea. The straight line is the honest answer and says so. */
      this.logger.warn(
        `Routes API found no road route; falling back to straight-line distance.`,
      );
      return {
        distanceMeters: Math.round(haversineMeters(origin, destination)),
        durationSeconds: 0,
        provider: 'haversine',
      };
    }

    return {
      distanceMeters: leg.distanceMeters,
      durationSeconds: parseDurationSeconds(leg.duration),
      provider: 'google',
    };
  }

  /* ── HTTP ────────────────────────────────────────────────────────────── */

  private async post<T>(
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  private async get<T>(url: string, headers: Record<string, string>): Promise<T> {
    return this.request<T>(url, { method: 'GET', headers });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'X-Goog-Api-Key': this.apiKey! },
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        /* The key itself is never in this message — only Google's reason. A
         * 403 here is almost always "API not enabled on the project" or "key
         * restricted to the wrong IP", and saying so saves an afternoon. */
        this.logger.error(
          `Google responded ${response.status} for ${new URL(url).pathname}: ${detail.slice(0, 500)}`,
        );
        throw new ServiceUnavailableException(
          `Google Maps rejected the request: ${googleReason(detail, response.status)}. ` +
            `Check that Places API (New) and Routes API are both enabled on the project, ` +
            `that billing is on, and that the key allows this server's IP. ` +
            `Run \`pnpm check:maps\` on the server to find out which.`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if ((error as Error)?.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `Google Maps did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`,
        );
      }
      this.logger.error(`Google Maps request failed`, error as Error);
      throw new ServiceUnavailableException('Could not reach Google Maps.');
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Mapping ─────────────────────────────────────────────────────────── */

  private toCandidate(place: GooglePlace): PlaceCandidate | null {
    const id = place.id;
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!id || typeof lat !== 'number' || typeof lng !== 'number') return null;

    const component = (type: string) =>
      place.addressComponents?.find((part) => part.types?.includes(type));

    const cityPart =
      component('locality') ??
      component('administrative_area_level_1') ??
      component('administrative_area_level_2');
    const countryPart = component('country');

    return {
      googlePlaceId: id,
      name: place.displayName?.text ?? place.formattedAddress ?? 'Unnamed place',
      formattedAddress: place.formattedAddress ?? '',
      latitude: lat,
      longitude: lng,
      types: place.types ?? [],
      city: cityPart?.longText ?? null,
      country: countryPart?.longText ?? null,
      countryCode: countryPart?.shortText ?? null,
    };
  }
}

/**
 * Google's own sentence for a failure, dug out of either envelope shape.
 *
 * Places returns `{error:{message}}`. Routes returns `[{error:{message}}]` — an
 * array, because `computeRouteMatrix` streams one element per pair and an error
 * is simply the first element. Reading only the object shape reduced every
 * Routes failure to its status code, which tells an operator nothing about
 * which of the five likely causes they have hit.
 */
function googleReason(body: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(body);
    const envelope = (Array.isArray(parsed) ? parsed[0] : parsed) as
      | { error?: { message?: string } }
      | undefined;
    return envelope?.error?.message ?? `HTTP ${status}`;
  } catch {
    return `HTTP ${status}`;
  }
}

/**
 * `"1234s"` -> `1234`. The Routes API returns durations as a protobuf Duration
 * string, which is always integer seconds with a trailing `s`.
 */
function parseDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  const seconds = Number.parseFloat(duration.replace(/s$/, ''));
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

/** Straight-line metres between two points. The fallback, never the answer. */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
