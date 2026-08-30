import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RecordType } from '../contracts';
import {
  assignMessage, createTask, editMessage, fetchInbox, fetchMessages, fetchNotifications,
  fetchRecordCounts, fetchTask, fetchTasks, fetchTaskSummary, fetchUnread, markNotificationsRead, postMessage,
  searchRecords, setMessageResolved, setTaskLinks, updateTask, withdrawMessage,
  type CreateTaskPayload, type PostMessagePayload, type TaskFilters,
} from './workspaceService';

export const workspaceQueryKeys = {
  all: ['workspace'] as const,
  tasks: () => [...workspaceQueryKeys.all, 'tasks'] as const,
  taskList: (filters: TaskFilters) => [...workspaceQueryKeys.tasks(), filters] as const,
  taskSummary: (filters: TaskFilters) => [...workspaceQueryKeys.tasks(), 'summary', filters] as const,
  task: (idOrRef: string) => [...workspaceQueryKeys.tasks(), 'detail', idOrRef] as const,
  counts: (type: RecordType, ids: string[]) =>
    [...workspaceQueryKeys.all, 'counts', type, [...ids].sort().join(',')] as const,
  messages: (anchor: Record<string, unknown>) => [...workspaceQueryKeys.all, 'messages', anchor] as const,
  inbox: () => [...workspaceQueryKeys.all, 'inbox'] as const,
  unread: () => [...workspaceQueryKeys.all, 'unread'] as const,
  notifications: () => [...workspaceQueryKeys.all, 'notifications'] as const,
  recordSearch: (q: string) => [...workspaceQueryKeys.all, 'records', q] as const,
};

/*
 * Polling — the first in this application, and deliberately modest.
 *
 * `refetchOnWindowFocus` is off globally because operators keep many tabs
 * open; polling every one of them would multiply the same way. What makes this
 * safe is that TanStack pauses `refetchInterval` in a hidden tab by default
 * (`refetchIntervalInBackground` stays false), so eight background tabs cost
 * nothing and only the one being looked at asks.
 */
const POLL_UNREAD = 60_000;
const POLL_LIST = 30_000;

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: workspaceQueryKeys.taskList(filters),
    queryFn: () => fetchTasks(filters),
    refetchInterval: POLL_LIST,
  });
}

export function useTaskSummary(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: workspaceQueryKeys.taskSummary(filters),
    queryFn: () => fetchTaskSummary(filters),
    refetchInterval: POLL_LIST,
  });
}

export function useTask(idOrRef: string | undefined) {
  return useQuery({
    queryKey: workspaceQueryKeys.task(idOrRef ?? ''),
    /* `enabled` below means this never runs with an empty reference; the
       fallback keeps that a type fact rather than a comment. */
    queryFn: () => fetchTask(idOrRef ?? ''),
    enabled: Boolean(idOrRef),
    refetchInterval: POLL_LIST,
  });
}

/** The number beside a Raise button. One query per page, never one per card. */
export function useRecordTaskCounts(recordType: RecordType, recordIds: string[]) {
  return useQuery({
    queryKey: workspaceQueryKeys.counts(recordType, recordIds),
    queryFn: () => fetchRecordCounts(recordType, recordIds),
    enabled: recordIds.length > 0,
    staleTime: 30_000,
  });
}

export function useWorkspaceInbox() {
  return useQuery({
    queryKey: workspaceQueryKeys.inbox(),
    queryFn: fetchInbox,
    refetchInterval: POLL_LIST,
  });
}

export function useWorkspaceUnread(enabled = true) {
  return useQuery({
    queryKey: workspaceQueryKeys.unread(),
    queryFn: fetchUnread,
    enabled,
    refetchInterval: POLL_UNREAD,
  });
}

export function useWorkspaceNotifications(enabled = true) {
  return useQuery({
    queryKey: workspaceQueryKeys.notifications(),
    queryFn: fetchNotifications,
    enabled,
  });
}

export function useWorkspaceMessages(anchor: {
  taskId?: string;
  recordType?: RecordType;
  recordId?: string;
}) {
  const ready = Boolean(anchor.taskId || (anchor.recordType && anchor.recordId));
  return useQuery({
    queryKey: workspaceQueryKeys.messages(anchor),
    queryFn: () => fetchMessages(anchor),
    enabled: ready,
  });
}

/**
 * The `/` menu's source.
 *
 * `staleTime: Infinity` because a query string maps to the same answer for the
 * length of a typing session, and the menu re-queries on every keystroke.
 */
export function useRecordSearch(q: string) {
  return useQuery({
    queryKey: workspaceQueryKeys.recordSearch(q),
    queryFn: () => searchRecords(q),
    enabled: q.trim().length >= 2,
    staleTime: Infinity,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────
//
// Every one invalidates the whole `workspace` prefix. That is blunt on purpose:
// a task edit changes the list, the detail, the record count beside a Raise
// button and possibly somebody's inbox, and enumerating which of those four to
// touch per mutation is how a stale badge ships.

function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
}

export function useCreateTask() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ idOrRef, patch }: { idOrRef: string; patch: Partial<Omit<CreateTaskPayload, 'links'>> }) =>
      updateTask(idOrRef, patch),
    onSuccess: invalidate,
  });
}

export function useSetTaskLinks() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ idOrRef, links }: { idOrRef: string; links: { recordType: RecordType; recordId: string }[] }) =>
      setTaskLinks(idOrRef, links),
    onSuccess: invalidate,
  });
}

export function usePostMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (payload: PostMessagePayload) => postMessage(payload),
    onSuccess: invalidate,
  });
}

export function useEditMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => editMessage(id, body),
    onSuccess: invalidate,
  });
}

export function useWithdrawMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (id: string) => withdrawMessage(id), onSuccess: invalidate });
}

/** The assigned comment. Separate from mentioning somebody, always. */
export function useAssignMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => assignMessage(id, assigneeId),
    onSuccess: invalidate,
  });
}

export function useResolveMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => setMessageResolved(id, resolved),
    onSuccess: invalidate,
  });
}

export function useMarkNotificationsRead() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (ids?: string[]) => markNotificationsRead(ids), onSuccess: invalidate });
}
