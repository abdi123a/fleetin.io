import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Platform-wide settings — one row, one endpoint.
 *
 * `fleetinCommissionPct` is the only figure here today and it is load-bearing:
 * a transporter's price list is what the SHIPPER pays, and the transporter is
 * paid that total minus this percentage. Every transporter is subject to the
 * same rate, which is why it lives here rather than on the partner.
 */
export interface AppSettingsRecord {
  id: string;
  /** Percent, not a fraction — 7.5 means 7.5%. */
  fleetinCommissionPct: number;
  updatedAt: string;
  updatedById: string | null;
  updatedByName: string | null;
}

export interface UpdateSettingsPayload {
  fleetinCommissionPct?: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchSettings(): Promise<AppSettingsRecord> {
  const res = await apiClient.get<AppSettingsRecord>('/settings', token());
  return res.data;
}

export async function updateSettings(payload: UpdateSettingsPayload): Promise<AppSettingsRecord> {
  const res = await apiClient.patch<AppSettingsRecord>('/settings', payload, token());
  return res.data;
}
