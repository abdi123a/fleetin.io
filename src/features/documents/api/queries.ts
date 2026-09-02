import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteDocument,
  fetchDocumentBook,
  fetchDocumentDownloads,
  fetchDocuments,
  uploadDocument,
  uploadDocuments,
  verifyDocument,
  type DocumentOwnerType,
  type UploadDocumentParams,
} from './documentsService';

export const documentQueryKeys = {
  list: (ownerType: DocumentOwnerType, ownerId: string) => ['documents', ownerType, ownerId] as const,
  book: ['documents', 'book'] as const,
};

/** Every compliance paper on file — the Documents register reads this. */
export function useDocumentBook() {
  return useQuery({ queryKey: documentQueryKeys.book, queryFn: fetchDocumentBook });
}

/**
 * Who has opened one document — fetched only when somebody asks.
 *
 * `enabled` is the point: this is behind a disclosure in the Activity tab, and
 * loading an access log for every document a folder happens to contain would be
 * a request per file to answer a question nobody asked.
 */
export function useDocumentDownloads(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['documents', 'downloads', id ?? ''] as const,
    queryFn: () => fetchDocumentDownloads(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useDocuments(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  return useQuery({
    queryKey: documentQueryKeys.list(ownerType, ownerId ?? ''),
    queryFn: () => fetchDocuments(ownerType, ownerId as string),
    enabled: Boolean(ownerId),
  });
}

/** One paper, with the dates and the issuer the operator read off it. */
export function useUploadDocument(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<UploadDocumentParams, 'ownerType' | 'ownerId'>) =>
      uploadDocument({ ownerType, ownerId: ownerId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.list(ownerType, ownerId ?? '') });
    },
  });
}

/**
 * Several files under one category — the shape a proof arrives in.
 *
 * A vehicle's insurance is one certificate; a proof of delivery is a signed
 * note plus whatever photographs the driver came back with. Both go through
 * here, and the caller decides how many files it will accept.
 */
export function useUploadDocuments(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<UploadDocumentParams, 'ownerType' | 'ownerId' | 'file'> & { files: File[] }) =>
      uploadDocuments({ ownerType, ownerId: ownerId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.list(ownerType, ownerId ?? '') });
    },
  });
}

/**
 * Approve or reject a filed document — the review step.
 *
 * Invalidates the book as well as the owner's list, because the register's
 * counts are drawn from it and a paper that has just been rejected is no longer
 * one that counts as held.
 */
export function useVerifyDocument(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; status: 'Verified' | 'Rejected'; rejectionReason?: string }) =>
      verifyDocument(params.id, params.status, params.rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.list(ownerType, ownerId ?? '') });
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.book });
    },
  });
}

export function useDeleteDocument(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.list(ownerType, ownerId ?? '') });
    },
  });
}
