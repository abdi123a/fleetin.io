import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The location catalogue, and the road between any two entries in it.
 *
 * Every Google call goes through the backend — `/locations/search` and
 * `/locations/distance` are proxies. The Maps key lives on the server and is
 * never in this bundle, which is what lets it be restricted to the server's IP
 * rather than to a referrer anybody can spoof.
 */

function token() {
  return useAuthStore.getState().accessToken;
}

/** What a place IS, and which picker offers it. Mirrors the backend's list. */
export const LOCATION_KINDS = [
  'port',
  'free_zone',
  'depot',
  'yard',
  'customer',
  'other',
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  port: 'Port',
  free_zone: 'Free Zone',
  depot: 'Depot',
  yard: 'Yard',
  customer: 'Customer Site',
  other: 'Other',
};

export interface LocationRecord {
  id: string;
  reference: string;
  name: string;
  kind: LocationKind;
  googlePlaceId: string | null;
  formattedAddress: string | null;
  city: string;
  country: string;
  countryCode: string | null;
  /** Prisma Decimal crosses the wire as a string. Read through `coordsOf`. */
  latitude: string | number;
  longitude: string | number;
  /** `google` — verified against Places. `manual` — a pin somebody dropped. */
  source: 'google' | 'manual';
  gateOrTerminal: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A Google result, before anybody decides to save it. */
export interface PlaceCandidate {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  types: string[];
  city: string | null;
  country: string | null;
  countryCode: string | null;
  /** Our best guess at `kind`, pre-selected in the form and freely overridden. */
  kind: LocationKind;
  /** Already in the catalogue — shown as such rather than hidden. */
  alreadySaved: boolean;
}

export interface DistanceResult {
  originId: string;
  destinationId: string;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  /** `"1h 15m"`, or null when the provider gave no drive time. */
  durationLabel: string | null;
  /** `google` is a measured road. `haversine` is the straight line. */
  provider: 'google' | 'haversine' | 'manual' | string;
  computedAt: string;
  fresh: boolean;
}

export interface LocationFilters {
  search?: string;
  kind?: string;
  active?: boolean;
}

/** Decimal-as-string is the normal shape off the wire; this is the only reader. */
export function coordsOf(location: Pick<LocationRecord, 'latitude' | 'longitude'>): {
  lat: number;
  lng: number;
} {
  return { lat: Number(location.latitude), lng: Number(location.longitude) };
}

export async function fetchLocations(filters: LocationFilters = {}): Promise<LocationRecord[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.active !== undefined) params.set('active', String(filters.active));
  const query = params.toString();
  const res = await apiClient.get<LocationRecord[]>(
    `/locations${query ? `?${query}` : ''}`,
    token(),
  );
  return res.data;
}

export async function fetchLocation(id: string): Promise<LocationRecord> {
  const res = await apiClient.get<LocationRecord>(`/locations/${id}`, token());
  return res.data;
}

/** Whether the server has a Google key, so the form can say so plainly. */
export async function fetchMapsStatus(): Promise<{ googleConfigured: boolean }> {
  const res = await apiClient.get<{ googleConfigured: boolean }>('/locations/status', token());
  return res.data;
}

/** Search Google. Returns candidates to choose from; saves nothing. */
export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const res = await apiClient.get<{ configured: boolean; candidates: PlaceCandidate[] }>(
    `/locations/search?q=${encodeURIComponent(query)}`,
    token(),
  );
  return res.data.candidates;
}

export interface CreateLocationPayload {
  /** Present for a place chosen from search; the server re-fetches it. */
  googlePlaceId?: string;
  name: string;
  kind?: LocationKind;
  /** Required only when there is no `googlePlaceId`. */
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  city?: string;
  country?: string;
  gateOrTerminal?: string;
  contactPerson?: string;
  contactPhone?: string;
  notes?: string;
  active?: boolean;
}

export async function createLocation(payload: CreateLocationPayload): Promise<LocationRecord> {
  const res = await apiClient.post<LocationRecord>('/locations', payload, token());
  return res.data;
}

export async function updateLocation(
  id: string,
  payload: Partial<CreateLocationPayload>,
): Promise<LocationRecord> {
  const res = await apiClient.patch<LocationRecord>(`/locations/${id}`, payload, token());
  return res.data;
}

export async function deleteLocation(id: string): Promise<void> {
  await apiClient.delete(`/locations/${id}`, token());
}

/**
 * The road between two saved locations.
 *
 * A cache hit on the server for any lane run before, so this is normally
 * instant; the first time down a new lane it measures and stores.
 */
export async function fetchDistance(
  originId: string,
  destinationId: string,
  options: { refresh?: boolean } = {},
): Promise<DistanceResult> {
  const params = new URLSearchParams({ originId, destinationId });
  if (options.refresh) params.set('refresh', 'true');
  const res = await apiClient.get<DistanceResult>(`/locations/distance?${params}`, token());
  return res.data;
}

/** Measure every unmeasured pair, so the shipment form never waits on Google. */
export async function buildDistanceBook(refresh = false): Promise<{
  measured: number;
  skipped: number;
  failed: number;
  provider: string;
}> {
  const res = await apiClient.post<{
    measured: number;
    skipped: number;
    failed: number;
    provider: string;
  }>(`/locations/distances/build${refresh ? '?refresh=true' : ''}`, {}, token());
  return res.data;
}
