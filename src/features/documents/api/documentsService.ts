import { apiClient, type ApiResponse } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import { formatDate, formatFileSize } from '@/utils/format';

export type DocumentOwnerType = 'SHIPPER' | 'PARTNER' | 'VEHICLE' | 'DRIVER' | 'BOOKING';

/**
 * The one category a booking owns, and the string the backend gates on. A
 * booking's proof of delivery is what unlocks its container's empty return —
 * see `hasProofOfDelivery` on the backend.
 */
export const PROOF_OF_DELIVERY = 'Proof of Delivery';

export interface DocumentRecord {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: string;
  name: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'Verified' | 'Pending Review' | 'Rejected' | 'Expired';
  uploadedAt: string;
  uploadedById: string;
  expiryDate: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  version: number;
  downloadCount: number;
}

export interface DocumentTypeRecord {
  id: string;
  ownerType: DocumentOwnerType;
  label: string;
  required: boolean;
}

function token() {
  return useAuthStore.getState().accessToken;
}

export async function fetchDocuments(ownerType: DocumentOwnerType, ownerId: string): Promise<DocumentRecord[]> {
  const res = await apiClient.get<{ items: DocumentRecord[] }>(
    `/documents?ownerType=${ownerType}&ownerId=${ownerId}&limit=100`,
    token(),
  );
  return res.data.items;
}

export async function uploadDocument(params: {
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: string;
  file: File;
}): Promise<DocumentRecord> {
  const form = new FormData();
  form.append('ownerType', params.ownerType);
  form.append('ownerId', params.ownerId);
  form.append('category', params.category);
  form.append('file', params.file);
  const res: ApiResponse<DocumentRecord> = await apiClient.upload('/documents', form, token());
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}`, token());
}

/**
 * The stored file itself, as an object URL for previewing in place.
 *
 * Separate from `downloadDocument` because the viewer shows the document
 * rather than saving it — and because the caller has to revoke the URL when
 * the preview closes.
 */
export async function fetchDocumentObjectUrl(
  id: string,
): Promise<{ url: string; mimeType: string }> {
  const { blob } = await apiClient.downloadBlob(`/documents/${id}/download`, token());
  return { url: URL.createObjectURL(blob), mimeType: blob.type };
}

export async function downloadDocument(id: string, fallbackName: string): Promise<void> {
  const { blob, filename } = await apiClient.downloadBlob(`/documents/${id}/download`, token());
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Shared shape ShipperDocument/PartnerDocument both use: a display-ready
 * document with pre-formatted date/size strings rather than the backend's
 * raw ISO timestamp and byte count. Reused across Shippers/Partners/
 * Vehicles/Drivers instead of four near-identical mapping functions.
 */
export interface DisplayDocument {
  id: string;
  name: string;
  category: string;
  uploadDate: string;
  expiryDate?: string;
  fileSize: string;
  status: string;
  rejectionReason?: string;
  version?: number;
  downloadCount?: number;
}

export function toDisplayDocument(raw: DocumentRecord): DisplayDocument {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    uploadDate: formatDate(raw.uploadedAt),
    expiryDate: raw.expiryDate ?? undefined,
    fileSize: formatFileSize(raw.fileSizeBytes),
    status: raw.status,
    rejectionReason: raw.rejectionReason ?? undefined,
    version: raw.version,
    downloadCount: raw.downloadCount,
  };
}

export async function fetchDocumentTypes(ownerType: DocumentOwnerType): Promise<DocumentTypeRecord[]> {
  const res = await apiClient.get<DocumentTypeRecord[]>(`/document-types?ownerType=${ownerType}`, token());
  return res.data;
}

export async function createDocumentType(ownerType: DocumentOwnerType, label: string, required: boolean): Promise<DocumentTypeRecord> {
  const res = await apiClient.post<DocumentTypeRecord>('/document-types', { ownerType, label, required }, token());
  return res.data;
}

export async function deleteDocumentType(id: string): Promise<void> {
  await apiClient.delete(`/document-types/${id}`, token());
}
