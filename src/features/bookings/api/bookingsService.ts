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
  /** Auto-computed from the assigned partner's pricing grid the moment `partnerId` is set — never manually entered. Nullable when that partner has no matching pricing-tier row. */
  transporterCostMinorUnits: string | null;
  transporterCostCurrency: string | null;
  transporterCostFxRate: number | null;
  transporterCostBaseAmountMinorUnits: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Only populated when the backend's `bookingDetailInclude` is joined — every endpoint here does. */
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

export async function fetchBookingsForShipment(shipmentId: string): Promise<BookingRecord[]> {
  const res = await apiClient.get<BookingRecord[]>(`/shipments/${shipmentId}/bookings`, token());
  return res.data;
}

/** One booking by id/reference — also includes `timeline`, unlike the per-shipment list. */
export async function fetchBooking(id: string): Promise<BookingRecord> {
  const res = await apiClient.get<BookingRecord>(`/bookings/${id}`, token());
  return res.data;
}

/** Same ladder as a shipment's — see `shipment-status.util.ts` on the backend. */
export async function updateBookingStatus(id: string, status: string): Promise<BookingRecord> {
  const res = await apiClient.patch<BookingRecord>(`/bookings/${id}/status`, { status }, token());
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
 * One step forward on the real ladder — the same map `MissionRowCard.tsx`
 * uses for a shipment's own status, since a booking's status is the
 * identical vocabulary (`shipment-status.util.ts` on the backend, reused
 * as-is). Terminal/cancelled states advance nowhere.
 */
export const NEXT_BOOKING_STATUS: Partial<Record<string, string>> = {
  Pending: 'Assigned',
  Assigned: 'Driver Assigned',
  'Driver Assigned': 'En Route',
  'En Route': 'Arrived',
  Arrived: 'Unloading',
  Unloading: 'POD Submitted',
  'POD Submitted': 'Completed',
};

/** A display-only colour intent for a real status — used wherever a status renders as a badge, never a fake vocabulary of its own. */
export function statusIntentOf(status: string): 'green' | 'orange' | 'blue' | 'slate' {
  if (status === 'Completed' || status === 'POD Submitted') return 'green';
  if (status === 'En Route' || status === 'Arrived' || status === 'Unloading') return 'blue';
  if (status === 'Pending' || status === 'Assigned' || status === 'Driver Assigned' || status === 'Payment Pending') {
    return 'orange';
  }
  return 'slate';
}

/**
 * Plain-language grouping for whatever renders as "the status" to a
 * dispatcher — the granular ladder above still drives every real
 * transition, guard (driver/vehicle required), and Empty Return/invoicing
 * rule untouched; this only changes what the word on the badge says, since
 * eight near-identical status names made "what stage is this at" harder to
 * read at a glance than it needs to be. `POD Submitted` and `Completed`
 * are left as-is — they're already one plain idea each.
 */
const DISPLAY_STATUS_GROUP: Record<string, string> = {
  Pending: 'Booked',
  Assigned: 'Booked',
  'Driver Assigned': 'Out for Delivery',
  'En Route': 'Out for Delivery',
  Arrived: 'Out for Delivery',
  Unloading: 'Out for Delivery',
};

export function displayBookingStatus(status: string): string {
  return DISPLAY_STATUS_GROUP[status] ?? status;
}
