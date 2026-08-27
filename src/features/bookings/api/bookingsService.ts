import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { ShipmentTimelineStepRecord } from '@/features/shipments/api/shipmentsService';

export interface BookingPartnerSummary {
  id: string;
  reference: string;
  companyLegalName: string;
}

export interface BookingVehicleSummary {
  id: string;
  reference: string;
  plateNumber: string;
  truckType: string;
  insuranceExpiry: string;
  registrationExpiry: string;
}

export interface BookingDriverSummary {
  id: string;
  reference: string;
  fullName: string;
  phone: string;
  licenseExpiry: string;
}

/** The parent shipment, joined onto every booking the API returns — a booking on its own can't say who the shipper is or where it runs. */
export interface BookingShipmentContext {
  id: string;
  reference: string;
  shipperId: string;
  customerName: string;
  customerCompany: string;
  partnerId: string;
  pickupLocationName: string;
  deliveryLocationName: string;
  estimatedDistanceKm: number;
  cargoType: string;
  totalWeightKg: number;
  scheduledPickupTime: string;
  paymentStatus: string;
  source: string;
  dpcsReference: string;
  payoutReleasedAt: string | null;
}

/** Raw shape returned by the backend. */
export interface BookingRecord {
  id: string;
  reference: string;
  shipmentId: string;
  status: string;
  cargoType: string;
  shipmentCategory: string | null;
  containerNumber: string | null;
  shippingLine: string | null;
  partnerId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  containerReturnDepot: string | null;
  containerReturnDeadline: string | null;
  containerReturnFreeDays: number | null;
  emptyReturnException: string | null;
  scheduledPickupTime: string | null;
  completedAt: string | null;
  /** When this booking's container was emptied — set on the "Empty Ready" rung, and what the empty return counts from. */
  emptyReadyAt?: string | null;
  /** When Operations planned this container's own return for — written beside `emptyReturnException` on the "Plan Empty Return" decision. */
  emptyReturnPlannedAt?: string | null;
  /** Auto-computed from the assigned partner's pricing grid the moment `partnerId` is set — never manually entered. Nullable when that partner has no matching pricing-tier row. */
  transporterCostMinorUnits: string | null;
  transporterCostCurrency: string | null;
  transporterCostFxRate: number | null;
  transporterCostBaseAmountMinorUnits: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Only populated when the backend's `bookingDetailInclude` is joined — every endpoint here does. */
  shipment?: BookingShipmentContext | null;
  partner?: BookingPartnerSummary | null;
  vehicle?: BookingVehicleSummary | null;
  driver?: BookingDriverSummary | null;
  /** Only populated on `POST .../bookings` and `GET /bookings/:id`. */
  timeline?: ShipmentTimelineStepRecord[];
}

function token() {
  return useAuthStore.getState().accessToken;
}

export interface CreateBookingItemPayload {
  /** DPCS already assigns its own booking id externally — pass it through instead of letting the backend mint one. Omit for Fleetin-direct. */
  reference?: string;
  cargoType: string;
  shipmentCategory?: string;
  containerNumber?: string;
  shippingLine?: string;
  partnerId?: string;
  vehicleId?: string;
  driverId?: string;
  containerReturnDepot?: string;
  containerReturnDeadline?: string;
  containerReturnFreeDays?: number;
  scheduledPickupTime?: string;
}

/** One row per container/trip — see `CreateShipmentModal`'s `buildBookingItems`. */
export async function createBookings(shipmentId: string, bookings: CreateBookingItemPayload[]): Promise<BookingRecord[]> {
  const res = await apiClient.post<BookingRecord[]>(`/shipments/${shipmentId}/bookings`, { bookings }, token());
  return res.data;
}

