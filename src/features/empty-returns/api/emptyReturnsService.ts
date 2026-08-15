import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';

export interface BookingShipmentSummary {
  id: string;
  reference: string;
  customerName: string;
  customerCompany: string;
}

/** A `BookingRecord` (already carrying `partner`/`vehicle`) plus the shipment name Empty Return needs to display — see `bookingDisplayInclude` on the backend. */
export interface EmptyReturnBookingRecord extends BookingRecord {
  shipment: BookingShipmentSummary | null;
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

/** Matching has stopped for this container — it goes back on its own. */
export async function markStandalone(bookingId: string): Promise<EmptyReturnBookingRecord> {
  const res = await apiClient.patch<EmptyReturnBookingRecord>(`/empty-returns/bookings/${bookingId}/standalone`, {}, token());
  return res.data;
}

/** Closes out a standalone container — confirms it physically made it back, with no match to have driven that automatically. */
export async function confirmStandaloneReturn(bookingId: string): Promise<EmptyReturnCycleRecord> {
  const res = await apiClient.patch<EmptyReturnCycleRecord>(`/empty-returns/bookings/${bookingId}/confirm-returned`, {}, token());
  return res.data;
}
