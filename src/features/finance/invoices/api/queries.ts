import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankAccountQueryKeys } from '@/features/bank-accounts';
import {
  fetchAllInvoices,
  fetchInvoice,
  fetchInvoices,
  issueInvoiceForShipment,
  issueMonthlyStatement,
  markInvoicePaid,
  type InvoiceFilters,
  type IssueStatementPayload,
} from './invoicesService';

export const invoiceQueryKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
};

export function useInvoices(filters: InvoiceFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: invoiceQueryKeys.list(filters),
    queryFn: () => fetchInvoices(filters),
    enabled: options.enabled,
  });
}

/**
 * Every page of the list, concatenated — for the admin console's whole-book totals.
 *
 * `enabled` matches `useInvoices` above: the whole book is gated on
 * `finance.view`, so a caller that already knows the account lacks it should
 * not spend a round trip discovering that from a 403.
 */
export function useAllInvoices(
  filters: InvoiceFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...invoiceQueryKeys.list(filters), 'all'] as const,
    queryFn: () => fetchAllInvoices(filters),
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

function invalidateInvoices(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: invoiceQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: invoiceQueryKeys.detail(id) });
}

export function useIssueInvoiceForShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipmentId: string) => issueInvoiceForShipment(shipmentId),
    onSuccess: () => invalidateInvoices(queryClient),
  });
}

/** The normal way a shipper is billed — see `issueMonthlyStatement`. */
export function useIssueMonthlyStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IssueStatementPayload) => issueMonthlyStatement(payload),
    onSuccess: () => invalidateInvoices(queryClient),
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bankAccountId }: { id: string; bankAccountId: string }) => markInvoicePaid(id, bankAccountId),
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient, variables.id);
      // The bank account credited by this payment needs to refetch too, not just Invoices' own queries.
      queryClient.invalidateQueries({ queryKey: bankAccountQueryKeys.all });
    },
  });
}
