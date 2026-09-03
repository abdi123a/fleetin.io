import { apiClient, resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { ShipperDocument, ShipperRecord } from '@/types/shipper';
import { formatDate, formatFileSize, toDateOnly } from '@/utils/format';

export interface ShipperFilters {
  search?: string;
  status?: string;
  industry?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** The backend's raw, generic Document row shape (see features/documents/api/documentsService.ts). */
interface RawDocument {
  id: string;
  name: string;
  category: string;
  uploadedAt: string;
  fileSizeBytes: number;
  status: string;
}

/** What the API actually returns — same as ShipperRecord except documents arrive in the generic backend shape, not the pre-formatted display shape. */
type RawShipperResponse = Omit<ShipperRecord, 'uploadedDocuments'> & { uploadedDocuments?: RawDocument[] };

/** Backend documents are generic (uploadedAt/fileSizeBytes); ShipperDocument wants pre-formatted display fields. */
function toShipperDocument(raw: RawDocument): ShipperDocument {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category as ShipperDocument['category'],
    uploadDate: formatDate(raw.uploadedAt),
    fileSize: formatFileSize(raw.fileSizeBytes),
    status: raw.status as ShipperDocument['status'],
  };
}

function toShipperRecord(raw: RawShipperResponse): ShipperRecord {
  return {
    ...raw,
    /*
     * The API returns `/uploads/…` relative to its own host, not to the app's,
     * so an uploaded logo 404s the moment a component hands it to an `<img>`.
     * Resolved here, at the one seam every shipper read passes through, rather
     * than at each of the eight call sites that render a company mark — the
     * same fix `bankAccountsService` already makes for account logos.
     */
    logoUrl: resolveAssetUrl(raw.logoUrl) ?? raw.logoUrl,
    registrationDate: toDateOnly(raw.registrationDate) ?? raw.registrationDate,
    uploadedDocuments: (raw.uploadedDocuments ?? []).map(toShipperDocument),
  };
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: ShipperFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.industry && filters.industry !== 'all') params.set('industry', filters.industry);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

export async function fetchShippers(filters: ShipperFilters = {}): Promise<PaginatedResponse<ShipperRecord>> {
  const res = await apiClient.get<PaginatedResponse<RawShipperResponse>>(`/shippers?${toQueryString(filters)}`, token());
  return { ...res.data, items: res.data.items.map(toShipperRecord) };
}

export async function fetchShipper(id: string): Promise<ShipperRecord> {
  const res = await apiClient.get<RawShipperResponse>(`/shippers/${id}`, token());
  return toShipperRecord(res.data);
}

export interface CreateShipperPayload {
  companyLegalName: string;
  registrationNumber: string;
  industry: string;
  companySize: string;
  country: string;
  address: string;
  approvalStatus?: string;
  /* The deal. `undefined` leaves a stored one alone on a PATCH; an explicit
     `null` clears it and hands the account back to the house rate. */
  commissionMode?: 'percent' | 'fixed' | null;
  commissionPct?: number | null;
  /** Whole DJF per container. The server converts to minor units. */
  commissionFixedAmount?: number | null;
  primaryContact: { name: string; title: string; email: string; phone: string };
  operationalContacts?: { name: string; title: string; email: string; phone: string }[];
}

export async function createShipper(payload: CreateShipperPayload): Promise<ShipperRecord> {
  const res = await apiClient.post<RawShipperResponse>('/shippers', payload, token());
  return toShipperRecord(res.data);
}

export async function updateShipper(id: string, payload: Partial<CreateShipperPayload>): Promise<ShipperRecord> {
  const res = await apiClient.patch<RawShipperResponse>(`/shippers/${id}`, payload, token());
  return toShipperRecord(res.data);
}

export async function deleteShipper(id: string): Promise<void> {
  await apiClient.delete(`/shippers/${id}`, token());
}

export async function uploadShipperLogo(id: string, file: File): Promise<ShipperRecord> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.upload<RawShipperResponse>(`/shippers/${id}/logo`, form, token());
  return toShipperRecord(res.data);
}
