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
});

export const taskDetailSchema = taskSchema.extend({
  messages: z.array(messageSchema).default([]),
  events: z.array(taskEventSchema).default([]),
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
