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
  useConversations, useChannel, useChannelMessages, useThread, useMessageSearch,
  useCreateChannel, useUpdateChannel, useSetChannelMembers, useOpenDirectMessage,
  useMarkChannelReadOnView,
  usePostMessage, useEditMessage, useWithdrawMessage,
  useAssignMessage, useResolveMessage, useMarkNotificationsRead,
  // Phase 3
  useSetChecklist, useToggleChecklistItem, useSetFollowers, useSetOwnFollow,
  useBulkUpdateTasks, useWorkload,
} from './api/queries';

export type { TaskFilters, TaskSummary, CreateTaskPayload, PostMessagePayload } from './api/workspaceService';

export { Composer } from './composer/Composer';
export { MessageBody } from './composer/MessageBody';
export { RecordChip } from './composer/RecordChip';
export { parseBody, serializeBody, serializeRecord, serializeUser, recordHref } from './composer/tokens';

export { RecordRaise } from './components/RecordRaise';
export { NotificationBell } from './components/NotificationBell';

// Phase 2 — messaging
export { ConversationRail } from './messaging/ConversationRail';
export { ChannelHeader } from './messaging/ChannelHeader';
export { ChannelMessageList } from './messaging/ChannelMessageList';
export { ThreadPanel } from './messaging/ThreadPanel';
export { CreateChannelDialog, StartDirectDialog, ChannelMembersDialog } from './messaging/ChannelDialogs';
export { RaiseTaskDialog } from './components/RaiseTaskDialog';
export { TaskList } from './components/TaskList';
export { Thread } from './components/Thread';
export { MessageRow } from './components/MessageRow';
export { TaskStatusBadge, TaskStatusSelect, PriorityMark, PrioritySelect, DueMark } from './components/TaskMarks';
export { PersonAvatar } from './components/PersonAvatar';

// Phase 3 — productivity
export { TaskChecklist } from './components/TaskChecklist';
export { TaskFollowers } from './components/TaskFollowers';
export { BulkActionBar } from './components/BulkActionBar';
export { TaskBoard } from './views/TaskBoard';
export { TaskWorkload } from './views/TaskWorkload';
export { taskUrgency } from './components/taskUrgency';
export { TicketList } from './components/TicketList';
export { RecordTickets } from './components/RecordTickets';
export { TicketPriorityBadge, TicketAge } from './components/TicketMarks';
export { TicketActivity } from './components/TicketActivity';
export { TicketStatusHistory } from './components/TicketStatusHistory';
export { LogTicketDialog } from './components/LogTicketDialog';
export { RaiseFromTicketDialog } from './components/RaiseFromTicketDialog';
export { RecordPicker, type PickedRecord } from './components/RecordPicker';
export {
  useTickets,
  useTicket,
  useTicketSummary,
  useCreateTicket,
  useUpdateTicket,
  useRaiseTicketTask,
  useDeleteTicket,
} from './api/ticketQueries';
