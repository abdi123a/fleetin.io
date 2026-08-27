import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { BookingRecord, BookingShipmentContext } from '@/features/bookings/api/bookingsService';

/**
 * A `BookingRecord` whose parent shipment is guaranteed present — every
 * empty-return endpoint joins it (`bookingDisplayInclude` on the backend).
 * The shape itself is the shared `BookingShipmentContext`: this module used
 * to declare a narrower four-field summary of its own, which stopped being
 * true once every booking endpoint started returning the whole shipment.
 */
export interface EmptyReturnBookingRecord extends BookingRecord {
  shipment: BookingShipmentContext | null;
}

export interface EmptyReturnChainSummary {
  id: string;
  reference: string;
  createdAt: string;
}

export interface EmptyReturnCycleRecord {
  id: string;
  reference: string;
  bookingId: string;
  booking: EmptyReturnBookingRecord;
  nextBookingId: string | null;
  nextBooking: EmptyReturnBookingRecord | null;
  chainId: string | null;
  /** Present on `GET/POST .../cycles`; absent when read via a chain's own `cycles` array (redundant there). */
  chain?: EmptyReturnChainSummary | null;
  seq: number | null;
  status: string;
  emptyReadyAt: string | null;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `completed`/`onTime`/`maxSequence` are resolved server-side from `cycles`, not stored. */
export interface EmptyReturnChainRecord extends EmptyReturnChainSummary {
  cycles: EmptyReturnCycleRecord[];
  completed: number;
  onTime: number;
  maxSequence: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

/** Containerized, delivered, not already claimed by a cycle, not flagged standalone — the matching pool's "empty" side. */
export async function fetchAvailableEmpties(): Promise<EmptyReturnBookingRecord[]> {
  const res = await apiClient.get<EmptyReturnBookingRecord[]>('/empty-returns/available-empties', token());
  return res.data;
}

/** Containerized, still open, not already claimed as someone's next full load — the matching pool's "full" side. */
export async function fetchOpenFullLoads(): Promise<EmptyReturnBookingRecord[]> {
  const res = await apiClient.get<EmptyReturnBookingRecord[]>('/empty-returns/open-full-loads', token());
  return res.data;
}

export interface CycleFilters {
  status?: string;
  chainId?: string;
}

function toQueryString(filters: CycleFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.chainId) params.set('chainId', filters.chainId);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export async function fetchCycles(filters: CycleFilters = {}): Promise<EmptyReturnCycleRecord[]> {
  const res = await apiClient.get<EmptyReturnCycleRecord[]>(`/empty-returns/cycles${toQueryString(filters)}`, token());
  return res.data;
}

export async function fetchCycle(id: string): Promise<EmptyReturnCycleRecord> {
  const res = await apiClient.get<EmptyReturnCycleRecord>(`/empty-returns/cycles/${id}`, token());
  return res.data;
}

export interface CreateCyclePayload {
  /** The empty going back. */
  bookingId: string;
  /** The full load this cycle picks up on the way back. */
  nextBookingId?: string;
}

/** Confirm one empty↔full match — Empty Return's one write action. */
export async function createCycle(payload: CreateCyclePayload): Promise<EmptyReturnCycleRecord> {
  const res = await apiClient.post<EmptyReturnCycleRecord>('/empty-returns/cycles', payload, token());
  return res.data;
}

export async function fetchChains(): Promise<EmptyReturnChainRecord[]> {
  const res = await apiClient.get<EmptyReturnChainRecord[]>('/empty-returns/chains', token());
  return res.data;
}

/**
 * Plan the empty return — matching stops and the container goes back on its own.
 *
 * The second half of the module's one decision. `plannedReturnAt` is optional
 * because an operator can give up on matching before the depot slot is known;
 * the deadline the return is racing lives on the booking either way.
 */
export async function planEmptyReturn(
  bookingId: string,
  plannedReturnAt?: string,
): Promise<EmptyReturnBookingRecord> {
  const res = await apiClient.patch<EmptyReturnBookingRecord>(
    `/empty-returns/bookings/${bookingId}/standalone`,
    plannedReturnAt ? { plannedReturnAt } : {},
    token(),
  );
  return res.data;
}

/** Kept as the old name for callers outside this module that only ever flagged. */
export const markStandalone = (bookingId: string) => planEmptyReturn(bookingId);

export interface CancelledCycle {
  id: string;
  reference: string;
  nextBookingId: string | null;
  shipmentId: string | null;
}

/**
 * Undo a pairing — the container returns to Empty Ready and the outbound load
 * is released back into the pool.
 *
 * Refused by the server once the cycle has actually started moving: a pairing
 * is a decision this module owns, but a truck already on the job is execution,
 * and execution is the Shipment module's to unwind.
 */
export async function cancelCycle(id: string): Promise<CancelledCycle> {
  const res = await apiClient.delete<CancelledCycle>(`/empty-returns/cycles/${id}`, token());
  return res.data;
}

/** Closes out a standalone container — confirms it physically made it back, with no match to have driven that automatically. */
export async function confirmStandaloneReturn(bookingId: string): Promise<EmptyReturnCycleRecord> {
  const res = await apiClient.patch<EmptyReturnCycleRecord>(`/empty-returns/bookings/${bookingId}/confirm-returned`, {}, token());
  return res.data;
}
