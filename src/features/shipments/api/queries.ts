import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useShipmentStore } from '@/stores/shipment.store';
import { usePartners } from '@/features/partners/api/queries';
import {
  createShipment,
  deleteShipment,
  fetchShipment,
  fetchShipments,
  updateShipment,
  updateShipmentStatus,
  type CreateShipmentPayload,
  type ShipmentFilters,
  type UpdateShipmentPayload,
} from './shipmentsService';

export const shipmentQueryKeys = {
  all: ['shipments'] as const,
  list: (filters: ShipmentFilters) => ['shipments', 'list', filters] as const,
  detail: (id: string) => ['shipments', 'detail', id] as const,
};

export function useShipments(filters: ShipmentFilters = {}) {
  return useQuery({
    queryKey: shipmentQueryKeys.list(filters),
    queryFn: () => fetchShipments(filters),
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: shipmentQueryKeys.detail(id ?? ''),
    queryFn: () => fetchShipment(id as string),
    enabled: Boolean(id),
  });
}

function invalidateShipments(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: shipmentQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: shipmentQueryKeys.detail(id) });
}

export function useCreateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateShipmentPayload) => createShipment(payload),
    onSuccess: () => invalidateShipments(queryClient),
  });
}

export function useUpdateShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateShipmentPayload }) => updateShipment(id, payload),
    onSuccess: (_data, variables) => invalidateShipments(queryClient, variables.id),
  });
}

export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateShipmentStatus(id, status),
    onSuccess: (_data, variables) => invalidateShipments(queryClient, variables.id),
  });
}

export function useDeleteShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShipment(id),
    onSuccess: () => invalidateShipments(queryClient),
  });
}

/**
 * Keeps `useShipmentStore`'s `missions` array (still read directly by
 * `MissionsPage`, `MissionRowCard`, and the Empty Returns bridge) in sync
 * with the backend. Call once from a shared layout point — every page that
 * mounts it re-fetches on the same query key, so it's cheap to call from
 * more than one page.
 */
export function useHydrateShipments() {
  const { data } = useShipments();
  const setMissions = useShipmentStore((s) => s.setMissions);

  useEffect(() => {
    if (data) setMissions(data.items);
  }, [data, setMissions]);

  // Partners aren't a Zustand store (they're TanStack Query-backed), but
  // `shipment.store.ts`'s `assignShipmentToCycle` runs synchronously inside a
  // Zustand action and needs a live partner list to resolve a transporter's
  // real id — see the store's own comment on `partners`.
  const { data: partnersData } = usePartners();
  const setPartners = useShipmentStore((s) => s.setPartners);

  useEffect(() => {
    if (partnersData) setPartners(partnersData.items);
  }, [partnersData, setPartners]);
}
