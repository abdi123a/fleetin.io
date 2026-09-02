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
 * Every cached booking list, addressed by prefix.
 *
 * NOT `['bookings','shipment', shipmentId]`, which is what these mutations used
 * until 2026-09-02 and is the trap `useUpdateBooking` documents at length: the
 * Shipment Overview page caches its bookings under the shipment **reference**
 * from the URL, while a mutation response carries the **UUID**. Invalidating by
 * UUID addressed a bucket nothing was reading — so planning a return, creating
 * a pairing or cancelling one changed the database, changed nothing on screen,
 * and only showed up after the reader pressed refresh.
 *
 * A prefix lands whichever key the caller used. It is broader than strictly
 * needed — every shipment's booking list refetches, not just this one — and
 * that is the right trade for a module whose writes ripple across shipments
 * anyway: a pairing touches two bookings on two different shipments.
 */
const ALL_BOOKING_LISTS = ['bookings'] as const;

export function useCreateCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCyclePayload) => createCycle(payload),
    onSuccess: () => {
      invalidateEmptyReturns(queryClient);
      /* `createCycle` force-transitions the outbound booking to `Assigned`, and
         marks the empty as paired — two bookings on two shipments, both now
         stale. The prefix covers both without needing to know either key. */
      queryClient.invalidateQueries({ queryKey: ALL_BOOKING_LISTS });
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
    onSuccess: () => {
      invalidateEmptyReturns(queryClient);
      /* This is what makes the standalone mark appear without a reload. */
      queryClient.invalidateQueries({ queryKey: ALL_BOOKING_LISTS });
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
    onSuccess: () => {
      invalidateEmptyReturns(queryClient);
      queryClient.invalidateQueries({ queryKey: ALL_BOOKING_LISTS });
    },
  });
}

export function useConfirmStandaloneReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => confirmStandaloneReturn(bookingId),
    onSuccess: () => {
      invalidateEmptyReturns(queryClient);
      /* Same prefix, same reason — confirming the box is home is the write that
         flips the card to RETURNED, and it was landing on the wrong key too. */
      queryClient.invalidateQueries({ queryKey: ALL_BOOKING_LISTS });
    },
  });
}
