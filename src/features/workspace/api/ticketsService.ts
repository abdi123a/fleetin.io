import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

import type {
  RecordType,
  TaskPriority,
  TaskStatus,
  TicketChannel,
  TicketPage,
  TicketSummary,
  WorkspaceTicket,
} from '../contracts';

/**
 * The read/write side of `/workspace/tickets`.
 *
 * A separate file from `workspaceService` because tickets are a separate
 * surface with a separate queue, and the task service is already the largest
 * file in the feature. Same token-per-call shape as its neighbour.
 */
function token() {
  return useAuthStore.getState().accessToken;
}

/** The orderings the server knows — see `TICKET_ORDER` in `tickets.service.ts`. */
export type TicketSort = 'newest' | 'oldest' | 'priority';

export interface TicketFilters {
  /** The queue tab. `unassigned` means "no task raised yet"; `mine` means the
      task is on my desk. */
  scope?: 'open' | 'unassigned' | 'closed' | 'all' | 'mine';
  status?: TaskStatus;
  priority?: TaskPriority;
  recordType?: RecordType;
  recordId?: string;
  assigneeId?: string;
  q?: string;
  /** How the queue is stacked. Newest first when absent — see `TICKET_ORDER`. */
  sort?: TicketSort;
  page?: number;
  pageSize?: number;
}

function toQuery(filters: TicketFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchTickets(filters: TicketFilters = {}): Promise<TicketPage> {
  const res = await apiClient.get<TicketPage>(`/workspace/tickets${toQuery(filters)}`, token());
  return res.data;
}

export async function fetchTicketSummary(): Promise<TicketSummary> {
  const res = await apiClient.get<TicketSummary>('/workspace/tickets/summary', token());
  return res.data;
}

export async function fetchTicket(idOrRef: string): Promise<WorkspaceTicket> {
  const res = await apiClient.get<WorkspaceTicket>(`/workspace/tickets/${idOrRef}`, token());
  return res.data;
}

export interface CreateTicketPayload {
  subject: string;
  description: string;
  priority?: TaskPriority;
  channel?: TicketChannel;
  reporterName?: string;
  reporterContact?: string;
  recordType?: RecordType;
  /** A uuid or a human reference — whatever the picker handed over. */
  recordId?: string;
  /** Naming somebody raises the task in the same call. */
  assigneeId?: string;
  dueAt?: string;
}

export async function createTicket(payload: CreateTicketPayload): Promise<WorkspaceTicket> {
  const res = await apiClient.post<WorkspaceTicket>('/workspace/tickets', payload, token());
  return res.data;
}

export type UpdateTicketPayload = Partial<CreateTicketPayload> & { status?: TaskStatus };

/**
 * Everything about a ticket except its status once a task exists — the server
 * refuses that write, because the task is what moves from then on.
 */
export async function updateTicket(
  idOrRef: string,
  payload: UpdateTicketPayload,
): Promise<WorkspaceTicket> {
  const res = await apiClient.patch<WorkspaceTicket>(
    `/workspace/tickets/${idOrRef}`,
    payload,
    token(),
  );
  return res.data;
}

export interface RaiseTicketTaskPayload {
  title?: string;
  description?: string;
  assigneeId?: string;
  dueAt?: string;
  priority?: TaskPriority;
  /** Carry the ticket's record onto the task as a link. Default true. */
  linkRecord?: boolean;
}

/** Hand the problem to somebody. Returns the ticket, now carrying its task. */
export async function raiseTicketTask(
  idOrRef: string,
  payload: RaiseTicketTaskPayload,
): Promise<WorkspaceTicket> {
  const res = await apiClient.post<WorkspaceTicket>(
    `/workspace/tickets/${idOrRef}/task`,
    payload,
    token(),
  );
  return res.data;
}

export async function deleteTicket(idOrRef: string): Promise<{ ok: boolean }> {
  const res = await apiClient.delete<{ ok: boolean }>(
    `/workspace/tickets/${idOrRef}`,
    token(),
  );
  return res.data;
}
