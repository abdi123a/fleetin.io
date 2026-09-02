import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { workspaceQueryKeys } from './queries';
import {
  createTicket,
  deleteTicket,
  fetchTicket,
  fetchTicketSummary,
  fetchTickets,
  raiseTicketTask,
  updateTicket,
  type CreateTicketPayload,
  type RaiseTicketTaskPayload,
  type TicketFilters,
  type UpdateTicketPayload,
} from './ticketsService';

export const ticketQueryKeys = {
  all: [...workspaceQueryKeys.all, 'tickets'] as const,
  list: (filters: TicketFilters) => [...ticketQueryKeys.all, filters] as const,
  summary: () => [...ticketQueryKeys.all, 'summary'] as const,
  detail: (idOrRef: string) => [...ticketQueryKeys.all, 'detail', idOrRef] as const,
};

/* Same 30s beat the task list uses, and paused in a hidden tab by the same
   TanStack default. A ticket queue is watched the way the board is. */
const POLL_LIST = 30_000;

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: ticketQueryKeys.list(filters),
    queryFn: () => fetchTickets(filters),
    refetchInterval: POLL_LIST,
  });
}

export function useTicketSummary() {
  return useQuery({
    queryKey: ticketQueryKeys.summary(),
    queryFn: fetchTicketSummary,
    refetchInterval: POLL_LIST,
  });
}

export function useTicket(idOrRef: string | undefined) {
  return useQuery({
    queryKey: ticketQueryKeys.detail(idOrRef ?? ''),
    queryFn: () => fetchTicket(idOrRef as string),
    enabled: Boolean(idOrRef),
  });
}

/**
 * Everything a ticket mutation touches, in one sweep.
 *
 * Wider than the tickets subtree on purpose: raising a task from a ticket
 * creates a real task, which changes the task list, the summary counts, the
 * assignee's inbox and their unread badge. Invalidating only the tickets would
 * leave the board showing a task count that is one short until something else
 * happened to refetch it.
 */
function useInvalidateTickets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
}

export function useCreateTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: (payload: CreateTicketPayload) => createTicket(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ idOrRef, patch }: { idOrRef: string; patch: UpdateTicketPayload }) =>
      updateTicket(idOrRef, patch),
    onSuccess: invalidate,
  });
}

export function useRaiseTicketTask() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ idOrRef, payload }: { idOrRef: string; payload: RaiseTicketTaskPayload }) =>
      raiseTicketTask(idOrRef, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: (idOrRef: string) => deleteTicket(idOrRef),
    onSuccess: invalidate,
  });
}
