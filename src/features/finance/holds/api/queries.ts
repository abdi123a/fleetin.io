import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearHold, fetchAllHolds, fetchHoldsForShipment, raiseHold, type RaiseHoldPayload } from './holdsService';

export const holdQueryKeys = {
  all: ['holds'] as const,
  allFiltered: (status?: string) => ['holds', 'all', status ?? 'any'] as const,
  forShipment: (shipmentId: string) => ['holds', 'shipment', shipmentId] as const,
};

export function useHoldsForShipment(shipmentId: string | undefined) {
  return useQuery({
    queryKey: holdQueryKeys.forShipment(shipmentId ?? ''),
    queryFn: () => fetchHoldsForShipment(shipmentId as string),
    enabled: Boolean(shipmentId),
  });
}

export function useOpenHolds() {
  return useQuery({
    queryKey: holdQueryKeys.allFiltered('open'),
    queryFn: () => fetchAllHolds('open'),
  });
}

function invalidateHolds(queryClient: ReturnType<typeof useQueryClient>, shipmentId?: string) {
  queryClient.invalidateQueries({ queryKey: holdQueryKeys.all });
  if (shipmentId) queryClient.invalidateQueries({ queryKey: holdQueryKeys.forShipment(shipmentId) });
}

export function useRaiseHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, payload }: { shipmentId: string; payload: RaiseHoldPayload }) => raiseHold(shipmentId, payload),
    onSuccess: (_data, variables) => invalidateHolds(queryClient, variables.shipmentId),
  });
}

export function useClearHold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; shipmentId?: string }) => clearHold(id),
    onSuccess: (_data, variables) => invalidateHolds(queryClient, variables.shipmentId),
  });
}
