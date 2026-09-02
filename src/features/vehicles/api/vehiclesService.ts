import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { EnrichedVehicle } from '@/data/partnerData';
import { toDateOnly } from '@/utils/format';

export interface VehicleFilters {
  search?: string;
  status?: string;
  truckType?: string;
  partnerId?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: VehicleFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.truckType && filters.truckType !== 'all') params.set('truckType', filters.truckType);
  if (filters.partnerId) params.set('partnerId', filters.partnerId);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 200));
  return params.toString();
}

/** Backend expiry/date fields arrive as full ISO datetimes; the frontend displays and diffs them as bare dates. */
function normaliseDates(vehicle: EnrichedVehicle): EnrichedVehicle {
  return {
    ...vehicle,
    insuranceStartDate: toDateOnly(vehicle.insuranceStartDate) ?? vehicle.insuranceStartDate,
    insuranceExpiry: toDateOnly(vehicle.insuranceExpiry) ?? vehicle.insuranceExpiry,
    registrationExpiry: toDateOnly(vehicle.registrationExpiry) ?? vehicle.registrationExpiry,
  };
}

export async function fetchVehicles(filters: VehicleFilters = {}): Promise<PaginatedResponse<EnrichedVehicle>> {
  const res = await apiClient.get<PaginatedResponse<EnrichedVehicle>>(`/vehicles?${toQueryString(filters)}`, token());
  return { ...res.data, items: res.data.items.map(normaliseDates) };
}

export async function fetchVehicle(id: string): Promise<EnrichedVehicle> {
  const res = await apiClient.get<EnrichedVehicle>(`/vehicles/${id}`, token());
  return normaliseDates(res.data);
}

export interface CreateVehiclePayload {
  plateNumber: string;
  truckType: string;
  containerCapacity?: string;
  trailerInfo?: string;
  ownershipType: string;
  /** The insurer, taken from the truck's Insurance certificate. */
  insuranceProvider?: string;
  insuranceStartDate?: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  hasGPS?: boolean;
  gpsDeviceId?: string;
  operationalStatus?: string;
  year?: number;
  make?: string;
  model?: string;
}

/** The only creation route — DD-02: a vehicle always belongs to a partner. */
export async function createVehicle(partnerId: string, payload: CreateVehiclePayload): Promise<EnrichedVehicle> {
  const res = await apiClient.post<EnrichedVehicle>(`/partners/${partnerId}/vehicles`, payload, token());
  return normaliseDates(res.data);
}

export async function updateVehicle(id: string, payload: Partial<CreateVehiclePayload>): Promise<EnrichedVehicle> {
  const res = await apiClient.patch<EnrichedVehicle>(`/vehicles/${id}`, payload, token());
  return normaliseDates(res.data);
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}`, token());
}
