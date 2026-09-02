import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildDistanceBook,
  createLocation,
  deleteLocation,
  fetchDistance,
  fetchLocation,
  fetchLocations,
  fetchMapsStatus,
  searchPlaces,
  updateLocation,
  type CreateLocationPayload,
  type LocationFilters,
} from './locationsService';

export const locationQueryKeys = {
  all: ['locations'] as const,
  list: (filters: LocationFilters) => ['locations', 'list', filters] as const,
  detail: (id: string) => ['locations', 'detail', id] as const,
  status: ['locations', 'status'] as const,
  search: (query: string) => ['locations', 'search', query] as const,
  distance: (originId: string, destinationId: string) =>
    ['locations', 'distance', originId, destinationId] as const,
};

export function useLocations(filters: LocationFilters = {}) {
  return useQuery({
    queryKey: locationQueryKeys.list(filters),
    queryFn: () => fetchLocations(filters),
  });
}

export function useLocation(id: string | undefined) {
  return useQuery({
    queryKey: locationQueryKeys.detail(id ?? ''),
    queryFn: () => fetchLocation(id as string),
    enabled: Boolean(id),
  });
}

/** Whether the server can reach Google at all. Rarely changes; cached hard. */
export function useMapsStatus() {
  return useQuery({
    queryKey: locationQueryKeys.status,
    queryFn: fetchMapsStatus,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Google place search, as the operator types.
 *
 * `enabled` on a three-character floor rather than debouncing in the component:
 * every keystroke past that is a billed Google call, so the caller passes an
 * already-debounced term and this refuses anything shorter. Results are cached
 * per term — retyping a search that just ran costs nothing.
 */
export function usePlaceSearch(query: string, enabled = true) {
  const term = query.trim();
  return useQuery({
    queryKey: locationQueryKeys.search(term),
    queryFn: () => searchPlaces(term),
    enabled: enabled && term.length >= 3,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/**
 * The road between two locations.
 *
 * Server-cached, so this is normally one fast round trip and no Google call at
 * all. `staleTime: Infinity` because a measured road does not change while a
 * form is open — a refresh is an explicit action, not a refetch.
 */
export function useDistance(originId?: string, destinationId?: string) {
  return useQuery({
    queryKey: locationQueryKeys.distance(originId ?? '', destinationId ?? ''),
    queryFn: () => fetchDistance(originId as string, destinationId as string),
    enabled: Boolean(originId && destinationId && originId !== destinationId),
    staleTime: Infinity,
    retry: false,
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: locationQueryKeys.all });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLocationPayload) => createLocation(payload),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateLocationPayload> }) =>
      updateLocation(id, payload),
    /* Everything, not just the detail: moving a pin drops that location's
       cached distances on the server, so any distance this session is holding
       is now stale too. */
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useBuildDistanceBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (refresh?: boolean) => buildDistanceBook(refresh ?? false),
    onSuccess: () => invalidate(queryClient),
  });
}
