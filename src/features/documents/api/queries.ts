import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDocumentType,
  deleteDocument,
  deleteDocumentType,
  fetchDocumentTypes,
  fetchDocuments,
  uploadDocument,
  type DocumentOwnerType,
} from './documentsService';

export const documentQueryKeys = {
  list: (ownerType: DocumentOwnerType, ownerId: string) => ['documents', ownerType, ownerId] as const,
  types: (ownerType: DocumentOwnerType) => ['document-types', ownerType] as const,
};

export function useDocuments(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  return useQuery({
    queryKey: documentQueryKeys.list(ownerType, ownerId ?? ''),
    queryFn: () => fetchDocuments(ownerType, ownerId as string),
    enabled: Boolean(ownerId),
  });
}

export function useUploadDocument(ownerType: DocumentOwnerType, ownerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { category: string; file: File }) =>
      uploadDocument({ ownerType, ownerId: ownerId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.list(ownerType, ownerId ?? '') });
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

export function useDocumentTypes(ownerType: DocumentOwnerType) {
  return useQuery({
    queryKey: documentQueryKeys.types(ownerType),
    queryFn: () => fetchDocumentTypes(ownerType),
  });
}

export function useCreateDocumentType(ownerType: DocumentOwnerType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { label: string; required: boolean }) =>
      createDocumentType(ownerType, params.label, params.required),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.types(ownerType) });
    },
  });
}

export function useDeleteDocumentType(ownerType: DocumentOwnerType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocumentType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.types(ownerType) });
    },
  });
}
