import { z } from 'zod';

/**
 * The wire contract, mirrored from `fleetin-backend/prisma/schema.prisma`.
 *
 * Types are derived with `z.infer` rather than hand-written, so a server field
 * that changes shape fails at the parse rather than three components later.
 */

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

/**
 * What a task can point at.
 *
 * No `CONTAINER`: a container is not a row in this system, it is
 * `Booking.containerNumber`. A container reference IS a booking reference, and
 * the container number is what the chip displays.
 */
export const RECORD_TYPES = [
  'SHIPMENT', 'BOOKING', 'VEHICLE', 'DRIVER', 'PARTNER',
  'SHIPPER', 'INVOICE', 'PAYOUT_HOLD', 'EMPTY_RETURN_CYCLE', 'EMPTY_RETURN_CHAIN',
] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const recordTypeSchema = z.enum(RECORD_TYPES);

export const personSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

export const taskLinkSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  recordType: recordTypeSchema,
  recordId: z.string(),
  /** The human reference — what the chip shows. */
  recordRef: z.string(),
  label: z.string().nullable(),
  /** The record's LIVE status, resolved on every read so it cannot go stale. */
  status: z.string().nullable().optional(),
  /** A booking's shipment reference — what lets the chip open its sheet. */
  parentRef: z.string().nullable().optional(),
  /** The record has been deleted since. The chip stops being a link. */
  missing: z.boolean().optional(),
});

export const taskEventSchema = z.object({
  id: z.string(),
  kind: z.string(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  createdAt: z.string(),
  actor: personSchema.nullable(),
});

export const messageSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  recordType: recordTypeSchema.nullable(),
  recordId: z.string().nullable(),
  recordRef: z.string().nullable(),
  /** Stored with `@[user:…]` / `@[shipment:…]` tokens intact. */
  body: z.string(),
  author: personSchema,
  parentMessageId: z.string().nullable(),
  /** Set makes this an *assigned comment* — the light unit of accountability. */
  assignee: personSchema.nullable().optional(),
  assignedBy: personSchema.nullable().optional(),
  assignedAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  resolvedBy: personSchema.nullable().optional(),
  mentions: z.array(z.object({ userId: z.string() })).default([]),
  /**
   * Every record this message's body names, resolved live on read.
   *
   * Lets a chip in a message wear the same status colour a chip on a task
   * does — the token in the body only carries a type and a reference.
   */
  references: z
    .array(z.object({
      type: recordTypeSchema,
      id: z.string(),
      reference: z.string(),
      subtitle: z.string().nullable(),
      status: z.string().nullable().optional(),
      parentRef: z.string().nullable().optional(),
    }))
    .default([]),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export const taskSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  assignee: personSchema.nullable(),
  createdBy: personSchema,
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  links: z.array(taskLinkSchema).default([]),
  /**
   * The complaint this task answers. Null on internal work, which is most of
   * the board — and the difference is the whole point of carrying it: a row
   * with a ticket has somebody outside Fleetin waiting on it.
   */
  ticket: z
    .object({ id: z.string(), reference: z.string(), subject: z.string() })
    .nullable()
    .default(null),
});

/* ── Phase 3 ─────────────────────────────────────────────────────────────── */

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const checklistItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  text: z.string(),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  position: z.number(),
  doneBy: personSchema.nullable().optional(),
});

export const followerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: personSchema,
});

export const workloadSchema = z.object({
  rows: z.array(z.object({
    person: personSchema,
    open: z.number(),
    overdue: z.number(),
    dueThisWeek: z.number(),
    urgent: z.number(),
  })),
  unassigned: z.number(),
});

export const taskDetailSchema = taskSchema.extend({
  messages: z.array(messageSchema).default([]),
  events: z.array(taskEventSchema).default([]),
  checklist: z.array(checklistItemSchema).default([]),
  followers: z.array(followerSchema).default([]),
});

