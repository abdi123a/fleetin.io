import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { EnrichedDriver } from '@/data/partnerData';
import { toDateOnly } from '@/utils/format';

export interface DriverFilters {
  search?: string;
  status?: string;
  partnerId?: string;
  licenseExpiringWithinDays?: number;
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

function toQueryString(filters: DriverFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.partnerId) params.set('partnerId', filters.partnerId);
  if (filters.licenseExpiringWithinDays) params.set('licenseExpiringWithinDays', String(filters.licenseExpiringWithinDays));
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 200));
  return params.toString();
}

/** Backend expiry/date fields arrive as full ISO datetimes; the frontend displays and diffs them as bare dates. */
function normaliseDates(driver: EnrichedDriver): EnrichedDriver {
  return {
    ...driver,
    licenseExpiry: toDateOnly(driver.licenseExpiry) ?? driver.licenseExpiry,
    nationalIdExpiry: toDateOnly(driver.nationalIdExpiry) ?? driver.nationalIdExpiry,
    joinDate: toDateOnly(driver.joinDate) ?? driver.joinDate,
  };
}

export async function fetchDrivers(filters: DriverFilters = {}): Promise<PaginatedResponse<EnrichedDriver>> {
  const res = await apiClient.get<PaginatedResponse<EnrichedDriver>>(`/drivers?${toQueryString(filters)}`, token());
  return { ...res.data, items: res.data.items.map(normaliseDates) };
}

export async function fetchDriver(id: string): Promise<EnrichedDriver> {
  const res = await apiClient.get<EnrichedDriver>(`/drivers/${id}`, token());
  return normaliseDates(res.data);
}

export interface CreateDriverPayload {
  fullName: string;
  phone: string;
  nationalId: string;
  drivingLicenseNumber: string;
  licenseExpiry: string;
  nationalIdExpiry?: string;
  accessCards?: string[];
  status?: string;
  joinDate?: string;
}

/** The only creation route — DD-02: a driver always belongs to a partner. */
export async function createDriver(partnerId: string, payload: CreateDriverPayload): Promise<EnrichedDriver> {
  const res = await apiClient.post<EnrichedDriver>(`/partners/${partnerId}/drivers`, payload, token());
  return normaliseDates(res.data);
}

export async function updateDriver(id: string, payload: Partial<CreateDriverPayload>): Promise<EnrichedDriver> {
  const res = await apiClient.patch<EnrichedDriver>(`/drivers/${id}`, payload, token());
  return normaliseDates(res.data);
}

export async function deleteDriver(id: string): Promise<void> {
  await apiClient.delete(`/drivers/${id}`, token());
}
