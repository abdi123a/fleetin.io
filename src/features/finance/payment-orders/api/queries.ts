import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankAccountQueryKeys } from '@/features/bank-accounts';
import {
  fetchAllPaymentOrders,
  fetchPaymentOrder,
  fetchPaymentOrders,
  payTransporter,
  type PaymentOrderFilters,
  type PayTransporterPayload,
} from './paymentOrdersService';

export const paymentOrderQueryKeys = {
  all: ['payment-orders'] as const,
  list: (filters: PaymentOrderFilters) => ['payment-orders', 'list', filters] as const,
  detail: (id: string) => ['payment-orders', 'detail', id] as const,
};

export function usePaymentOrders(filters: PaymentOrderFilters = {}) {
  return useQuery({
    queryKey: paymentOrderQueryKeys.list(filters),
    queryFn: () => fetchPaymentOrders(filters),
  });
}

/** Every page of the list, concatenated — for the admin console's whole-book totals. */
export function useAllPaymentOrders(filters: PaymentOrderFilters = {}) {
  return useQuery({
    queryKey: [...paymentOrderQueryKeys.list(filters), 'all'] as const,
    queryFn: () => fetchAllPaymentOrders(filters),
  });
}

/** All payment orders for one shipment (every transporter paid on it). */
export function usePaymentOrdersForShipment(shipmentId: string | undefined) {
  return useQuery({
    queryKey: paymentOrderQueryKeys.list({ shipmentId }),
    queryFn: () => fetchPaymentOrders({ shipmentId }),
    enabled: Boolean(shipmentId),
  });
}

export function usePaymentOrder(id: string | undefined) {
  return useQuery({
    queryKey: paymentOrderQueryKeys.detail(id ?? ''),
    queryFn: () => fetchPaymentOrder(id as string),
    enabled: Boolean(id),
  });
}

export function usePayTransporter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayTransporterPayload) => payTransporter(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentOrderQueryKeys.all });
      // The bank account debited by this payout needs to refetch too, not just Payment Orders' own queries.
      queryClient.invalidateQueries({ queryKey: bankAccountQueryKeys.all });
    },
  });
}
