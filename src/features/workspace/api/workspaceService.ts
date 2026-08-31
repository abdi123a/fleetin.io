import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';

import type {
  ChecklistItem, Conversation, MessagePage, MessageThread, RecordSummary, RecordType,
  RecurrenceFrequency, TaskFollower, TaskPage, TaskPriority, TaskRecurrence, TaskStatus,
  TaskTemplate, Workload, WorkspaceChannel, WorkspaceInbox, WorkspaceMessage,
  WorkspaceNotification, WorkspaceTaskDetail,
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
  /** Tasks this person watches without owning — the Phase 3 follower filter. */
  followerId?: string;
  createdFrom?: string;
  createdTo?: string;
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

/** One number per band in the task list's single filter row. */
export interface TaskSummary {
  all: number;
  open: number;
  overdue: number;
  today: number;
  unassigned: number;
  urgent: number;
  following: number;
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
  /** Exactly one anchor: a task, a channel, or a record. */
  taskId?: string;
  channelId?: string;
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

// ── Channels & direct messages (Phase 2) ────────────────────────────────────

/** The rail: my rooms, with unread and mention counts already counted server-side. */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await apiClient.get<Conversation[]>('/workspace/channels', token());
  return res.data;
}

export async function fetchChannel(id: string): Promise<WorkspaceChannel> {
  const res = await apiClient.get<WorkspaceChannel>(`/workspace/channels/${id}`, token());
  return res.data;
}

/** Cursor-paginated on `before` — a river grows at the end while you read back. */
export async function fetchChannelMessages(
  channelId: string,
  params: { before?: string; limit?: number } = {},
): Promise<MessagePage> {
  const res = await apiClient.get<MessagePage>(
    `/workspace/channels/${channelId}/messages${toQuery(params as TaskFilters)}`,
    token(),
  );
  return res.data;
}

export async function fetchThread(messageId: string): Promise<MessageThread> {
  const res = await apiClient.get<MessageThread>(`/workspace/messages/${messageId}/thread`, token());
  return res.data;
}

export interface CreateChannelPayload {
  name: string;
  topic?: string;
  isPrivate?: boolean;
  memberIds?: string[];
}

export async function createChannel(payload: CreateChannelPayload): Promise<WorkspaceChannel> {
  const res = await apiClient.post<WorkspaceChannel>('/workspace/channels', payload, token());
  return res.data;
}

export async function updateChannel(
  id: string,
  patch: { name?: string; topic?: string; isPrivate?: boolean },
): Promise<WorkspaceChannel> {
  const res = await apiClient.patch<WorkspaceChannel>(`/workspace/channels/${id}`, patch, token());
  return res.data;
}

export async function setChannelMembers(id: string, memberIds: string[]): Promise<WorkspaceChannel> {
  const res = await apiClient.put<WorkspaceChannel>(`/workspace/channels/${id}/members`, { memberIds }, token());
  return res.data;
}

/** Find-or-create. The server keys DMs deterministically, so this is safe to spam. */
export async function openDirectMessage(userId: string): Promise<WorkspaceChannel> {
  const res = await apiClient.get<WorkspaceChannel>(`/workspace/channels/direct/${userId}`, token());
  return res.data;
}

/** Server-side read state — never localStorage, so a refresh keeps it. */
export async function markChannelRead(channelId: string): Promise<{ ok: boolean }> {
  const res = await apiClient.post<{ ok: boolean }>(`/workspace/channels/${channelId}/read`, {}, token());
  return res.data;
}

export interface MessageSearchFilters {
  q?: string;
  channelId?: string;
  authorId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Searching `609196` finds messages that merely reference that booking. */
export async function searchMessages(filters: MessageSearchFilters): Promise<WorkspaceMessage[]> {
  const res = await apiClient.get<WorkspaceMessage[]>(
    `/workspace/messages/search${toQuery(filters as TaskFilters)}`,
    token(),
  );
  return res.data;
}

// ── Productivity (Phase 3) ──────────────────────────────────────────────────

export interface ChecklistDraft {
  /** Absent for a new line. */
  id?: string;
  text: string;
  done?: boolean;
}

/** Replaces the whole list, in order. Existing ids keep their tick. */
export async function setChecklist(taskRef: string, items: ChecklistDraft[]): Promise<ChecklistItem[]> {
  const res = await apiClient.put<ChecklistItem[]>(`/workspace/tasks/${taskRef}/checklist`, { items }, token());
  return res.data;
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ChecklistItem> {
  const res = await apiClient.patch<ChecklistItem>(`/workspace/checklist/${itemId}`, { done }, token());
  return res.data;
}

export async function setFollowers(taskRef: string, userIds: string[]): Promise<TaskFollower[]> {
  const res = await apiClient.put<TaskFollower[]>(`/workspace/tasks/${taskRef}/followers`, { userIds }, token());
  return res.data;
}

/** Follow or unfollow yourself — updates without owning it. */
export async function setOwnFollow(taskRef: string, follow: boolean): Promise<TaskFollower[]> {
  const path = `/workspace/tasks/${taskRef}/follow`;
  const res = follow
    ? await apiClient.post<TaskFollower[]>(path, {}, token())
    : await apiClient.delete<TaskFollower[]>(path, token());
  return res.data;
}

export async function fetchTemplates(): Promise<TaskTemplate[]> {
  const res = await apiClient.get<TaskTemplate[]>('/workspace/templates', token());
  return res.data;
}

export interface CreateTemplatePayload {
  name: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueInDays?: number;
  items?: { text: string }[];
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<TaskTemplate> {
  const res = await apiClient.post<TaskTemplate>('/workspace/templates', payload, token());
  return res.data;
}

export async function archiveTemplate(id: string): Promise<TaskTemplate> {
  const res = await apiClient.delete<TaskTemplate>(`/workspace/templates/${id}`, token());
  return res.data;
}

export interface UseTemplatePayload {
  assigneeId?: string;
  recordType?: RecordType;
  recordId?: string;
}

/* `applyTemplate`, not `useTemplate`: a plain function whose name starts with
   "use" is read as a React hook by the rules-of-hooks lint, which then refuses
   the `mutationFn` that calls it. */
export async function applyTemplate(id: string, payload: UseTemplatePayload = {}): Promise<WorkspaceTaskDetail> {
  const res = await apiClient.post<WorkspaceTaskDetail>(`/workspace/templates/${id}/use`, payload, token());
  return res.data;
}

export async function fetchRecurrences(): Promise<TaskRecurrence[]> {
  const res = await apiClient.get<TaskRecurrence[]>('/workspace/recurrences', token());
  return res.data;
}

export interface RecurrencePayload {
  title: string;
  description?: string;
  templateId?: string;
  frequency: RecurrenceFrequency;
  interval?: number;
  weekday?: number;
  dayOfMonth?: number;
  priority?: TaskPriority;
  assigneeId?: string;
  startOn?: string;
  enabled?: boolean;
}

export async function createRecurrence(payload: RecurrencePayload): Promise<TaskRecurrence> {
  const res = await apiClient.post<TaskRecurrence>('/workspace/recurrences', payload, token());
  return res.data;
}

export async function updateRecurrence(id: string, patch: Partial<RecurrencePayload>): Promise<TaskRecurrence> {
  const res = await apiClient.patch<TaskRecurrence>(`/workspace/recurrences/${id}`, patch, token());
  return res.data;
}

export async function deleteRecurrence(id: string): Promise<void> {
  await apiClient.delete(`/workspace/recurrences/${id}`, token());
}

/** Safe to call twice — the occurrence index refuses a duplicate. */
export async function runRecurrences(): Promise<{ generated: number; skipped: number }> {
  const res = await apiClient.post<{ generated: number; skipped: number }>('/workspace/recurrences/run', {}, token());
  return res.data;
}

export interface BulkPayload {
  taskIds: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueAt?: string;
}

/** Rows the caller may not edit come back as `skipped`, not as a refusal. */
export async function bulkUpdateTasks(payload: BulkPayload): Promise<{ updated: number; skipped: number }> {
  const res = await apiClient.post<{ updated: number; skipped: number }>('/workspace/tasks/bulk', payload, token());
  return res.data;
}

export async function fetchWorkload(): Promise<Workload> {
  const res = await apiClient.get<Workload>('/workspace/workload', token());
  return res.data;
}
