import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createShipper,
  deleteShipper,
  fetchShipper,
  fetchShippers,
  updateShipper,
  uploadShipperLogo,
  type CreateShipperPayload,
  type ShipperFilters,
} from './shippersService';

export const shipperQueryKeys = {
  all: ['shippers'] as const,
  list: (filters: ShipperFilters) => ['shippers', 'list', filters] as const,
  detail: (id: string) => ['shippers', 'detail', id] as const,
};

export function useShippers(filters: ShipperFilters = {}) {
  return useQuery({
    queryKey: shipperQueryKeys.list(filters),
    queryFn: () => fetchShippers(filters),
  });
}

export function useShipper(id: string | undefined) {
  return useQuery({
    queryKey: shipperQueryKeys.detail(id ?? ''),
    queryFn: () => fetchShipper(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateShipper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateShipperPayload) => createShipper(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipperQueryKeys.all });
    },
  });
}

export function useUpdateShipper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateShipperPayload> }) => updateShipper(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: shipperQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: shipperQueryKeys.detail(variables.id) });
    },
  });
}

export function useDeleteShipper() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShipper(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipperQueryKeys.all });
    },
  });
}

export function useUploadShipperLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadShipperLogo(id, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: shipperQueryKeys.detail(variables.id) });
    },
  });
}
