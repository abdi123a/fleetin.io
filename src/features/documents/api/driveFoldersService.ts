import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * A folder somebody made in the Files section of Fleetin Drive.
 *
 * A name and a parent, and nothing else: what it holds are ordinary documents
 * with `ownerType: 'FOLDER'` and `ownerId` pointing at it, read through the
 * same calls as every other paper — see `fetchFileBook`.
 */
export interface DriveFolderRecord {
  id: string;
  name: string;
  /** Null at the root of the Files section. */
  parentId: string | null;
  createdById: string;
  /** Resolved server-side; null when the account is gone. */
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

function token() {
  return useAuthStore.getState().accessToken;
}

/** Every folder, flat. The tree is built by `listFiles`. */
export async function fetchDriveFolders(): Promise<DriveFolderRecord[]> {
  const res = await apiClient.get<{ items: DriveFolderRecord[] }>('/drive/folders', token());
  return res.data.items;
}

export async function createDriveFolder(params: {
  name: string;
  parentId?: string | null;
}): Promise<DriveFolderRecord> {
  const res = await apiClient.post<DriveFolderRecord>(
    '/drive/folders',
    params.parentId ? { name: params.name, parentId: params.parentId } : { name: params.name },
    token(),
  );
  return res.data;
}

export async function renameDriveFolder(id: string, name: string): Promise<DriveFolderRecord> {
  const res = await apiClient.patch<DriveFolderRecord>(`/drive/folders/${id}`, { name }, token());
  return res.data;
}

/** Takes the sub-folders and every file in any of them with it. */
export async function deleteDriveFolder(
  id: string,
): Promise<{ deleted: { folders: number; files: number } }> {
  const res = await apiClient.delete<{ deleted: { folders: number; files: number } }>(
    `/drive/folders/${id}`,
    token(),
  );
  return res.data;
}
