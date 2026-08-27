import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Users, roles and the permission vocabulary — the three calls the
 * Administration console runs on.
 *
 * Access in this system hangs off the *role*, never off the user row: a user
 * has one `roleId`, and the role carries the grants. "Give this person custom
 * access" therefore means creating an access profile and assigning it, which
 * is why role creation lives in the same service as user creation rather than
 * in a settings corner.
 */

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

/** One resource and every action defined on it, as the backend declares them. */
export interface PermissionCatalogEntry {
  resource: string;
  actions: string[];
  permissions: string[];
  /** `resource.*` — grants every action above. */
  wildcard: string;
}

export interface PermissionCatalog {
  resources: PermissionCatalogEntry[];
  /** How many concrete permissions exist in total. The denominator on screen. */
  total: number;
  /** The superuser grant, `*`. Reserved for ADMIN. */
  wildcardAll: string;
}

export interface AccessProfile {
  id: string;
  name: string;
  description: string | null;
  /** As stored — may contain `resource.*` or `*`. */
  permissions: string[];
  /** What those grants actually confer, wildcards expanded. */
  effectivePermissions: string[];
  /** `effectivePermissions.length`; the honest answer to "how many?". */
  grantCount: number;
  isSuperuser: boolean;
  /** Built-in and depended on by name: assignable, not editable. */
  isSystem: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessProfileDetail extends AccessProfile {
  users: { id: string; firstName: string; lastName: string; email: string; status: UserStatus }[];
}

export interface DirectoryUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: string;
  role: { id: string; name: string; description: string | null; permissions: string[] };
}

export interface UsersPage {
  items: DirectoryUser[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  /** Role id or role name. */
  roleId: string;
  status?: UserStatus;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roleId?: string;
  status?: UserStatus;
}

export interface CreateProfilePayload {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateProfilePayload {
  description?: string;
  permissions?: string[];
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalog> {
  const res = await apiClient.get<PermissionCatalog>('/roles/catalog', token());
  return res.data;
}

export async function fetchAccessProfiles(): Promise<AccessProfile[]> {
  const res = await apiClient.get<AccessProfile[]>('/roles', token());
  return res.data;
}

export async function fetchAccessProfile(id: string): Promise<AccessProfileDetail> {
  const res = await apiClient.get<AccessProfileDetail>(`/roles/${id}`, token());
  return res.data;
}

export async function createAccessProfile(payload: CreateProfilePayload): Promise<AccessProfile> {
  const res = await apiClient.post<AccessProfile>('/roles', payload, token());
  return res.data;
}

export async function updateAccessProfile(
  id: string,
  payload: UpdateProfilePayload,
): Promise<AccessProfile> {
  const res = await apiClient.patch<AccessProfile>(`/roles/${id}`, payload, token());
  return res.data;
}

export async function deleteAccessProfile(id: string): Promise<void> {
  await apiClient.delete(`/roles/${id}`, token());
}

export async function fetchUsers(params: { page?: number; limit?: number; roleId?: string } = {}): Promise<UsersPage> {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 100));
  if (params.roleId) query.set('roleId', params.roleId);

  const res = await apiClient.get<UsersPage>(`/users?${query.toString()}`, token());
  return res.data;
}

export async function createUser(payload: CreateUserPayload): Promise<DirectoryUser> {
  const res = await apiClient.post<DirectoryUser>('/users', payload, token());
  return res.data;
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<DirectoryUser> {
  const res = await apiClient.patch<DirectoryUser>(`/users/${id}`, payload, token());
  return res.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`, token());
}
