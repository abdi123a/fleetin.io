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
  /**
   * The company this folder hangs under, when it hangs under one.
   *
   * Both null is a Files-section folder — a free tree somebody made. Set, and
   * the folder lives inside that company's own folder on the compliance drive.
   */
  ownerType?: 'PARTNER' | 'SHIPPER' | null;
  ownerId?: string | null;
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
  /* Only meaningful at a root: a nested folder inherits its parent's owner
     server-side, so sending one here would be ignored. */
  ownerType?: 'PARTNER' | 'SHIPPER' | null;
  ownerId?: string | null;
}): Promise<DriveFolderRecord> {
  const res = await apiClient.post<DriveFolderRecord>(
    '/drive/folders',
    {
      name: params.name,
      ...(params.parentId ? { parentId: params.parentId } : {}),
      ...(params.ownerType && params.ownerId
        ? { ownerType: params.ownerType, ownerId: params.ownerId }
        : {}),
    },
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
