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

/* ── Fleetin Impact ──────────────────────────────────────────────────────
 *
 * The other question. Everything above is what the trucks put out; this is
 * what a realized match stopped them driving — the `Free Zone → Garage →
 * Port` repositioning a truck would have made between two jobs, and did not,
 * because it continued straight from the free zone to the port instead.
 *
 * Kept apart from the emissions figures on every surface. Nothing here is
 * subtracted from anything above, and nothing here is computed on the
 * client: the verdict on each pairing was reached server-side from the
 * bookings' own rungs, and this reads it.
 */

/**
 * matched — the pairing was confirmed; nothing has been saved yet.
 * realized — the truck physically continued; the saving is a fact.
 * not_realized — it went back to the garage anyway, or was never one truck's trip.
 */
export type ImpactStatus = 'matched' | 'realized' | 'not_realized';

export interface ImpactPlace {
  locationId: string;
  name: string;
}

/** One pairing's impact record — the evidence, not just the figure. */
export interface CycleImpact {
  cycleId: string;
  cycleReference: string;
  chainReference: string | null;
  /** Which end of the continuation the booking you asked about is. */
  role: 'empty' | 'next_load' | null;
  status: ImpactStatus;
  /** `automatic` — read off the rungs. `operator` — a person said so. */
  source: 'automatic' | 'operator' | null;
  decidedBy: string | null;
  note: string | null;
  evaluatedAt: string | null;
  matchedAt: string | null;
  realizedAt: string | null;
  continuationMinutes: number | null;
  /** Stamped on exactly one cycle per continuation trip. Totals sum these only. */
  countedAt: string | null;
  /** When realized but not counted: the sibling cycle that carries the count. */
  countedOn: string | null;
  /** One transporter on both bookings — the only case a continuation can be confirmed. */
  continuable: boolean;
  transporter: { id: string; name: string } | null;
  /** The truck that ran both legs — only when both legs name the same one. */
  vehicle: { id: string; plate: string } | null;
  empty: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  nextLoad: { bookingId: string; reference: string; container: string | null; shipmentReference: string | null };
  from: ImpactPlace | null;
  garage: ImpactPlace | null;
  to: ImpactPlace | null;
  /** Null until the two roads could be measured — no garage, or an end off the catalogue. */
  avoided: {
    toGarageKm: number;
    fromGarageKm: number;
    distanceKm: number;
    /** `google` is a road; `haversine` is the straight line, and says so. */
    provider: string;
    co2FactorUsed: number | null;
    /** Null when the truck could not be established — distance kept, carbon not priced. */
    co2Kg: number | null;
  } | null;
}

export interface ImpactSeriesPoint {
  month: string;
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  matches: number;
}

export interface ImpactSummary {
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  /** Continuations that physically happened and carry the count. */
  realizedMatches: number;
  /** Of those, how many carry a carbon figure — a truck was established. */
  pricedMatches: number;
  /** Counted, but with no garage or catalogue end to measure from. */
  unmeasured: number;
  /** Counted savings measured as a straight line rather than a road. */
  straightLine: number;
  matchedPending: number;
  notRealized: number;
  /** Percent, or null when there is no defensible baseline to state one against. */
  avoidanceRate: number | null;
  series: ImpactSeriesPoint[];
  continuations: CycleImpact[];
  continuationsOf: number;
  truncated: boolean;
}

export interface EmissionsDashboard {
  kpis: EmissionsKpis;
  series: EmissionsPoint[];
  byVehicle: EmissionsSlice[];
  byTransporter: EmissionsSlice[];
  byShipment: EmissionsSlice[];
  scatter: EmissionsScatterPoint[];
  /** The separate account — see `ImpactSummary`. */
  impact: ImpactSummary;
  /** How many container runs `scatter` was sampled from. */
  scatterOf: number;
  /**
   * The true size of each ranking before the server capped it. A fleet of
   * five thousand trucks sends two hundred rows and this figure, so the page
   * can say "top 200 of 5,000" instead of implying the cap is the whole book.
   */
  counts: { vehicles: number; transporters: number; shipments: number };
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
  /** Every continuation this booking is one end of. Empty for most bookings. */
  impacts: CycleImpact[];
}

/* ── A shipment's Fleetin Impact ──────────────────────────────────────── */

export interface ShipmentImpact {
  shipmentId: string;
  co2AvoidedKg: number;
  distanceAvoidedKm: number;
  realizedMatches: number;
  /** Of those, how many carry a carbon figure — the truck was established. */
  pricedMatches: number;
  unmeasured: number;
  continuations: CycleImpact[];
}

export async function fetchShipmentImpact(shipmentId: string): Promise<ShipmentImpact> {
  const res = await apiClient.get<ShipmentImpact>(`/emissions/shipments/${shipmentId}/impact`, token());
  return res.data;
}

/**
 * An operator's word on whether a pairing was physically realized.
 *
 * The rungs decide most cases; this is for the ones they cannot — the truck
 * that went home anyway, or the continuation nobody stamped. Remembered on
 * the record and never overruled by a later automatic pass.
 */
export async function decideCycleImpact(
  cycleId: string,
  decision: { realized: boolean; note?: string },
): Promise<CycleImpact | null> {
  const res = await apiClient.patch<CycleImpact | null>(
    `/empty-returns/cycles/${cycleId}/impact`,
    decision,
    token(),
  );
  return res.data;
}

/** Take the operator's verdict back off a pairing and let the rungs decide again. */
export async function clearCycleImpactDecision(cycleId: string): Promise<CycleImpact | null> {
  const res = await apiClient.delete<CycleImpact | null>(`/empty-returns/cycles/${cycleId}/impact`, token());
  return res.data;
}

/** Re-judge every pairing in the book from the bookings' own rungs. */
export async function rebuildImpact(): Promise<{
  evaluated: number;
  matched: number;
  realized: number;
  counted: number;
  notRealized: number;
  failed: number;
}> {
  const res = await apiClient.post<{
    evaluated: number;
    matched: number;
    realized: number;
    counted: number;
    notRealized: number;
    failed: number;
  }>('/emissions/impact/rebuild', {}, token());
  return res.data;
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
