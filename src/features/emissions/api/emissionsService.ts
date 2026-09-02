import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * The carbon read model.
 *
 * One dashboard call rather than six: every panel is a different cut of the
 * same filtered set of bookings, and six endpoints would mean six passes and
 * six chances for the KPI row to disagree with the chart beneath it.
 *
 * Nothing here computes emissions. A booking's figure was computed once,
 * server-side, from the factor its truck carried at the time; this reads it.
 */

function token() {
  return useAuthStore.getState().accessToken;
}

export interface EmissionsFilters {
  dateFrom?: string;
  dateTo?: string;
  transporterId?: string;
  vehicleId?: string;
  truckType?: string;
  shipmentId?: string;
  bookingId?: string;
}

export interface EmissionsKpis {
  totalCo2Kg: number;
  totalDistanceKm: number;
  /** The realised fleet rate — total over total, not the mean of the factors. */
  avgCo2PerKm: number;
  bookingCount: number;
  shipmentCount: number;
  /** How many of those stand on a measured route rather than a quoted hop. */
  measuredBookingCount: number;
}

export interface EmissionsPoint {
  month: string;
  co2Kg: number;
  distanceKm: number;
  bookings: number;
}

export interface EmissionsSlice {
  id: string;
  label: string;
  sublabel?: string;
  co2Kg: number;
  distanceKm: number;
  bookings: number;
}

export interface EmissionsScatterPoint {
  bookingRef: string;
  distanceKm: number;
  co2Kg: number;
  truckType: string;
}

export interface EmissionsDashboard {
  kpis: EmissionsKpis;
  series: EmissionsPoint[];
  byVehicle: EmissionsSlice[];
  byTransporter: EmissionsSlice[];
  byShipment: EmissionsSlice[];
  scatter: EmissionsScatterPoint[];
  /** True when the filtered set hit the aggregation cap — see `MAX_ROWS`. */
  truncated: boolean;
}

export interface EmissionsFilterOptions {
  transporters: { id: string; name: string }[];
  vehicles: {
    id: string;
    plateNumber: string;
    truckType: string;
    fuelType: string;
    co2PerKm: number | null;
  }[];
  truckTypes: string[];
}

function toQueryString(filters: EmissionsFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== 'all') params.set(key, value);
  }
  return params.toString();
}

export async function fetchEmissionsDashboard(
  filters: EmissionsFilters = {},
): Promise<EmissionsDashboard> {
  const query = toQueryString(filters);
  const res = await apiClient.get<EmissionsDashboard>(
    `/emissions/dashboard${query ? `?${query}` : ''}`,
    token(),
  );
  return res.data;
}

export async function fetchEmissionsFilterOptions(): Promise<EmissionsFilterOptions> {
  const res = await apiClient.get<EmissionsFilterOptions>('/emissions/filters', token());
  return res.data;
}

/* ── One booking's route ─────────────────────────────────────────────────── */

export interface RouteLeg {
  id: string;
  sequence: number;
  originName: string;
  destinationName: string;
  distanceMeters: number;
  durationSeconds: number | null;
  /** `google` is a measured road; `haversine` is the straight line, and says so. */
  provider: string;
  /** positioning | loaded | empty_return | manual */
  purpose: string;
}

export interface BookingRoute {
  bookingId: string;
  reference: string;
  legs: RouteLeg[];
  totalDistanceKm: number;
  actualDistanceKm: number | null;
  co2FactorUsed: number | null;
  co2EmissionsKg: number | null;
  co2DistanceSource: string | null;
}

export async function fetchBookingRoute(bookingId: string): Promise<BookingRoute> {
  const res = await apiClient.get<BookingRoute>(
    `/emissions/bookings/${bookingId}/route`,
    token(),
  );
  return res.data;
}

/**
 * Re-derive the booking's movement from what was recorded and re-measure it.
 *
 * Deliberately a write somebody asks for: measuring a new lane costs a Routes
 * API element, and a route that has not changed should not pay for one on
 * every page view.
 */
export async function rebuildBookingRoute(
  bookingId: string,
): Promise<{ legs: number; distanceKm: number; notes: string[] }> {
  const res = await apiClient.post<{ legs: number; distanceKm: number; notes: string[] }>(
    `/emissions/bookings/${bookingId}/route/rebuild`,
    {},
    token(),
  );
  return res.data;
}

/** The route as somebody who watched it drive says it went. */
export async function replaceBookingRoute(
  bookingId: string,
  stops: { locationId: string; purpose?: string }[],
): Promise<{ legs: number; distanceKm: number; notes: string[] }> {
  const res = await apiClient.post<{ legs: number; distanceKm: number; notes: string[] }>(
    `/emissions/bookings/${bookingId}/route`,
    { stops },
    token(),
  );
  return res.data;
}
