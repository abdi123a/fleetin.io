import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignDriver,
  createVehicle,
  deleteVehicle,
  fetchVehicle,
  fetchVehicles,
  updateVehicle,
  type CreateVehiclePayload,
  type VehicleFilters,
} from './vehiclesService';
import { partnerQueryKeys } from '@/features/partners/api/queries';

export const vehicleQueryKeys = {
  all: ['vehicles'] as const,
  list: (filters: VehicleFilters) => ['vehicles', 'list', filters] as const,
  detail: (id: string) => ['vehicles', 'detail', id] as const,
};

export function useVehicles(filters: VehicleFilters = {}) {
  return useQuery({
    queryKey: vehicleQueryKeys.list(filters),
    queryFn: () => fetchVehicles(filters),
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: vehicleQueryKeys.detail(id ?? ''),
    queryFn: () => fetchVehicle(id as string),
    enabled: Boolean(id),
  });
}

function invalidateVehicles(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: vehicleQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: vehicleQueryKeys.detail(id) });
  // A vehicle's fleet membership is also reflected on its owning partner's detail page.
  queryClient.invalidateQueries({ queryKey: partnerQueryKeys.all });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, payload }: { partnerId: string; payload: CreateVehiclePayload }) => createVehicle(partnerId, payload),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateVehiclePayload> }) => updateVehicle(id, payload),
    onSuccess: (_data, variables) => invalidateVehicles(queryClient, variables.id),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: string; driverId: string | null }) => assignDriver(vehicleId, driverId),
    onSuccess: (_data, variables) => {
      invalidateVehicles(queryClient, variables.vehicleId);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
  });
}