export const taskPageSchema = z.object({
  items: z.array(taskSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  pageCount: z.number(),
});

/** One row in the composer's `/` menu. */
export const recordSummarySchema = z.object({
  type: recordTypeSchema,
  id: z.string(),
  reference: z.string(),
  subtitle: z.string().nullable(),
  status: z.string().nullable().optional(),
  parentRef: z.string().nullable().optional(),
});

export const CHANNEL_KINDS = ['CHANNEL', 'DIRECT'] as const;
export const channelKindSchema = z.enum(CHANNEL_KINDS);

/** One row in the conversation rail. */
export const conversationSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: channelKindSchema,
  /** A DM is named by whoever you are talking to — the server resolves that. */
  name: z.string(),
  topic: z.string().nullable(),
  isPrivate: z.boolean(),
  memberCount: z.number(),
  members: z.array(personSchema).default([]),
  /** The other person, on a DM. Null on a channel. */
  counterpart: personSchema.nullable(),
  lastReadAt: z.string().nullable(),
  muted: z.boolean(),
  /** Everything since `lastReadAt` that somebody else wrote. */
  unread: z.number(),
  /** Of those, the ones that name you. Coloured differently, deliberately. */
  mentions: z.number(),
  lastMessage: z
    .object({ body: z.string(), createdAt: z.string(), author: z.string() })
    .nullable(),
});

export const channelSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: channelKindSchema,
  name: z.string(),
  topic: z.string().nullable(),
  isPrivate: z.boolean(),
  counterpart: personSchema.nullable(),
  members: z.array(z.object({ userId: z.string(), role: z.string(), user: personSchema })).default([]),
});

/** A channel message carries a reply count; a task comment does not. */
export const channelMessageSchema = messageSchema.extend({
  channelId: z.string().nullable().optional(),
  _count: z.object({ replies: z.number() }).optional(),
});

export const messagePageSchema = z.object({
  items: z.array(channelMessageSchema),
  hasMore: z.boolean(),
  nextBefore: z.string().nullable(),
});

export const threadSchema = z.object({
  parent: channelMessageSchema,
  replies: z.array(channelMessageSchema),
});

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  actor: personSchema.nullable(),
  task: z.object({ id: z.string(), reference: z.string(), title: z.string(), status: taskStatusSchema }).nullable(),
  message: z.object({
    id: z.string(), body: z.string(), taskId: z.string().nullable(),
    recordType: recordTypeSchema.nullable(), recordRef: z.string().nullable(),
  }).nullable(),
});

export const inboxSchema = z.object({
  tasks: z.array(taskSchema),
  assignedComments: z.array(
    messageSchema.extend({
      task: z.object({ id: z.string(), reference: z.string(), title: z.string() }).nullable(),
    }),
  ),
  notifications: z.array(notificationSchema),
  counts: z.object({
    tasks: z.number(),
    assignedComments: z.number(),
    unread: z.number(),
    overdue: z.number(),
  }),
});

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type RecordType = z.infer<typeof recordTypeSchema>;
export type WorkspacePerson = z.infer<typeof personSchema>;
export type TaskLink = z.infer<typeof taskLinkSchema>;
export type TaskEvent = z.infer<typeof taskEventSchema>;
export type WorkspaceMessage = z.infer<typeof messageSchema>;
export type WorkspaceTask = z.infer<typeof taskSchema>;
export type WorkspaceTaskDetail = z.infer<typeof taskDetailSchema>;
export type TaskPage = z.infer<typeof taskPageSchema>;
export type RecordSummary = z.infer<typeof recordSummarySchema>;
export type WorkspaceNotification = z.infer<typeof notificationSchema>;
export type WorkspaceInbox = z.infer<typeof inboxSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type TaskFollower = z.infer<typeof followerSchema>;
export type Workload = z.infer<typeof workloadSchema>;

export type ChannelKind = z.infer<typeof channelKindSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type WorkspaceChannel = z.infer<typeof channelSchema>;
export type ChannelMessage = z.infer<typeof channelMessageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type MessageThread = z.infer<typeof threadSchema>;

// ── Display vocabulary ──────────────────────────────────────────────────────
//
// One place, because the same words appear in the Select, the badge, the
// filter bar and the event rail — and a status that reads "IN_PROGRESS" in one
// of them is the kind of thing nobody notices until a customer does.

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  /** "Waiting", not "Blocked" — the word the desk already uses. */
  WAITING: 'Waiting',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  SHIPMENT: 'Shipment',
  BOOKING: 'Booking',
  VEHICLE: 'Vehicle',
  DRIVER: 'Driver',
  PARTNER: 'Transporter',
  SHIPPER: 'Shipper',
  INVOICE: 'Invoice',
  PAYOUT_HOLD: 'Hold',
  EMPTY_RETURN_CYCLE: 'Empty return',
  EMPTY_RETURN_CHAIN: 'Chain',
};

