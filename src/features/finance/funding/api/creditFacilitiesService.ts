import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { DrawdownRecord } from './drawdownsService';

export interface CreditFacilityRecord {
  id: string;
  bankName: string;
  facilityNumber: string;
  limitMinorUnits: string;
  currency: string;
  startDate: string;
  endDate: string | null;
  isRevolving: boolean;
  feeDescription: string | null;
  status: string;
  bankAccountId: string;
  createdAt: string;
}

/** `GET /credit-facilities/:id` only — the list endpoint does not include drawdowns. */
export interface CreditFacilityDetailRecord extends CreditFacilityRecord {
  drawdowns: DrawdownRecord[];
}

export interface CreateCreditFacilityPayload {
  bankName: string;
  bankAccountId: string;
  limitMinorUnits: number;
  currency: string;
  startDate: string;
  endDate?: string;
  isRevolving?: boolean;
  feeDescription?: string;
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchCreditFacilities(): Promise<CreditFacilityRecord[]> {
  const res = await apiClient.get<CreditFacilityRecord[]>('/credit-facilities', token());
  return res.data;
}

export async function fetchCreditFacility(id: string): Promise<CreditFacilityDetailRecord> {
  const res = await apiClient.get<CreditFacilityDetailRecord>(`/credit-facilities/${id}`, token());
  return res.data;
}

export async function createCreditFacility(payload: CreateCreditFacilityPayload): Promise<CreditFacilityRecord> {
  const res = await apiClient.post<CreditFacilityRecord>('/credit-facilities', payload, token());
  return res.data;
}
