import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

export interface DrawdownRecord {
  id: string;
  number: string;
  facilityId: string;
  amountMinorUnits: string;
  currency: string;
  feesMinorUnits: string;
  disbursedAt: string;
  dueAt: string;
  status: string;
  exposureStatus: string;
  exposureReason: string | null;
  repaidMinorUnits: string;
  bankAccountId: string | null;
  createdById: string;
  createdByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface DrawdownFilters {
  facilityId?: string;
  status?: string;
}

export interface CreateDrawdownPayload {
  facilityId: string;
  amountMinorUnits: number;
  daysUntilDue: number;
}

export interface RepayDrawdownPayload {
  amountMinorUnits: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: DrawdownFilters): string {
  const params = new URLSearchParams();
  if (filters.facilityId) params.set('facilityId', filters.facilityId);
  if (filters.status) params.set('status', filters.status);
  return params.toString();
}

export async function fetchDrawdowns(filters: DrawdownFilters = {}): Promise<DrawdownRecord[]> {
  const res = await apiClient.get<DrawdownRecord[]>(`/drawdowns?${toQueryString(filters)}`, token());
  return res.data;
}

export async function fetchDrawdown(id: string): Promise<DrawdownRecord> {
  const res = await apiClient.get<DrawdownRecord>(`/drawdowns/${id}`, token());
  return res.data;
}

/** Disbursed atomically on creation — credits the facility's bank account immediately, nothing to confirm after. */
export async function createDrawdown(payload: CreateDrawdownPayload): Promise<DrawdownRecord> {
  const res = await apiClient.post<DrawdownRecord>('/drawdowns', payload, token());
  return res.data;
}

export async function repayDrawdown(id: string, payload: RepayDrawdownPayload): Promise<DrawdownRecord> {
  const res = await apiClient.patch<DrawdownRecord>(`/drawdowns/${id}/repay`, payload, token());
  return res.data;
}