/** A task is closed when it is Completed or Cancelled — nothing else counts. */
export const CLOSED_STATUSES: readonly TaskStatus[] = ['COMPLETED', 'CANCELLED'];

export function isTaskClosed(status: TaskStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export function isOverdue(task: Pick<WorkspaceTask, 'dueAt' | 'status'>): boolean {
  if (!task.dueAt || isTaskClosed(task.status)) return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

/* ── Tickets ─────────────────────────────────────────────────────────────── */

/**
 * How the problem reached us — worth recording because it is the first thing
 * asked when a ticket is disputed later.
 */
export const TICKET_CHANNELS = ['PHONE', 'EMAIL', 'WHATSAPP', 'IN_PERSON', 'PORTAL'] as const;
export const ticketChannelSchema = z.enum(TICKET_CHANNELS);

/**
 * A problem somebody outside Fleetin reported.
 *
 * It shares the task's status and priority ladders rather than owning its own:
 * a ticket with a task takes that task's status, and two vocabularies for one
 * state is how a customer ends up being told "OPEN" about work that finished
 * last week.
 */
export const ticketSchema = z.object({
  id: z.string(),
  reference: z.string(),
  subject: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  channel: ticketChannelSchema,
  reporterName: z.string().nullable(),
  reporterContact: z.string().nullable(),
  /** What the complaint is about, in the task links' own vocabulary. */
  recordType: recordTypeSchema.nullable(),
  recordId: z.string().nullable(),
  recordRef: z.string().nullable(),
  recordLabel: z.string().nullable(),
  /** Resolved live on every read, so a chip never wears a stale colour. */
  recordStatus: z.string().nullable().optional(),
  recordParentRef: z.string().nullable().optional(),
  recordMissing: z.boolean().optional(),
  /** The work raised to answer it. Null until somebody is given the job. */
  task: z
    .object({
      id: z.string(),
      reference: z.string(),
      title: z.string(),
      status: taskStatusSchema,
      priority: taskPrioritySchema,
      dueAt: z.string().nullable(),
      assignee: personSchema.nullable(),
    })
    .nullable(),
  openedBy: personSchema,
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ticketPageSchema = z.object({
  items: z.array(ticketSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  pageCount: z.number(),
});

export const ticketSummarySchema = z.object({
  /** The ones whose task is on my desk. */
  mine: z.number(),
  open: z.number(),
  unassigned: z.number(),
  closed: z.number(),
  all: z.number(),
  urgent: z.number(),
});

export type WorkspaceTicket = z.infer<typeof ticketSchema>;
export type TicketPage = z.infer<typeof ticketPageSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketChannel = z.infer<typeof ticketChannelSchema>;

/** The words the UI uses for a channel. */
export const TICKET_CHANNEL_LABEL: Record<TicketChannel, string> = {
  PHONE: 'Phone',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  IN_PERSON: 'In person',
  PORTAL: 'Portal',
};

/**
 * A ticket's own words for the shared status ladder.
 *
 * The same five states a task has, said the way a customer-facing record says
 * them: a task is COMPLETED, a complaint is *Resolved*. One enum underneath,
 * because two enums is how a ticket ends up saying OPEN about work that
 * finished last week — but the reader of a ticket is answering a person, not
 * closing a job, and "Completed" is the wrong word for that.
 */
export const TICKET_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  COMPLETED: 'Resolved',
  CANCELLED: 'Cancelled',
};

/**
 * And its words for priority.
 *
 * Same enum as a task's, same reasoning: `NORMAL` reads as *Medium* and
 * `URGENT` as *Critical* on a ticket, which is the vocabulary a support queue
 * uses. The task keeps its own words — nothing about the board changed.
 */
export const TICKET_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Medium',
  HIGH: 'High',
  URGENT: 'Critical',
};

/** The order the radios are drawn in, least to most urgent. */
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
