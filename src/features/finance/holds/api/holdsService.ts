import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

export interface PayoutHoldRecord {
  id: string;
  shipmentId: string;
  bookingId: string | null;
  category: string;
  reason: string;
  raisedById: string;
  raisedByName: string;
  raisedAt: string;
  clearedAt: string | null;
  clearedById: string | null;
  clearedByName: string | null;
  note: string | null;
}

export interface RaiseHoldPayload {
  category: string;
  reason: string;
  bookingId?: string;
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchHoldsForShipment(shipmentId: string): Promise<PayoutHoldRecord[]> {
  const res = await apiClient.get<PayoutHoldRecord[]>(`/shipments/${shipmentId}/holds`, token());
  return res.data;
}

/** Book-wide, for the Finance overview — `status` defaults to unfiltered if omitted. */
export async function fetchAllHolds(status?: 'open' | 'cleared'): Promise<PayoutHoldRecord[]> {
  const query = status ? `?status=${status}` : '';
  const res = await apiClient.get<PayoutHoldRecord[]>(`/holds${query}`, token());
  return res.data;
}

export async function raiseHold(shipmentId: string, payload: RaiseHoldPayload): Promise<PayoutHoldRecord> {
  const res = await apiClient.post<PayoutHoldRecord>(`/shipments/${shipmentId}/holds`, payload, token());
  return res.data;
}

export async function clearHold(id: string): Promise<PayoutHoldRecord> {
  const res = await apiClient.patch<PayoutHoldRecord>(`/holds/${id}/clear`, {}, token());
  return res.data;
}