export interface BookingListFilters {
  partnerId?: string;
  shipmentId?: string;
  status?: string;
  containerNumber?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedBookings {
  items: BookingRecord[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * The booking book, filtered — `partnerId` is what the transporter workspace
 * reads. It used to filter *shipments* by `transporter.id` instead, which
 * showed one row per job rather than per container and reported the shipment's
 * status as the transporter's own delivery record.
 */
export async function fetchBookings(filters: BookingListFilters = {}): Promise<PaginatedBookings> {
  const params = new URLSearchParams();
  if (filters.partnerId) params.set('partnerId', filters.partnerId);
  if (filters.shipmentId) params.set('shipmentId', filters.shipmentId);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.containerNumber) params.set('containerNumber', filters.containerNumber);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 500));
  const res = await apiClient.get<PaginatedBookings>(`/bookings?${params.toString()}`, token());
  return res.data;
}

export async function fetchBookingsForShipment(shipmentId: string): Promise<BookingRecord[]> {
  const res = await apiClient.get<BookingRecord[]>(`/shipments/${shipmentId}/bookings`, token());
  return res.data;
}

/** One booking by id/reference — also includes `timeline`, unlike the per-shipment list. */
export async function fetchBooking(id: string): Promise<BookingRecord> {
  const res = await apiClient.get<BookingRecord>(`/bookings/${id}`, token());
  return res.data;
}

/**
 * Same ladder as a shipment's — see `shipment-status.util.ts` on the backend.
 *
 * `occurredAt` reports when the change actually happened. "Empty Ready" asks
 * for it outright: the box is stripped at the consignee's yard hours before
 * anyone records it, and detention is counted from that moment, not the click.
 */
export async function updateBookingStatus(
  id: string,
  status: string,
  occurredAt?: string,
): Promise<BookingRecord> {
  const res = await apiClient.patch<BookingRecord>(
    `/bookings/${id}/status`,
    occurredAt ? { status, occurredAt } : { status },
    token(),
  );
  return res.data;
}

export interface UpdateBookingPayload {
  partnerId?: string;
  /** `null` clears the assignment — the backend only skips fields that are `undefined`. */
  vehicleId?: string | null;
  driverId?: string | null;
  containerNumber?: string;
  shippingLine?: string;
  containerReturnDepot?: string;
  containerReturnFreeDays?: number;
}

/** Non-status fields — assigning the vehicle/driver that will actually run this booking. */
export async function updateBooking(id: string, payload: UpdateBookingPayload): Promise<BookingRecord> {
  const res = await apiClient.patch<BookingRecord>(`/bookings/${id}`, payload, token());
  return res.data;
}

/**
 * The happy-path ladder in order — the frontend's copy of the backend's
 * `LADDER_RANK`. Order is meaningful: it is what "one step back" means.
 */
export const BOOKING_LADDER: readonly string[] = [
  'Pending',
  'Assigned',
  'Driver Assigned',
  'Heading to Pickup',
  'At Pickup',
  'Loading',
  'Loaded',
  'En Route',
  'Arrived',
  'Unloading',
  'POD Submitted',
  /* The box is off the truck and empty. Recorded by hand with the time it
     actually happened, because this is what opens the empty return: matching
     offers the container from here, and its detention clock runs from here. */
  'Empty Ready',
  /* A truck has the empty and is running it back to the depot. Between "the
     box is free" and "the box is home" there was nothing, so a container in
     transit looked identical to one still sitting at the consignee's yard. */
  'Empty Picked Up',
  'Completed',
];

/**
 * One step forward on the real ladder — the same map `MissionRowCard.tsx`
 * uses for a shipment's own status, since a booking's status is the
 * identical vocabulary (`shipment-status.util.ts` on the backend, reused
 * as-is). Terminal/cancelled states advance nowhere.
 */
export const NEXT_BOOKING_STATUS: Partial<Record<string, string>> = {
  Pending: 'Assigned',
  Assigned: 'Driver Assigned',
  'Driver Assigned': 'Heading to Pickup',
  'Heading to Pickup': 'At Pickup',
  'At Pickup': 'Loading',
  Loading: 'Loaded',
  Loaded: 'En Route',
  'En Route': 'Arrived',
  Arrived: 'Unloading',
  Unloading: 'POD Submitted',
  'POD Submitted': 'Empty Ready',
  'Empty Ready': 'Completed',
};

// A booking speaks the same status vocabulary as its shipment; both render it
// through `@/lib/shipmentStatus`, which is where those helpers now live.
