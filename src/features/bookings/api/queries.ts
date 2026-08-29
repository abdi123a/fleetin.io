import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { shipmentQueryKeys } from '@/features/shipments/api/queries';
import { emptyReturnQueryKeys } from '@/features/empty-returns/api/queries';
import {
  createBookings,
  fetchBooking,
  fetchBookings,
  fetchBookingsForShipment,
  updateBooking,
  updateBookingStatus,
  type BookingListFilters,
  type BookingRecord,
  type CreateBookingItemPayload,
  type UpdateBookingPayload,
} from './bookingsService';

export const bookingQueryKeys = {
  /**
   * Every per-shipment booking list, whatever id it was cached under.
   *
   * This prefix is load-bearing. The id in the key is *whatever the caller
   * held* — the Shipment Overview page holds the human reference (`241719`),
   * because that is what the URL carries, while a `BookingRecord` carries the
   * shipment's UUID. So a write that rebuilds the key from `record.shipmentId`
   * addresses a bucket nothing reads. Match on the prefix instead.
   */
  allForShipments: ['bookings', 'shipment'] as const,
  forShipment: (shipmentId: string) => ['bookings', 'shipment', shipmentId] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
  list: (filters: BookingListFilters) => ['bookings', 'list', filters] as const,
};

/** The booking book, filtered — the transporter workspace reads this with `partnerId`. */
export function useBookings(filters: BookingListFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: bookingQueryKeys.list(filters),
    queryFn: () => fetchBookings(filters),
    enabled: options.enabled ?? true,
  });
}

export function useBookingsForShipment(shipmentId: string | undefined) {
  return useQuery({
    queryKey: bookingQueryKeys.forShipment(shipmentId ?? ''),
    queryFn: () => fetchBookingsForShipment(shipmentId as string),
    enabled: Boolean(shipmentId),
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: bookingQueryKeys.detail(id ?? ''),
    queryFn: () => fetchBooking(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Moves a booking ONE rung through its lifecycle.
 *
 * Both callers walk several rungs per click — choosing "Empty Returned" from
 * Depotage writes `Empty Ready → Empty Picked Up → Completed`, one PATCH each,
 * because every rung is a real event with its own timeline stamp.
 *
 * ## Why this writes the cache instead of invalidating it
 *
 * It used to invalidate the shipment's booking list on every rung. Each of
 * those started a refetch *while the next rung was still being written*, so
 * three PATCHes raced three GETs and whichever GET resolved last won — the card
 * snapped back to a status one or two rungs behind, and only a manual reload
 * showed the truth. The page mirrors this query into local state, so the stale
 * answer stuck.
 *
 * The response to a status PATCH **is** the updated booking, so there is
 * nothing to go and ask for: cancel whatever is already in flight and merge the
 * record straight in. Merge rather than replace, because the list rows carry
 * joined `partner` / `driver` / `vehicle` objects and a thin write would blank
 * the names until a refetch landed.
 *
 * What genuinely does need re-reading — the shipment's derived status and the
 * empty-return cycles — is settled once at the end of the walk by
 * `useSettleBookingStatus`, not once per rung.
 */
export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, occurredAt }: { id: string; status: string; occurredAt?: string }) =>
      updateBookingStatus(id, status, occurredAt),
    onSuccess: (data) => absorbBookingRecord(queryClient, data),
  });
}

/**
 * Fold a status PATCH's response into the caches that hold that booking.
 *
 * Three things have to be true, and none of them were:
 *
 * 1. **Address the list the page actually reads.** The Shipment Overview page
 *    caches its bookings under the shipment *reference* — `241719`, the thing in
 *    the URL — while the record that comes back carries the shipment's UUID.
 *    Keying off `data.shipmentId` therefore wrote to, and invalidated, a bucket
 *    nothing was reading: the list was never refreshed, which is why the card
 *    only told the truth after a manual reload. So patch by prefix and match the
 *    row on the booking's own id, which is the same in every cache.
 * 2. **Cancel** any read already in flight. On a multi-rung walk that read was
 *    started by an earlier rung and is about to come back with a status the
 *    booking has already moved past; left alone it lands *after* this write and
 *    undoes it.
 * 3. **Merge, never replace.** The list rows carry joined `partner` / `driver` /
 *    `vehicle` objects that a status response has no reason to repeat, and a
 *    straight replace would blank the names on the card until a refetch landed.
 */
export async function absorbBookingRecord(queryClient: QueryClient, data: BookingRecord) {
  await queryClient.cancelQueries({ queryKey: bookingQueryKeys.allForShipments });
  queryClient.setQueriesData<BookingRecord[]>(
    { queryKey: bookingQueryKeys.allForShipments },
    (previous) =>
      previous?.some((booking) => booking.id === data.id)
        ? previous.map((booking) => (booking.id === data.id ? { ...booking, ...data } : booking))
        : previous,
  );
  queryClient.setQueryData<BookingRecord>(bookingQueryKeys.detail(data.id), (previous) =>
    previous ? { ...previous, ...data } : data,
  );
}

/**
 * Re-read everything a status change moves that the response could not tell us
 * — call it ONCE, when the whole walk is over.
 *
 * Two things are computed elsewhere and cannot come back on a booking's own
 * PATCH. The shipment's status is *derived* from its bookings server-side, so
 * moving one booking can move the shipment and every list it appears in. And
 * Empty Return's cycle status is never set directly — it is a reflection of
 * whichever booking is its `nextBooking` (see
 * `EmptyReturnsService.syncCycleStatusForBooking`).
 *
 * The booking list is invalidated too, as a confirmation pass: by now the cache
 * already holds the right answer, so the refetch has nothing to race.
 */
export function useSettleBookingStatus() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    /* `['bookings']`, not a key built from the record: same reason
       `absorbBookingRecord` patches by prefix — the id a list was cached under
       is the caller's, and this has no way to know which one that was. The
       prefix also picks up the transporter workspace's own filtered lists,
       which is right: the booking they are showing did change. */
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: emptyReturnQueryKeys.all });
    queryClient.invalidateQueries({ queryKey: shipmentQueryKeys.all });
  }, [queryClient]);
}

/** Non-status fields — assigning the vehicle/driver that will actually run this booking. */
export function useUpdateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBookingPayload }) => updateBooking(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.forShipment(data.shipmentId) });
    },
  });
}

/** Creates every booking for a shipment in one call — see `CreateShipmentModal`. */
export function useCreateBookings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, bookings }: { shipmentId: string; bookings: CreateBookingItemPayload[] }) =>
      createBookings(shipmentId, bookings),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.forShipment(variables.shipmentId) });
      // The shipment's own detail view may surface booking counts later.
      queryClient.invalidateQueries({ queryKey: shipmentQueryKeys.detail(variables.shipmentId) });
    },
  });
}
