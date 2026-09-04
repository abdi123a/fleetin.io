import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useRef } from 'react';

import type { RecordType } from '../contracts';
import {
  assignMessage, createTask, editMessage, fetchInbox, fetchMessages, fetchNotifications,
  fetchRecordCounts, fetchTask, fetchTasks, fetchTaskSummary, fetchUnread, markNotificationsRead, postMessage,
  searchRecords, setMessageResolved, setTaskLinks, updateTask, withdrawMessage,
  createChannel, deleteChannel, fetchChannel, fetchChannelMessages, fetchConversations, fetchThread,
  markChannelRead, openDirectMessage, searchMessages, setChannelMembers, updateChannel, bulkUpdateTasks, fetchWorkload, setChecklist,
  setFollowers, setOwnFollow, toggleChecklistItem, type BulkPayload, type ChecklistDraft, type CreateChannelPayload, type CreateTaskPayload, type MessageSearchFilters, type PostMessagePayload, type TaskFilters } from './workspaceService';

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
  conversations: () => [...workspaceQueryKeys.all, 'conversations'] as const,
  channel: (id: string) => [...workspaceQueryKeys.all, 'channel', id] as const,
  channelMessages: (id: string) => [...workspaceQueryKeys.all, 'channel', id, 'messages'] as const,
  thread: (id: string) => [...workspaceQueryKeys.all, 'thread', id] as const,
  messageSearch: (filters: MessageSearchFilters) => [...workspaceQueryKeys.all, 'message-search', filters] as const,
  templates: () => [...workspaceQueryKeys.all, 'templates'] as const,
  recurrences: () => [...workspaceQueryKeys.all, 'recurrences'] as const,
  workload: () => [...workspaceQueryKeys.all, 'workload'] as const,
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
/* A conversation somebody is looking at needs to feel live; the rail behind it
   does not. Both still pause in a hidden tab. */
const POLL_OPEN_CONVERSATION = 8_000;
const POLL_RAIL = 45_000;

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

export function useWorkspaceInbox(enabled = true) {
  return useQuery({
    queryKey: workspaceQueryKeys.inbox(),
    queryFn: fetchInbox,
    enabled,
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

// ── Channels & direct messages (Phase 2) ────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: workspaceQueryKeys.conversations(),
    queryFn: fetchConversations,
    refetchInterval: POLL_RAIL,
  });
}

export function useChannel(id: string | undefined) {
  return useQuery({
    queryKey: workspaceQueryKeys.channel(id ?? ''),
    queryFn: () => fetchChannel(id ?? ''),
    enabled: Boolean(id),
  });
}

/**
 * The open conversation's river.
 *
 * Polls faster than anything else in the app, and only while the tab is
 * visible — TanStack pauses `refetchInterval` in a hidden tab by default, which
 * is what makes an 8s interval safe when operators keep many tabs open.
 *
 * This is the seam a websocket would replace: swap the interval for a
 * subscription that invalidates this key, and no component changes.
 */
export function useChannelMessages(channelId: string | undefined) {
  return useQuery({
    queryKey: workspaceQueryKeys.channelMessages(channelId ?? ''),
    queryFn: () => fetchChannelMessages(channelId ?? ''),
    enabled: Boolean(channelId),
    refetchInterval: POLL_OPEN_CONVERSATION,
  });
}

export function useThread(messageId: string | undefined) {
  return useQuery({
    queryKey: workspaceQueryKeys.thread(messageId ?? ''),
    queryFn: () => fetchThread(messageId ?? ''),
    enabled: Boolean(messageId),
    refetchInterval: POLL_OPEN_CONVERSATION,
  });
}

export function useMessageSearch(filters: MessageSearchFilters, enabled = true) {
  return useQuery({
    queryKey: workspaceQueryKeys.messageSearch(filters),
    queryFn: () => searchMessages(filters),
    enabled: enabled && Boolean(filters.q?.trim()),
    staleTime: 30_000,
  });
}

export function useCreateChannel() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (p: CreateChannelPayload) => createChannel(p), onSuccess: invalidate });
}

export function useUpdateChannel() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; topic?: string; isPrivate?: boolean } }) =>
      updateChannel(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteChannel() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (id: string) => deleteChannel(id), onSuccess: invalidate });
}

export function useSetChannelMembers() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ id, memberIds }: { id: string; memberIds: string[] }) => setChannelMembers(id, memberIds),
    onSuccess: invalidate,
  });
}

export function useOpenDirectMessage() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (userId: string) => openDirectMessage(userId), onSuccess: invalidate });
}

/**
 * Marks the open conversation read — once on open, and again whenever new
 * messages land while it is on screen.
 *
 * Without the second half, a room somebody is sitting in keeps accruing an
 * unread badge they can already see, which is the fastest way to make the
 * number meaningless.
 */
export function useMarkChannelReadOnView(channelId: string | undefined, newestMessageId: string | undefined) {
  const queryClient = useQueryClient();
  const lastMarked = useRef<string | null>(null);

  useEffect(() => {
    if (!channelId || !newestMessageId) return;
    const key = `${channelId}:${newestMessageId}`;
    if (lastMarked.current === key) return;
    lastMarked.current = key;

    void markChannelRead(channelId).then(() => {
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.unread() });
    });
  }, [channelId, newestMessageId, queryClient]);
}

// ── Productivity (Phase 3) ──────────────────────────────────────────────────



export function useWorkload() {
  return useQuery({
    queryKey: workspaceQueryKeys.workload(),
    queryFn: fetchWorkload,
    refetchInterval: POLL_LIST,
  });
}

export function useSetChecklist() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ taskRef, items }: { taskRef: string; items: ChecklistDraft[] }) => setChecklist(taskRef, items),
    onSuccess: invalidate,
  });
}

export function useToggleChecklistItem() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) => toggleChecklistItem(itemId, done),
    onSuccess: invalidate,
  });
}

export function useSetFollowers() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ taskRef, userIds }: { taskRef: string; userIds: string[] }) => setFollowers(taskRef, userIds),
    onSuccess: invalidate,
  });
}

export function useSetOwnFollow() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({ taskRef, follow }: { taskRef: string; follow: boolean }) => setOwnFollow(taskRef, follow),
    onSuccess: invalidate,
  });
}








export function useBulkUpdateTasks() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({ mutationFn: (p: BulkPayload) => bulkUpdateTasks(p), onSuccess: invalidate });
}
