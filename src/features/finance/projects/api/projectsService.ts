import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';

export interface ProjectRecord {
  id: string;
  reference: string;
  name: string;
  shipperId: string;
  startedAt: string;
  contractEndAt: string | null;
  status: string;
  /**
   * What the shipper expects to run through this project in a month, in DJF.
   * A planning estimate and nothing else — never a cap. Shipments are never
   * refused, delayed or warned about for exceeding it, and the real total
   * routinely lands far above or below.
   */
  monthlyEstimateMinorUnits: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * What the project is worth, counted three ways.
 *
 * `contracted` is the sum of what its shipments are priced at — the work
 * itself. `billed` is what has been invoiced, `paid` what has come in.
 * Proformas are excluded throughout: a quote is not revenue.
 *
 * Minor-unit strings, because the server counts in BigInt and JSON has no
 * such thing.
 */
export interface ProjectTotals {
  shipmentCount: number;
  unpricedCount: number;
  contractedMinorUnits: string;
  billedMinorUnits: string;
  paidMinorUnits: string;
  outstandingMinorUnits: string;
  commissionMinorUnits: string;
}

/** `GET /projects/:id` only — includes the project's own real shipments, full flat rows. */
export interface ProjectDetailRecord extends ProjectRecord {
  shipments: ShipmentRecord[];
  totals: ProjectTotals;
}

export interface ProjectFilters {
  shipperId?: string;
  status?: string;
}

export interface CreateProjectPayload {
  name: string;
  shipperId: string;
  startedAt: string;
  contractEndAt?: string;
  /** Whole DJF. See `ProjectRecord.monthlyEstimateMinorUnits` — advisory only. */
  monthlyEstimate?: number;
}

export interface UpdateProjectPayload {
  name?: string;
  contractEndAt?: string;
  monthlyEstimate?: number;
}

function token() {
  return useAuthStore.getState().accessToken;
}

function toQueryString(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.shipperId) params.set('shipperId', filters.shipperId);
  if (filters.status) params.set('status', filters.status);
  return params.toString();
}

export async function fetchProjects(filters: ProjectFilters = {}): Promise<ProjectRecord[]> {
  const res = await apiClient.get<ProjectRecord[]>(`/projects?${toQueryString(filters)}`, token());
  return res.data;
}

export async function fetchProject(id: string): Promise<ProjectDetailRecord> {
  const res = await apiClient.get<ProjectDetailRecord>(`/projects/${id}`, token());
  return res.data;
}

export async function createProject(payload: CreateProjectPayload): Promise<ProjectRecord> {
  const res = await apiClient.post<ProjectRecord>('/projects', payload, token());
  return res.data;
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<ProjectRecord> {
  const res = await apiClient.patch<ProjectRecord>(`/projects/${id}`, payload, token());
  return res.data;
}

/**
 * Marks the project completed, billing every priced shipment that has no
 * invoice yet on the way out. Unpriced shipments are skipped, never billed at
 * zero — `skippedUnpriced` is how many, so the screen can say so rather than
 * report a silent no-op.
 */
export interface CloseProjectResult extends ProjectRecord {
  issued: number;
  skippedUnpriced: number;
}

export async function closeProject(id: string): Promise<CloseProjectResult> {
  const res = await apiClient.patch<CloseProjectResult>(`/projects/${id}/close`, {}, token());
  return res.data;
}
