import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useShipmentStore } from '@/stores/shipment.store';
import {
  createShipment,
  deleteShipment,
  fetchAllShipmentsRaw,
  fetchShipment,
  fetchShipmentRaw,
  fetchShipments,
  fetchShipmentsRaw,
  releaseShipment,
  updateShipment,
  updateShipmentRaw,
  updateShipmentStatus,
  type CreateShipmentPayload,
  type ShipmentFilters,
  type UpdateShipmentPayload,
  repriceShipment,
  repriceUnpricedShipments,
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

/** Raw `ShipmentRecord[]` instead of `Mission`-mapped — for Finance. */
export function useShipmentsRaw(filters: ShipmentFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...shipmentQueryKeys.list(filters), 'raw'] as const,
    queryFn: () => fetchShipmentsRaw(filters),
    enabled: options.enabled,
  });
}

/** Every page of the raw list, concatenated — for the admin console's whole-book totals. */
export function useAllShipmentsRaw(filters: ShipmentFilters = {}) {
  return useQuery({
    queryKey: [...shipmentQueryKeys.list(filters), 'raw', 'all'] as const,
    queryFn: () => fetchAllShipmentsRaw(filters),
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: shipmentQueryKeys.detail(id ?? ''),
    queryFn: () => fetchShipment(id as string),
    enabled: Boolean(id),
  });
}

/** Raw `ShipmentRecord` (money fields included) instead of the `Mission`-mapped shape — for Finance. */
export function useShipmentRaw(id: string | undefined) {
  return useQuery({
    queryKey: [...shipmentQueryKeys.detail(id ?? ''), 'raw'] as const,
    queryFn: () => fetchShipmentRaw(id as string),
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

/** Same mutation as `useUpdateShipment`, but resolves with the raw record (money fields) — for Finance call sites. */
export function useUpdateShipmentRaw() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateShipmentPayload }) => updateShipmentRaw(id, payload),
    onSuccess: (_data, variables) => invalidateShipments(queryClient, variables.id),
  });
}

export function useReleaseShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => releaseShipment(id),
    onSuccess: (_data, id) => invalidateShipments(queryClient, id),
  });
}

/** Prices one previously-unpriced shipment off its transporters' price lists. */
export function useRepriceShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repriceShipment(id),
    onSuccess: (_data, id) => invalidateShipments(queryClient, id),
  });
}

/** The bulk version — clears a whole backlog of unpriced shipments in one call. */
export function useRepriceUnpricedShipments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipperId?: string) => repriceUnpricedShipments(shipperId),
    onSuccess: () => invalidateShipments(queryClient),
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
 * `MissionsPage` and `MissionRowCard`) in sync with the backend. Call once
 * from a shared layout point — every page that mounts it re-fetches on the
 * same query key, so it's cheap to call from more than one page.
 */
export function useHydrateShipments() {
  const { data } = useShipments();
  const setMissions = useShipmentStore((s) => s.setMissions);

  useEffect(() => {
    if (data) setMissions(data.items);
  }, [data, setMissions]);
}
