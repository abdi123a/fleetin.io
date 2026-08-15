import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankAccountQueryKeys } from '@/features/bank-accounts';
import {
  createCreditFacility,
  fetchCreditFacilities,
  fetchCreditFacility,
  type CreateCreditFacilityPayload,
} from './creditFacilitiesService';
import {
  createDrawdown,
  fetchDrawdown,
  fetchDrawdowns,
  repayDrawdown,
  type CreateDrawdownPayload,
  type DrawdownFilters,
  type RepayDrawdownPayload,
} from './drawdownsService';

export const fundingQueryKeys = {
  facilities: ['credit-facilities'] as const,
  facilityDetail: (id: string) => ['credit-facilities', 'detail', id] as const,
  drawdowns: (filters: DrawdownFilters) => ['drawdowns', 'list', filters] as const,
  drawdownDetail: (id: string) => ['drawdowns', 'detail', id] as const,
};

export function useCreditFacilities() {
  return useQuery({
    queryKey: fundingQueryKeys.facilities,
    queryFn: fetchCreditFacilities,
  });
}

export function useCreditFacility(id: string | undefined) {
  return useQuery({
    queryKey: fundingQueryKeys.facilityDetail(id ?? ''),
    queryFn: () => fetchCreditFacility(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateCreditFacility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCreditFacilityPayload) => createCreditFacility(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fundingQueryKeys.facilities }),
  });
}

export function useDrawdowns(filters: DrawdownFilters = {}) {
  return useQuery({
    queryKey: fundingQueryKeys.drawdowns(filters),
    queryFn: () => fetchDrawdowns(filters),
  });
}

export function useDrawdown(id: string | undefined) {
  return useQuery({
    queryKey: fundingQueryKeys.drawdownDetail(id ?? ''),
    queryFn: () => fetchDrawdown(id as string),
    enabled: Boolean(id),
  });
}

/** A drawdown/repayment moves real money in or out of a bank account — the Accounts page must refetch too, not just Funding's own queries. */
function invalidateFunding(queryClient: ReturnType<typeof useQueryClient>, facilityId?: string) {
  queryClient.invalidateQueries({ queryKey: ['drawdowns'] });
  queryClient.invalidateQueries({ queryKey: fundingQueryKeys.facilities });
  if (facilityId) queryClient.invalidateQueries({ queryKey: fundingQueryKeys.facilityDetail(facilityId) });
  queryClient.invalidateQueries({ queryKey: bankAccountQueryKeys.all });
}

export function useCreateDrawdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDrawdownPayload) => createDrawdown(payload),
    onSuccess: (_data, variables) => invalidateFunding(queryClient, variables.facilityId),
  });
}

export function useRepayDrawdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RepayDrawdownPayload; facilityId?: string }) =>
      repayDrawdown(id, payload),
    onSuccess: (_data, variables) => invalidateFunding(queryClient, variables.facilityId),
  });
}
