import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shipmentQueryKeys } from '@/features/shipments/api/queries';
import { emptyReturnQueryKeys } from '@/features/empty-returns/api/queries';
import {
  createBookings,
  fetchBooking,
  fetchBookingsForShipment,
  updateBooking,
  updateBookingStatus,
  type CreateBookingItemPayload,
  type UpdateBookingPayload,
} from './bookingsService';

export const bookingQueryKeys = {
  forShipment: (shipmentId: string) => ['bookings', 'shipment', shipmentId] as const,
  detail: (id: string) => ['bookings', 'detail', id] as const,
};

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
 * Moves a booking one step through its lifecycle. This is the one real
 * status-advance action in the app — Empty Return's cycle status is never
 * set directly, it's a server-side reflection of whichever booking is its
 * `nextBooking` (see `EmptyReturnsService.syncCycleStatusForBooking`), so
 * every empty-return-cycle query is invalidated alongside the booking's own.
 */
export function useUpdateBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateBookingStatus(id, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: bookingQueryKeys.forShipment(data.shipmentId) });
      queryClient.invalidateQueries({ queryKey: emptyReturnQueryKeys.all });
    },
  });
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
