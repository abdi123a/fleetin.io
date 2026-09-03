import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  clearCycleImpactDecision,
  decideCycleImpact,
  fetchBookingRoute,
  fetchEmissionsDashboard,
  fetchEmissionsFilterOptions,
  fetchShipmentImpact,
  rebuildBookingRoute,
  rebuildImpact,
  replaceBookingRoute,
  type EmissionsFilters,
} from './emissionsService';

export const emissionsQueryKeys = {
  all: ['emissions'] as const,
  dashboard: (filters: EmissionsFilters) => ['emissions', 'dashboard', filters] as const,
  filters: () => ['emissions', 'filters'] as const,
  route: (bookingId: string) => ['emissions', 'route', bookingId] as const,
  shipmentImpact: (shipmentId: string) => ['emissions', 'impact', 'shipment', shipmentId] as const,
};

export function useShipmentImpact(shipmentId: string | undefined) {
  return useQuery({
    queryKey: emissionsQueryKeys.shipmentImpact(shipmentId ?? ''),
    queryFn: () => fetchShipmentImpact(shipmentId as string),
    enabled: Boolean(shipmentId),
  });
}

/**
 * A verdict changes the cycle's record, the booking sheet that shows it, the
 * dashboard total and the chain it sits in — so every read that could print
 * the old word is dropped.
 */
function invalidateImpact(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: emissionsQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: ['bookings'] });
  queryClient.invalidateQueries({ queryKey: ['empty-returns'] });
}

export function useDecideCycleImpact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cycleId, realized, note }: { cycleId: string; realized: boolean; note?: string }) =>
      decideCycleImpact(cycleId, { realized, note }),
    onSuccess: () => invalidateImpact(queryClient),
  });
}

export function useClearCycleImpact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => clearCycleImpactDecision(cycleId),
    onSuccess: () => invalidateImpact(queryClient),
  });
}

export function useRebuildImpact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rebuildImpact(),
    onSuccess: () => invalidateImpact(queryClient),
  });
}

export function useEmissionsDashboard(filters: EmissionsFilters = {}) {
  return useQuery({
    queryKey: emissionsQueryKeys.dashboard(filters),
    queryFn: () => fetchEmissionsDashboard(filters),
  });
}

/** The filter options. Stable across a session — the fleet does not change while you read. */
export function useEmissionsFilterOptions() {
  return useQuery({
    queryKey: emissionsQueryKeys.filters(),
    queryFn: fetchEmissionsFilterOptions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBookingRoute(bookingId: string | undefined) {
  return useQuery({
    queryKey: emissionsQueryKeys.route(bookingId ?? ''),
    queryFn: () => fetchBookingRoute(bookingId as string),
    enabled: Boolean(bookingId),
  });
}

/**
 * Re-measuring a route rewrites the booking's stored distance and carbon, so
 * every booking read has to be dropped alongside the route itself — a card
 * still showing the old figure beside a panel showing the new one is the same
 * record disagreeing with itself on one screen.
 */
function invalidateRoute(queryClient: ReturnType<typeof useQueryClient>, bookingId: string) {
  queryClient.invalidateQueries({ queryKey: emissionsQueryKeys.route(bookingId) });
  queryClient.invalidateQueries({ queryKey: emissionsQueryKeys.all });
  /* The whole `bookings` prefix, not one key. A per-shipment booking list is
     cached under whatever id its caller held — sometimes the reference,
     sometimes the UUID — so there is no single key to address. See
     `bookingQueryKeys.allForShipments`. */
  queryClient.invalidateQueries({ queryKey: ['bookings'] });
}

export function useRebuildBookingRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => rebuildBookingRoute(bookingId),
    onSuccess: (_data, bookingId) => invalidateRoute(queryClient, bookingId),
  });
}

export function useReplaceBookingRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      stops,
    }: {
      bookingId: string;
      stops: { locationId: string; purpose?: string }[];
    }) => replaceBookingRoute(bookingId, stops),
    onSuccess: (_data, variables) => invalidateRoute(queryClient, variables.bookingId),
  });
}
