/**
 * Workspace — the work layer.
 *
 * The domain modules answer "what happened?". Workspace answers "what does
 * somebody need to do about it?" Nothing in here owns or recomputes a domain
 * value; a task POINTS AT a shipment, a vehicle or an invoice.
 *
 * `RecordRaise` is the only export a domain page should need.
 */

export * from './contracts';

export {
  workspaceQueryKeys,
  useTasks, useTask, useTaskSummary, useRecordTaskCounts, useRecordSearch, useWorkspaceMessages,
  useWorkspaceInbox, useWorkspaceUnread, useWorkspaceNotifications,
  useCreateTask, useUpdateTask, useSetTaskLinks,
  usePostMessage, useEditMessage, useWithdrawMessage,
  useAssignMessage, useResolveMessage, useMarkNotificationsRead,
} from './api/queries';

export type { TaskFilters, TaskSummary, CreateTaskPayload, PostMessagePayload } from './api/workspaceService';

export { Composer } from './composer/Composer';
export { MessageBody } from './composer/MessageBody';
export { RecordChip } from './composer/RecordChip';
export { parseBody, serializeBody, serializeRecord, serializeUser, recordHref } from './composer/tokens';

export { RecordRaise } from './components/RecordRaise';
export { NotificationBell } from './components/NotificationBell';
export { RaiseTaskDialog } from './components/RaiseTaskDialog';
export { TaskList } from './components/TaskList';
export { Thread } from './components/Thread';
export { MessageRow } from './components/MessageRow';
export { TaskStatusBadge, TaskStatusSelect, PriorityMark, PrioritySelect, DueMark } from './components/TaskMarks';
