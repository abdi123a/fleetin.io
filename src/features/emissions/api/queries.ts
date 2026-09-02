import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchBookingRoute,
  fetchEmissionsDashboard,
  fetchEmissionsFilterOptions,
  rebuildBookingRoute,
  replaceBookingRoute,
  type EmissionsFilters,
} from './emissionsService';

export const emissionsQueryKeys = {
  all: ['emissions'] as const,
  dashboard: (filters: EmissionsFilters) => ['emissions', 'dashboard', filters] as const,
  filters: () => ['emissions', 'filters'] as const,
  route: (bookingId: string) => ['emissions', 'route', bookingId] as const,
};

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
