import { apiClient, resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { PartnerRecord, PartnerDocument, PartnerVehicle, PartnerDriver } from '@/types/partner';
import { toDisplayDocument, type DocumentRecord } from '@/features/documents/api/documentsService';
import { toDateOnly } from '@/utils/format';

export interface PartnerFilters {
  search?: string;
  status?: string;
  country?: string;
  serviceCategory?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** What the API actually returns for a partner — documents arrive in the generic backend shape. */
type RawPartnerResponse = Omit<PartnerRecord, 'uploadedDocuments' | 'vehicles' | 'drivers' | 'pricingGrid' | 'bankAccount'> & {
  uploadedDocuments?: DocumentRecord[];
  vehicles?: (PartnerVehicle & { documents?: DocumentRecord[] })[];
  drivers?: (PartnerDriver & { documents?: DocumentRecord[] })[];
  pricingGrid?: { id: string; route: string; vehicleType: string; basePriceMinorUnits: string; currency: string; pricePerKmMinorUnits: string | null }[];
  bankAccount?: { bankName: string; accountHolder: string; accountNumber: string; iban?: string; swiftCode?: string; currency: string } | null;
};

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: PartnerFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.country && filters.country !== 'all') params.set('country', filters.country);
  if (filters.serviceCategory) params.set('serviceCategory', filters.serviceCategory);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 100));
  return params.toString();
}

function toPartnerRecord(raw: RawPartnerResponse): PartnerRecord {
  return {
    ...raw,
    /* The API returns a storage-relative path (`/uploads/logos/…`). Left as-is
       it resolves against the *frontend* origin and 404s, so a transporter with
       a perfectly good logo on file rendered as initials. `shippersService`
       already made this fix for shippers; partners never got it. */
    logoUrl: resolveAssetUrl(raw.logoUrl) ?? raw.logoUrl,
    registrationDate: toDateOnly(raw.registrationDate) ?? raw.registrationDate,
    insuranceExpiry: toDateOnly(raw.insuranceExpiry) ?? raw.insuranceExpiry,
    uploadedDocuments: (raw.uploadedDocuments ?? []).map(toDisplayDocument) as PartnerDocument[],
    vehicles: (raw.vehicles ?? []).map((v) => ({ ...v, documents: (v.documents ?? []).map(toDisplayDocument) as PartnerDocument[] })),
    drivers: (raw.drivers ?? []).map((d) => ({ ...d, documents: (d.documents ?? []).map(toDisplayDocument) as PartnerDocument[] })),
    pricingGrid: (raw.pricingGrid ?? []).map((tier) => ({
      id: tier.id,
      route: tier.route,
      vehicleType: tier.vehicleType,
      basePrice: Number(tier.basePriceMinorUnits) / 100,
      currency: tier.currency,
      pricePerKm: tier.pricePerKmMinorUnits ? Number(tier.pricePerKmMinorUnits) / 100 : undefined,
    })),
    bankAccount: raw.bankAccount ?? undefined,
  };
}

export async function fetchPartners(filters: PartnerFilters = {}): Promise<PaginatedResponse<PartnerRecord>> {
  const res = await apiClient.get<PaginatedResponse<RawPartnerResponse>>(`/partners?${toQueryString(filters)}`, token());
  return { ...res.data, items: res.data.items.map(toPartnerRecord) };
}

export async function fetchPartner(id: string): Promise<PartnerRecord> {
  const res = await apiClient.get<RawPartnerResponse>(`/partners/${id}`, token());
  return toPartnerRecord(res.data);
}

export interface CreatePartnerPayload {
  companyLegalName: string;
  registrationNumber?: string;
  businessLicenseNumber?: string;
  operatingRegions?: string[];
  serviceCategories?: string[];
  fleetSize?: number;
  vehicleTypes?: string[];
  country: string;
  address: string;
  /** A catalogue location id; null clears it. See `PartnerRecord.garageLocationId`. */
  garageLocationId?: string | null;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  partnerStatus?: string;
  /* The deal. `undefined` leaves a stored one alone on a PATCH; an explicit
     `null` clears it and hands the account back to the house rate. */
  commissionMode?: 'percent' | 'fixed' | null;
  commissionPct?: number | null;
  /** Whole DJF per container. The server converts to minor units. */
  commissionFixedAmount?: number | null;
  primaryDispatcher: { name: string; title: string; email: string; phone: string };
  additionalDispatchers?: { name: string; title: string; email: string; phone: string }[];
}

export async function createPartner(payload: CreatePartnerPayload): Promise<PartnerRecord> {
  const res = await apiClient.post<RawPartnerResponse>('/partners', payload, token());
  return toPartnerRecord(res.data);
}

export async function updatePartner(id: string, payload: Partial<CreatePartnerPayload>): Promise<PartnerRecord> {
  const res = await apiClient.patch<RawPartnerResponse>(`/partners/${id}`, payload, token());
  return toPartnerRecord(res.data);
}

export async function deletePartner(id: string): Promise<void> {
  await apiClient.delete(`/partners/${id}`, token());
}

export async function uploadPartnerLogo(id: string, file: File): Promise<PartnerRecord> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.upload<RawPartnerResponse>(`/partners/${id}/logo`, form, token());
  return toPartnerRecord(res.data);
}

export interface DispatcherPayload {
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary?: boolean;
}

export async function addDispatcher(partnerId: string, payload: DispatcherPayload) {
  const res = await apiClient.post(`/partners/${partnerId}/dispatchers`, payload, token());
  return res.data;
}

export async function updateDispatcher(partnerId: string, contactId: string, payload: Partial<DispatcherPayload>) {
  const res = await apiClient.patch(`/partners/${partnerId}/dispatchers/${contactId}`, payload, token());
  return res.data;
}

export async function removeDispatcher(partnerId: string, contactId: string): Promise<void> {
  await apiClient.delete(`/partners/${partnerId}/dispatchers/${contactId}`, token());
}

export interface PricingTierPayload {
  route: string;
  vehicleType: string;
  basePrice: number;
  currency: string;
  pricePerKm?: number;
}

export async function addPricingTier(partnerId: string, payload: PricingTierPayload) {
  const res = await apiClient.post(`/partners/${partnerId}/pricing`, payload, token());
  return res.data;
}

export async function removePricingTier(partnerId: string, tierId: string): Promise<void> {
  await apiClient.delete(`/partners/${partnerId}/pricing/${tierId}`, token());
}

export interface BankAccountPayload {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  currency: string;
}

export async function upsertBankAccount(partnerId: string, payload: BankAccountPayload) {
  const res = await apiClient.put(`/partners/${partnerId}/bank-account`, payload, token());
  return res.data;
}
