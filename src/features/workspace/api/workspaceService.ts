import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

import type {
  RecordSummary, RecordType, TaskPage, TaskPriority, TaskStatus,
  WorkspaceInbox, WorkspaceMessage, WorkspaceNotification, WorkspaceTaskDetail,
} from '../contracts';

/**
 * The read/write side of `/workspace`.
 *
 * Token is read imperatively per call, the same shape `teamService.ts` uses —
 * these are plain functions, not hooks, and cannot subscribe to the store.
 */
function token() {
  return useAuthStore.getState().accessToken;
}

export interface TaskFilters {
  q?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  /** A user id, or the literal `unassigned`. */
  assigneeId?: string;
  createdById?: string;
  recordType?: RecordType;
  /** A record id or reference — "what is open on 260701?" */
  recordId?: string;
  due?: 'overdue' | 'today' | 'week' | 'none';
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

function toQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchTasks(filters: TaskFilters = {}): Promise<TaskPage> {
  const res = await apiClient.get<TaskPage>(`/workspace/tasks${toQuery(filters)}`, token());
  return res.data;
}

export interface TaskSummary {
  all: number;
  open: number;
  overdue: number;
  unassigned: number;
}

/** Totals per scope tab. The list is paginated, so it cannot count them itself. */
export async function fetchTaskSummary(filters: TaskFilters = {}): Promise<TaskSummary> {
  const res = await apiClient.get<TaskSummary>(`/workspace/tasks/summary${toQuery(filters)}`, token());
  return res.data;
}

export async function fetchTask(idOrRef: string): Promise<WorkspaceTaskDetail> {
  const res = await apiClient.get<WorkspaceTaskDetail>(`/workspace/tasks/${idOrRef}`, token());
  return res.data;
}

/** Open-task counts keyed by BOTH id and reference, so either resolves. */
export async function fetchRecordCounts(
  recordType: RecordType,
  recordIds: string[],
): Promise<Record<string, number>> {
  if (recordIds.length === 0) return {};
  const res = await apiClient.get<Record<string, number>>(
    `/workspace/tasks/counts?recordType=${recordType}&recordIds=${encodeURIComponent(recordIds.join(','))}`,
    token(),
  );
  return res.data;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueAt?: string;
  links?: { recordType: RecordType; recordId: string }[];
}

export async function createTask(payload: CreateTaskPayload): Promise<WorkspaceTaskDetail> {
  const res = await apiClient.post<WorkspaceTaskDetail>('/workspace/tasks', payload, token());
  return res.data;
}

export async function updateTask(
  idOrRef: string,
  patch: Partial<Omit<CreateTaskPayload, 'links'>>,
): Promise<WorkspaceTaskDetail> {
  const res = await apiClient.patch<WorkspaceTaskDetail>(`/workspace/tasks/${idOrRef}`, patch, token());
  return res.data;
}

/** Replaces the whole set — an empty array unlinks everything. */
export async function setTaskLinks(
  idOrRef: string,
  links: { recordType: RecordType; recordId: string }[],
): Promise<WorkspaceTaskDetail> {
  const res = await apiClient.put<WorkspaceTaskDetail>(`/workspace/tasks/${idOrRef}/links`, { links }, token());
  return res.data;
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface PostMessagePayload {
  body: string;
  /** Exactly one anchor: a task, or a record. */
  taskId?: string;
  recordType?: RecordType;
  recordId?: string;
  parentMessageId?: string;
  /** Makes it an assigned comment on creation. */
  assigneeId?: string;
}

export async function fetchMessages(params: {
  taskId?: string;
  recordType?: RecordType;
  recordId?: string;
}): Promise<WorkspaceMessage[]> {
  const res = await apiClient.get<WorkspaceMessage[]>(
    `/workspace/messages${toQuery(params as TaskFilters)}`,
    token(),
  );
  return res.data;
}

export async function postMessage(payload: PostMessagePayload): Promise<WorkspaceMessage> {
  const res = await apiClient.post<WorkspaceMessage>('/workspace/messages', payload, token());
  return res.data;
}

export async function editMessage(id: string, body: string): Promise<WorkspaceMessage> {
  const res = await apiClient.patch<WorkspaceMessage>(`/workspace/messages/${id}`, { body }, token());
  return res.data;
}

export async function withdrawMessage(id: string): Promise<WorkspaceMessage> {
  const res = await apiClient.delete<WorkspaceMessage>(`/workspace/messages/${id}`, token());
  return res.data;
}

/** `null` clears the assignment. A mention is never an assignment. */
export async function assignMessage(id: string, assigneeId: string | null): Promise<WorkspaceMessage> {
  const res = await apiClient.put<WorkspaceMessage>(`/workspace/messages/${id}/assignee`, { assigneeId }, token());
  return res.data;
}

export async function setMessageResolved(id: string, resolved: boolean): Promise<WorkspaceMessage> {
  const res = await apiClient.post<WorkspaceMessage>(
    `/workspace/messages/${id}/${resolved ? 'resolve' : 'reopen'}`,
    {},
    token(),
  );
  return res.data;
}

// ── Inbox, notifications, record search ─────────────────────────────────────

export async function fetchInbox(): Promise<WorkspaceInbox> {
  const res = await apiClient.get<WorkspaceInbox>('/workspace/inbox', token());
  return res.data;
}

export async function fetchUnread(): Promise<{ unread: number }> {
  const res = await apiClient.get<{ unread: number }>('/workspace/unread', token());
  return res.data;
}

export async function fetchNotifications(): Promise<WorkspaceNotification[]> {
  const res = await apiClient.get<WorkspaceNotification[]>('/workspace/notifications', token());
  return res.data;
}

/** No ids means everything. Read state is server-side, never localStorage. */
export async function markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  const res = await apiClient.post<{ updated: number }>('/workspace/notifications/read', { ids }, token());
  return res.data;
}

/** The composer's `/` menu — one call across every record type. */
export async function searchRecords(q: string): Promise<RecordSummary[]> {
  if (q.trim().length < 2) return [];
  const res = await apiClient.get<RecordSummary[]>(
    `/workspace/records/search?q=${encodeURIComponent(q)}`,
    token(),
  );
  return res.data;
}
