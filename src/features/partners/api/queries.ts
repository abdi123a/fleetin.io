import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDispatcher,
  addPricingTier,
  createPartner,
  deletePartner,
  fetchPartner,
  fetchPartners,
  removeDispatcher,
  removePricingTier,
  updateDispatcher,
  updatePartner,
  upsertBankAccount,
  uploadPartnerLogo,
  type BankAccountPayload,
  type CreatePartnerPayload,
  type DispatcherPayload,
  type PartnerFilters,
  type PricingTierPayload,
} from './partnersService';

export const partnerQueryKeys = {
  all: ['partners'] as const,
  list: (filters: PartnerFilters) => ['partners', 'list', filters] as const,
  detail: (id: string) => ['partners', 'detail', id] as const,
};

export function usePartners(filters: PartnerFilters = {}) {
  return useQuery({
    queryKey: partnerQueryKeys.list(filters),
    queryFn: () => fetchPartners(filters),
  });
}

export function usePartner(id: string | undefined) {
  return useQuery({
    queryKey: partnerQueryKeys.detail(id ?? ''),
    queryFn: () => fetchPartner(id as string),
    enabled: Boolean(id),
  });
}

function invalidatePartner(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: partnerQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: partnerQueryKeys.detail(id) });
}

export function useCreatePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePartnerPayload) => createPartner(payload),
    onSuccess: () => invalidatePartner(queryClient),
  });
}

export function useUpdatePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreatePartnerPayload> }) => updatePartner(id, payload),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.id),
  });
}

export function useDeletePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePartner(id),
    onSuccess: () => invalidatePartner(queryClient),
  });
}

export function useUploadPartnerLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPartnerLogo(id, file),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.id),
  });
}

export function useAddDispatcher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, payload }: { partnerId: string; payload: DispatcherPayload }) => addDispatcher(partnerId, payload),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}

export function useUpdateDispatcher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, contactId, payload }: { partnerId: string; contactId: string; payload: Partial<DispatcherPayload> }) =>
      updateDispatcher(partnerId, contactId, payload),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}

export function useRemoveDispatcher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, contactId }: { partnerId: string; contactId: string }) => removeDispatcher(partnerId, contactId),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}

export function useAddPricingTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, payload }: { partnerId: string; payload: PricingTierPayload }) => addPricingTier(partnerId, payload),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}

export function useRemovePricingTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, tierId }: { partnerId: string; tierId: string }) => removePricingTier(partnerId, tierId),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}

export function useUpsertBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, payload }: { partnerId: string; payload: BankAccountPayload }) => upsertBankAccount(partnerId, payload),
    onSuccess: (_data, variables) => invalidatePartner(queryClient, variables.partnerId),
  });
}
