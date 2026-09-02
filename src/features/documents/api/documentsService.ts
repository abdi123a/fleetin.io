import { apiClient, type ApiResponse } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import { formatDate, formatFileSize, toDateOnly } from '@/utils/format';

export type DocumentOwnerType = 'SHIPPER' | 'PARTNER' | 'VEHICLE' | 'DRIVER' | 'BOOKING';

/**
 * The two categories a booking owns, and the strings the backend gates on.
 *
 * A job produces exactly two pieces of evidence, one at each end of it: the
 * signed note saying the cargo reached the consignee, and the depot receipt
 * saying the empty box got home. Nothing downstream of either is allowed to
 * happen on somebody's word — `Arrived` is refused without the first and
 * `Completed` without the second (`hasProofOfDelivery` / `hasProofOfReturn`).
 */
export const PROOF_OF_DELIVERY = 'Proof of Delivery';
export const PROOF_OF_RETURN = 'Proof of Return';

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
  /** The day it was issued — NOT the day it was uploaded. */
  issueDate: string | null;
  expiryDate: string | null;
  /** Who issued it. Carried by a vehicle's insurance: the insurer. */
  issuer: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  version: number;
  downloadCount: number;
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

/**
 * Every compliance paper on file, across all four record types.
 *
 * The whole book in one read, because the question the Documents page exists
 * to answer — what is expiring — is asked across the book and not inside any
 * one record. It is a few hundred rows on a fleet this size (one licence per
 * driver, two papers per truck, one per company), so it is paged in a single
 * request rather than crawled owner by owner.
 *
 * Bookings are excluded: a proof of delivery does not expire, belongs to a job
 * rather than to a counterparty, and would bury the four papers that do need
 * watching under one row per container moved.
 */
export async function fetchDocumentBook(): Promise<DocumentRecord[]> {
  const owners: DocumentOwnerType[] = ['SHIPPER', 'PARTNER', 'VEHICLE', 'DRIVER'];
  const pages = await Promise.all(
    owners.map((ownerType) =>
      apiClient.get<{ items: DocumentRecord[] }>(
        `/documents?ownerType=${ownerType}&limit=1000`,
        token(),
      ),
    ),
  );
  return pages.flatMap((page) => page.data.items);
}

export interface UploadDocumentParams {
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: string;
  file: File;
  /** `YYYY-MM-DD` — the registration date, as the operator reads it off the paper. */
  issueDate?: string;
  /** `YYYY-MM-DD`. */
  expiryDate?: string;
  /** The insurer, on a vehicle's insurance certificate. */
  issuer?: string;
}

export async function uploadDocument(params: UploadDocumentParams): Promise<DocumentRecord> {
  const form = new FormData();
  form.append('ownerType', params.ownerType);
  form.append('ownerId', params.ownerId);
  form.append('category', params.category);
  form.append('file', params.file);
  if (params.issueDate) form.append('issueDate', params.issueDate);
  if (params.expiryDate) form.append('expiryDate', params.expiryDate);
  if (params.issuer) form.append('issuer', params.issuer);
  const res: ApiResponse<DocumentRecord> = await apiClient.upload('/documents', form, token());
  return res.data;
}

/**
 * Several files, one document category — what a proof actually looks like.
 *
 * A proof of delivery is rarely one page: it is the signed note, the gate pass,
 * and two photographs of the seal. Each becomes its own row under the same
 * category, because they are separate files and a reader wants to open them
 * separately; the guard counts rows, so any one of them satisfies it.
 *
 * Sequential rather than parallel — the uploads are multipart and the backend
 * writes each through StorageService, and firing six at once at a local
 * dev server buys nothing but a queue.
 */
export async function uploadDocuments(
  params: Omit<UploadDocumentParams, 'file'> & { files: File[] },
): Promise<DocumentRecord[]> {
  const { files, ...rest } = params;
  const uploaded: DocumentRecord[] = [];
  for (const file of files) {
    uploaded.push(await uploadDocument({ ...rest, file }));
  }
  return uploaded;
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
  issueDate?: string;
  expiryDate?: string;
  issuer?: string;
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
    /* `YYYY-MM-DD`, not the raw instant. A licence expires on a DAY — the
       backend stores it as midnight UTC and printing that back gives
       "2026-09-14T12:35:46.691Z" in a column headed "Expires". */
    issueDate: toDateOnly(raw.issueDate) ?? undefined,
    expiryDate: toDateOnly(raw.expiryDate) ?? undefined,
    issuer: raw.issuer ?? undefined,
    fileSize: formatFileSize(raw.fileSizeBytes),
    status: raw.status,
    rejectionReason: raw.rejectionReason ?? undefined,
    version: raw.version,
    downloadCount: raw.downloadCount,
  };
}
