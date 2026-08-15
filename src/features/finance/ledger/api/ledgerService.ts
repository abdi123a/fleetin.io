import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface LedgerEntryRecord {
  id: string;
  entryDate: string;
  postedAt: string;
  type: string;
  direction: 'IN' | 'OUT';
  amountMinorUnits: string;
  scale: number;
  currency: string;
  fxRate: number;
  baseAmountMinorUnits: string;
  counterpartyType: 'SHIPPER' | 'TRANSPORTER' | 'BANK' | 'EMPLOYEE' | 'VENDOR';
  counterpartyId: string;
  counterpartyName: string;
  bankAccountId: string | null;
  sourceType: string;
  sourceId: string;
  missionId: string | null;
  description: string;
  createdById: string;
  createdByName: string;
  reversedByEntryId: string | null;
}

export interface LedgerFilters {
  counterpartyId?: string;
  sourceType?: string;
  missionId?: string;
  page?: number;
  limit?: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: LedgerFilters): string {
  const params = new URLSearchParams();
  if (filters.counterpartyId) params.set('counterpartyId', filters.counterpartyId);
  if (filters.sourceType) params.set('sourceType', filters.sourceType);
  if (filters.missionId) params.set('missionId', filters.missionId);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

export async function fetchLedgerEntries(filters: LedgerFilters = {}): Promise<PaginatedResponse<LedgerEntryRecord>> {
  const res = await apiClient.get<PaginatedResponse<LedgerEntryRecord>>(`/ledger-entries?${toQueryString(filters)}`, token());
  return res.data;
}
