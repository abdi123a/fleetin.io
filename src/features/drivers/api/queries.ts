import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDriver,
  deleteDriver,
  fetchDriver,
  fetchDrivers,
  updateDriver,
  type CreateDriverPayload,
  type DriverFilters,
} from './driversService';
import { partnerQueryKeys } from '@/features/partners/api/queries';

export const driverQueryKeys = {
  all: ['drivers'] as const,
  list: (filters: DriverFilters) => ['drivers', 'list', filters] as const,
  detail: (id: string) => ['drivers', 'detail', id] as const,
};

export function useDrivers(filters: DriverFilters = {}) {
  return useQuery({
    queryKey: driverQueryKeys.list(filters),
    queryFn: () => fetchDrivers(filters),
  });
}

export function useDriver(id: string | undefined) {
  return useQuery({
    queryKey: driverQueryKeys.detail(id ?? ''),
    queryFn: () => fetchDriver(id as string),
    enabled: Boolean(id),
  });
}

function invalidateDrivers(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: driverQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: driverQueryKeys.detail(id) });
  queryClient.invalidateQueries({ queryKey: partnerQueryKeys.all });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, payload }: { partnerId: string; payload: CreateDriverPayload }) => createDriver(partnerId, payload),
    onSuccess: () => invalidateDrivers(queryClient),
  });
}

export function useUpdateDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateDriverPayload> }) => updateDriver(id, payload),
    onSuccess: (_data, variables) => invalidateDrivers(queryClient, variables.id),
  });
}

export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDriver(id),
    onSuccess: () => invalidateDrivers(queryClient),
  });
}
