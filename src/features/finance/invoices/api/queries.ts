import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelInvoice,
  createProforma,
  fetchInvoice,
  fetchInvoices,
  fetchInvoicesForShipment,
  issueInvoice,
  issueProjectInvoice,
  markInvoicePaid,
  markInvoiceSent,
  type CreateProformaPayload,
  type InvoiceFilters,
} from './invoicesService';

export const invoiceQueryKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
  forShipment: (shipmentId: string) => ['invoices', 'shipment', shipmentId] as const,
};

export function useInvoices(filters: InvoiceFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: invoiceQueryKeys.list(filters),
    queryFn: () => fetchInvoices(filters),
    enabled: options.enabled,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: invoiceQueryKeys.detail(id ?? ''),
    queryFn: () => fetchInvoice(id as string),
    enabled: Boolean(id),
  });
}

export function useInvoicesForShipment(shipmentId: string | undefined) {
  return useQuery({
    queryKey: invoiceQueryKeys.forShipment(shipmentId ?? ''),
    queryFn: () => fetchInvoicesForShipment(shipmentId as string),
    enabled: Boolean(shipmentId),
  });
}

/*
 * Every mutation invalidates the whole `invoices` key rather than patching one
 * row: a document changes the shipment's billing state, the project's totals
 * and the list it appears in, and three of those are not the row that was
 * mutated. Projects are invalidated too, for the same reason.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: invoiceQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: ['projects'] });
  queryClient.invalidateQueries({ queryKey: ['shipments'] });
}

export function useIssueInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipmentId: string) => issueInvoice(shipmentId),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useIssueProjectInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => issueProjectInvoice(projectId),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCreateProforma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProformaPayload) => createProforma(payload),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useMarkInvoiceSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markInvoiceSent(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markInvoicePaid(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelInvoice(id, reason),
    onSuccess: () => invalidate(queryClient),
  });
}
