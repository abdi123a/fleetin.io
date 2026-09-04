import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  approveExpense,
  createExpense,
  createRecurringExpense,
  deleteRecurringExpense,
  fetchExpense,
  fetchExpenses,
  fetchRecurringExpenses,
  payExpense,
  postRecurringExpense,
  rejectExpense,
  updateExpense,
  updateRecurringExpense,
  withdrawExpense,
  type CreateExpensePayload,
  type CreateRecurringExpensePayload,
  type ExpenseFilters,
  type UpdateExpensePayload,
  type UpdateRecurringExpensePayload,
} from './expensesService';

export const expenseQueryKeys = {
  all: ['expenses'] as const,
  list: (filters: ExpenseFilters) => ['expenses', 'list', filters] as const,
  detail: (id: string) => ['expenses', 'detail', id] as const,
  recurring: ['expenses', 'recurring'] as const,
};

export function useExpenses(filters: ExpenseFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: expenseQueryKeys.list(filters),
    queryFn: () => fetchExpenses(filters),
    enabled: options.enabled,
  });
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: expenseQueryKeys.detail(id ?? ''),
    queryFn: () => fetchExpense(id as string),
    enabled: Boolean(id),
  });
}

export function useRecurringExpenses(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: expenseQueryKeys.recurring,
    queryFn: fetchRecurringExpenses,
    enabled: options.enabled,
  });
}

/**
 * One invalidation for the whole module.
 *
 * Posting a recurring obligation writes an expense AND moves the template's
 * due date, so any mutation that touches one side can change the other. The
 * two lists are small and the page shows them side by side; refetching both is
 * cheaper than reasoning about which half went stale.
 */
function invalidateExpenses(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: expenseQueryKeys.all });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpensePayload) => createExpense(payload),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateExpensePayload }) => updateExpense(id, payload),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useApproveExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveExpense(id),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useRejectExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectExpense(id, reason),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function usePayExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paidAt }: { id: string; paidAt?: string }) => payExpense(id, paidAt),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useWithdrawExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => withdrawExpense(id),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecurringExpensePayload) => createRecurringExpense(payload),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRecurringExpensePayload }) =>
      updateRecurringExpense(id, payload),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function usePostRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postRecurringExpense(id),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurringExpense(id),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}
