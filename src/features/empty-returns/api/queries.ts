import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  cancelCycle,
  confirmStandaloneReturn,
  createCycle,
  fetchAvailableEmpties,
  fetchChains,
  fetchCycle,
  fetchCycles,
  fetchOpenFullLoads,
  planEmptyReturn,
  type CreateCyclePayload,
  type CycleFilters,
} from './emptyReturnsService';

export const emptyReturnQueryKeys = {
  all: ['empty-returns'] as const,
  availableEmpties: ['empty-returns', 'available-empties'] as const,
  openFullLoads: ['empty-returns', 'open-full-loads'] as const,
  cycles: (filters: CycleFilters = {}) => ['empty-returns', 'cycles', filters] as const,
  cycle: (id: string) => ['empty-returns', 'cycles', 'detail', id] as const,
  chains: ['empty-returns', 'chains'] as const,
};

export function useAvailableEmpties() {
  return useQuery({ queryKey: emptyReturnQueryKeys.availableEmpties, queryFn: fetchAvailableEmpties });
}

export function useOpenFullLoads() {
  return useQuery({ queryKey: emptyReturnQueryKeys.openFullLoads, queryFn: fetchOpenFullLoads });
}

export function useCycles(filters: CycleFilters = {}) {
  return useQuery({ queryKey: emptyReturnQueryKeys.cycles(filters), queryFn: () => fetchCycles(filters) });
}

export function useCycle(id: string | undefined) {
  return useQuery({
    queryKey: emptyReturnQueryKeys.cycle(id ?? ''),
    queryFn: () => fetchCycle(id as string),
    enabled: Boolean(id),
  });
}

export function useChains() {
  return useQuery({ queryKey: emptyReturnQueryKeys.chains, queryFn: fetchChains });
}

/** Every empty-return list is a live reflection of booking state — invalidate the whole module on any write here. */
function invalidateEmptyReturns(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: emptyReturnQueryKeys.all });
}

/**
 * Mirrors `bookingQueryKeys.forShipment` from `@/features/bookings/api/queries`
 * without importing it — `bookings/queries.ts` already imports this module
 * (to invalidate empty-returns after a status change), and the reverse
 * import would be circular. Keep this key literal in sync with that file's.
 */
function bookingsForShipmentKey(shipmentId: string) {
  return ['bookings', 'shipment', shipmentId] as const;
}

export function useCreateCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCyclePayload) => createCycle(payload),
    onSuccess: (cycle) => {
      invalidateEmptyReturns(queryClient);
      // `createCycle` force-transitions the outbound booking to `Assigned` — its own shipment's booking list is now stale too.
      if (cycle.nextBooking) {
        queryClient.invalidateQueries({ queryKey: bookingsForShipmentKey(cycle.nextBooking.shipmentId) });
      }
    },
  });
}

export interface PlanEmptyReturnInput {
  bookingId: string;
  /** ISO 8601. Omitted when the operator stops matching before the slot is known. */
  plannedReturnAt?: string;
}

/** "Plan Empty Return" — the branch taken when no full load can use the container in time. */
export function usePlanEmptyReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, plannedReturnAt }: PlanEmptyReturnInput) =>
      planEmptyReturn(bookingId, plannedReturnAt),
    onSuccess: (booking) => {
      invalidateEmptyReturns(queryClient);
      queryClient.invalidateQueries({ queryKey: bookingsForShipmentKey(booking.shipmentId) });
    },
  });
}

/** Kept under its old name for callers outside this module. */
export const useMarkStandalone = usePlanEmptyReturn;

/**
 * "Cancel Pairing" — hand the outbound load back and put the container on
 * Empty Ready again.
 *
 * The outbound booking walks back to `Pending`, so its own shipment's booking
 * list is stale on success exactly as it is after `useCreateCycle`.
 */
export function useCancelCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => cancelCycle(cycleId),
    onSuccess: (cancelled) => {
      invalidateEmptyReturns(queryClient);
      if (cancelled.shipmentId) {
        queryClient.invalidateQueries({ queryKey: bookingsForShipmentKey(cancelled.shipmentId) });
      }
    },
  });
}

export function useConfirmStandaloneReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => confirmStandaloneReturn(bookingId),
    onSuccess: (cycle) => {
      invalidateEmptyReturns(queryClient);
      queryClient.invalidateQueries({ queryKey: bookingsForShipmentKey(cycle.booking.shipmentId) });
    },
  });
}
