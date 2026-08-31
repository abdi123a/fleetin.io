import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma, WorkspaceNotificationKind, WorkspaceRecordType,
  WorkspaceTaskEventKind, WorkspaceTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  BulkTaskDto, CreateRecurrenceDto, CreateTemplateDto, SetChecklistDto,
  SetFollowersDto, ToggleChecklistItemDto, UpdateRecurrenceDto, UseTemplateDto,
} from './dto/productivity.dto';
import { WorkspaceNotificationsService } from './notifications.service';
import { RecordAccessService } from './record-access.service';
import { nextOccurrence, toDay } from './recurrence.util';

const PERSON = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

@Injectable()
export class ProductivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordAccessService,
    private readonly notifications: WorkspaceNotificationsService,
  ) {}

  // ── Checklist ─────────────────────────────────────────────────────────────

  /**
   * Replace the whole list, in order.
   *
   * Whole-set rather than per-item CRUD because reordering is the common edit
   * and it touches every row anyway — the same reason
   * `PUT /shipments/:id/assignees` works this way. Existing items keep their
   * id, so a tick survives a reorder.
   */
  async setChecklist(taskId: string, dto: SetChecklistDto, user: AuthenticatedUser) {
    const task = await this.findTask(taskId);
    const keptIds = dto.items.map((i) => i.id).filter((id): id is string => Boolean(id));
    /* A kept item's `update` deliberately writes only text and position, so a
       tick survives a reorder without the client having to send `done` back. */
    const added = dto.items.filter((i) => !i.id).length;

    await this.prisma.$transaction([
      this.prisma.workspaceTaskChecklistItem.deleteMany({
        where: { taskId: task.id, id: { notIn: keptIds.length ? keptIds : ['-'] } },
      }),
      ...dto.items.map((item, position) =>
        item.id
          ? this.prisma.workspaceTaskChecklistItem.update({
              where: { id: item.id },
              data: { text: item.text, position },
            })
          : this.prisma.workspaceTaskChecklistItem.create({
              data: { taskId: task.id, text: item.text, done: item.done ?? false, position },
            }),
      ),
    ]);

    if (added > 0) {
      await this.writeEvent(task.id, user.id, WorkspaceTaskEventKind.CHECKLIST_ADDED, null, String(added));
    }
    return this.checklistFor(task.id);
  }

  /** Tick one box. Its own endpoint because it is the thing people do most. */
  async toggleChecklistItem(itemId: string, dto: ToggleChecklistItemDto, user: AuthenticatedUser) {
    const item = await this.prisma.workspaceTaskChecklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Checklist item "${itemId}" not found`);

    const updated = await this.prisma.workspaceTaskChecklistItem.update({
      where: { id: itemId },
      data: {
        done: dto.done,
        doneAt: dto.done ? new Date() : null,
        doneById: dto.done ? user.id : null,
      },
    });

    await this.writeEvent(
      item.taskId,
      user.id,
      dto.done ? WorkspaceTaskEventKind.CHECKLIST_DONE : WorkspaceTaskEventKind.CHECKLIST_REOPENED,
      null,
      item.text,
    );
    return updated;
  }

  private checklistFor(taskId: string) {
    return this.prisma.workspaceTaskChecklistItem.findMany({
      where: { taskId },
      orderBy: { position: 'asc' },
      include: { doneBy: { select: PERSON } },
    });
  }

  // ── Followers ─────────────────────────────────────────────────────────────

  async setFollowers(taskId: string, dto: SetFollowersDto, user: AuthenticatedUser) {
    const task = await this.findTask(taskId);
    const internal = await this.internalOnly([...new Set(dto.userIds)]);
    const existing = await this.prisma.workspaceTaskFollower.findMany({
      where: { taskId: task.id },
      select: { userId: true },
    });
    const before = new Set(existing.map((f) => f.userId));
    const after = new Set(internal);

    await this.prisma.$transaction([
      this.prisma.workspaceTaskFollower.deleteMany({
        where: { taskId: task.id, userId: { in: [...before].filter((id) => !after.has(id)) } },
      }),
      this.prisma.workspaceTaskFollower.createMany({
        data: [...after].filter((id) => !before.has(id)).map((userId) => ({ taskId: task.id, userId })),
        skipDuplicates: true,
      }),
    ]);

    const addedCount = [...after].filter((id) => !before.has(id)).length;
    if (addedCount > 0) {
      await this.writeEvent(task.id, user.id, WorkspaceTaskEventKind.FOLLOWER_ADDED, null, `${addedCount}`);
    }
    return this.followersFor(task.id);
  }

  /** Follow or unfollow yourself — the one-click path off a task. */
  async setOwnFollow(taskId: string, follow: boolean, user: AuthenticatedUser) {
    const task = await this.findTask(taskId);
    if (follow) {
      await this.prisma.workspaceTaskFollower.createMany({
        data: [{ taskId: task.id, userId: user.id }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.workspaceTaskFollower.deleteMany({ where: { taskId: task.id, userId: user.id } });
    }
    await this.writeEvent(
      task.id,
      user.id,
      follow ? WorkspaceTaskEventKind.FOLLOWER_ADDED : WorkspaceTaskEventKind.FOLLOWER_REMOVED,
    );
    return this.followersFor(task.id);
  }

  private followersFor(taskId: string) {
    return this.prisma.workspaceTaskFollower.findMany({
      where: { taskId },
      include: { user: { select: PERSON } },
    });
  }

  /**
   * Everyone who should hear that a task moved.
   *
   * Followers plus the assignee, minus whoever did it — `notify()` drops the
   * actor itself, which is what keeps somebody from being told about their own
   * click.
   */
  async notifyWatchers(taskId: string, actorId: string, kind: WorkspaceNotificationKind) {
    const [followers, task] = await Promise.all([
      this.prisma.workspaceTaskFollower.findMany({ where: { taskId }, select: { userId: true } }),
      this.prisma.workspaceTask.findUnique({ where: { id: taskId }, select: { assigneeId: true } }),
    ]);
    const userIds = followers.map((f) => f.userId);
    if (task?.assigneeId) userIds.push(task.assigneeId);
    await this.notifications.notify({ userIds, kind, actorId, taskId });
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  listTemplates() {
    return this.prisma.workspaceTaskTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  createTemplate(dto: CreateTemplateDto, user: AuthenticatedUser) {
    return this.prisma.workspaceTaskTemplate.create({
      data: {
        name: dto.name.trim(),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority ?? undefined,
        dueInDays: dto.dueInDays ?? null,
        createdById: user.id,
        items: { create: (dto.items ?? []).map((item, position) => ({ text: item.text, position })) },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async archiveTemplate(id: string) {
    return this.prisma.workspaceTaskTemplate.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  /** Mint a task from a template, optionally hung on a record. */
  async useTemplate(templateId: string, dto: UseTemplateDto, user: AuthenticatedUser) {
    const template = await this.prisma.workspaceTaskTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!template) throw new NotFoundException(`Template "${templateId}" not found`);

    let link: { recordType: WorkspaceRecordType; recordId: string; recordRef: string; label: string | null } | null = null;
    if (dto.recordType && dto.recordId) {
      const summary = await this.records.resolve(dto.recordType as WorkspaceRecordType, dto.recordId);
      link = {
        recordType: summary.type,
        recordId: summary.id,
        recordRef: summary.reference,
        label: summary.subtitle,
      };
    }

    const task = await this.createTaskFrom({
      title: template.title,
      description: template.description,
      priority: template.priority,
      assigneeId: dto.assigneeId ?? null,
      dueInDays: template.dueInDays,
      createdById: user.id,
      checklist: template.items.map((i) => i.text),
      link,
      event: { kind: WorkspaceTaskEventKind.TEMPLATE_USED, actorId: user.id, toValue: template.name },
    });

    if (task.assigneeId) {
      await this.notifications.notify({
        userIds: [task.assigneeId],
        kind: WorkspaceNotificationKind.ASSIGNED,
        actorId: user.id,
        taskId: task.id,
      });
    }
    return task;
  }

  // ── Recurrence ────────────────────────────────────────────────────────────

  listRecurrences() {
    return this.prisma.workspaceTaskRecurrence.findMany({
      orderBy: [{ enabled: 'desc' }, { nextRunOn: 'asc' }],
      include: {
        assignee: { select: PERSON },
        template: { select: { id: true, name: true } },
        _count: { select: { occurrences: true } },
      },
    });
  }

  createRecurrence(dto: CreateRecurrenceDto, user: AuthenticatedUser) {
    /* The first occurrence is the start date itself, so a rule set up for
       today fires today rather than waiting a whole cycle. */
    const startOn = toDay(dto.startOn ? new Date(dto.startOn) : new Date());
    return this.prisma.workspaceTaskRecurrence.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        templateId: dto.templateId ?? null,
        frequency: dto.frequency,
        interval: dto.interval ?? 1,
        weekday: dto.weekday ?? null,
        dayOfMonth: dto.dayOfMonth ?? null,
        priority: dto.priority ?? undefined,
        assigneeId: dto.assigneeId ?? null,
        createdById: user.id,
        nextRunOn: startOn,
      },
      include: { assignee: { select: PERSON } },
    });
  }

  updateRecurrence(id: string, dto: UpdateRecurrenceDto) {
    return this.prisma.workspaceTaskRecurrence.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.interval !== undefined ? { interval: dto.interval } : {}),
        ...(dto.weekday !== undefined ? { weekday: dto.weekday } : {}),
        ...(dto.dayOfMonth !== undefined ? { dayOfMonth: dto.dayOfMonth } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId || null } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
      include: { assignee: { select: PERSON } },
    });
  }

  deleteRecurrence(id: string) {
    return this.prisma.workspaceTaskRecurrence.delete({ where: { id } });
  }

  // ── Bulk ──────────────────────────────────────────────────────────────────

  /**
   * Apply one change to many tasks.
   *
   * Every row is authorised individually and a refusal skips that row rather
   * than failing the batch: selecting forty tasks and being told "no" because
   * one of them belongs to somebody else would make the feature useless, and
   * silently applying it to that one would be worse.
   */
  async bulk(dto: BulkTaskDto, user: AuthenticatedUser) {
    const tasks = await this.prisma.workspaceTask.findMany({
      where: { id: { in: dto.taskIds }, deletedAt: null },
      select: { id: true, createdById: true, assigneeId: true, status: true, priority: true },
    });

    const manages = user.permissions.some((p) => p === '*' || p === 'workspace.*' || p === 'workspace.manage');
    const assigns = user.permissions.some((p) => p === '*' || p === 'workspace.*' || p === 'workspace.assign');

    const allowed = tasks.filter(
      (t) => manages || t.createdById === user.id || t.assigneeId === user.id,
    );
    const skipped = tasks.length - allowed.length;

    if (dto.assigneeId !== undefined && !assigns) {
      throw new ForbiddenException('You cannot hand work to somebody else');
    }

    /* Unchecked, not the checked variant: `updateMany` cannot take a relation
       connect, and only the unchecked input exposes `assigneeId` as a scalar. */
    const data: Prisma.WorkspaceTaskUncheckedUpdateManyInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      data.completedAt = dto.status === WorkspaceTaskStatus.COMPLETED ? new Date() : null;
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId || null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    if (Object.keys(data).length === 0 || allowed.length === 0) {
      return { updated: 0, skipped };
    }

    const ids = allowed.map((t) => t.id);
    await this.prisma.$transaction([
      this.prisma.workspaceTask.updateMany({ where: { id: { in: ids } }, data }),
      /* One event per task, so a bulk change reads on each task's own rail
         exactly as a single change would. */
      this.prisma.workspaceTaskEvent.createMany({
        data: allowed.flatMap((task) => {
          const events: Prisma.WorkspaceTaskEventCreateManyInput[] = [];
          if (dto.status !== undefined && dto.status !== task.status) {
            events.push({ taskId: task.id, actorId: user.id, kind: WorkspaceTaskEventKind.STATUS_CHANGED, fromValue: task.status, toValue: dto.status });
          }
          if (dto.priority !== undefined && dto.priority !== task.priority) {
            events.push({ taskId: task.id, actorId: user.id, kind: WorkspaceTaskEventKind.PRIORITY_CHANGED, fromValue: task.priority, toValue: dto.priority });
          }
          /* Guarded like status and priority above: a sweep that sets twenty
             tasks to the owner eighteen of them already had should write two
             events, not twenty. `|| null` because the DTO carries `''` for a
             deliberate unassign and the column holds null. */
          if (dto.assigneeId !== undefined && (dto.assigneeId || null) !== task.assigneeId) {
            events.push({ taskId: task.id, actorId: user.id, kind: dto.assigneeId ? WorkspaceTaskEventKind.ASSIGNED : WorkspaceTaskEventKind.UNASSIGNED, fromValue: task.assigneeId, toValue: dto.assigneeId ?? null });
          }
          if (dto.dueAt !== undefined) {
            events.push({ taskId: task.id, actorId: user.id, kind: WorkspaceTaskEventKind.DUE_CHANGED, toValue: dto.dueAt ?? null });
          }
          return events;
        }),
      }),
    ]);

    if (dto.assigneeId) {
      await this.notifications.notify({
        userIds: [dto.assigneeId],
        kind: WorkspaceNotificationKind.ASSIGNED,
        actorId: user.id,
      });
    }
    return { updated: ids.length, skipped };
  }

  // ── Workload ──────────────────────────────────────────────────────────────

  /** One row per teammate: what they are carrying. */
  async workload() {
    const today = toDay(new Date());
    const weekEnd = new Date(today);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const [team, open] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          status: 'ACTIVE', shipperId: null, partnerId: null,
          role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
        },
        select: PERSON,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.workspaceTask.findMany({
        where: {
          deletedAt: null,
          status: { notIn: [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED] },
        },
        select: { assigneeId: true, dueAt: true, priority: true },
      }),
    ]);

    const rows = team.map((person) => {
      const mine = open.filter((t) => t.assigneeId === person.id);
      return {
        person,
        open: mine.length,
        overdue: mine.filter((t) => t.dueAt && t.dueAt < today).length,
        dueThisWeek: mine.filter((t) => t.dueAt && t.dueAt >= today && t.dueAt < weekEnd).length,
        urgent: mine.filter((t) => t.priority === 'URGENT').length,
      };
    });

    return {
      rows: rows.sort((a, b) => b.open - a.open),
      unassigned: open.filter((t) => !t.assigneeId).length,
    };
  }

  // ── shared ────────────────────────────────────────────────────────────────

  /**
   * The one place a task is minted from a spec — used by templates and by the
   * recurrence processor, so a generated task is indistinguishable from a
   * hand-raised one.
   */
  async createTaskFrom(spec: {
    title: string;
    description?: string | null;
    priority?: Prisma.WorkspaceTaskCreateInput['priority'];
    assigneeId?: string | null;
    dueInDays?: number | null;
    createdById: string;
    checklist?: string[];
    link?: { recordType: WorkspaceRecordType; recordId: string; recordRef: string; label: string | null } | null;
    event?: { kind: WorkspaceTaskEventKind; actorId: string | null; toValue?: string | null };
  }) {
    const reference = await nextReference(this.prisma.workspaceTask as never, 'TSK');
    const dueAt = spec.dueInDays == null ? null : (() => {
      const due = new Date();
      due.setDate(due.getDate() + spec.dueInDays!);
      due.setHours(23, 59, 59, 0);
      return due;
    })();

    return this.prisma.workspaceTask.create({
      data: {
        reference,
        title: spec.title,
        description: spec.description ?? null,
        priority: spec.priority,
        assigneeId: spec.assigneeId ?? null,
        createdById: spec.createdById,
        dueAt,
        ...(spec.link ? { links: { create: [spec.link] } } : {}),
        ...(spec.checklist?.length
          ? { checklist: { create: spec.checklist.map((text, position) => ({ text, position })) } }
          : {}),
        events: {
          create: [
            { actorId: spec.event?.actorId ?? null, kind: WorkspaceTaskEventKind.CREATED, toValue: spec.title },
            ...(spec.event && spec.event.kind !== WorkspaceTaskEventKind.CREATED
              ? [{ actorId: spec.event.actorId, kind: spec.event.kind, toValue: spec.event.toValue ?? null }]
              : []),
          ],
        },
      },
      include: {
        assignee: { select: PERSON },
        createdBy: { select: PERSON },
        links: true,
        checklist: { orderBy: { position: 'asc' } },
      },
    });
  }

  private async findTask(idOrRef: string) {
    const task = await this.prisma.workspaceTask.findFirst({
      where: { OR: [{ id: idOrRef }, { reference: idOrRef }], deletedAt: null },
    });
    if (!task) throw new NotFoundException(`Task "${idOrRef}" not found`);
    return task;
  }

  private writeEvent(
    taskId: string,
    actorId: string | null,
    kind: WorkspaceTaskEventKind,
    fromValue?: string | null,
    toValue?: string | null,
  ) {
    return this.prisma.workspaceTaskEvent.create({
      data: { taskId, actorId, kind, fromValue: fromValue ?? null, toValue: toValue ?? null },
    });
  }

  private async internalOnly(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        id: { in: userIds }, status: 'ACTIVE', shipperId: null, partnerId: null,
        role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Exposed for the recurrence processor. */
  get db() {
    return this.prisma;
  }

  /** Exposed for the recurrence processor. */
  step = nextOccurrence;
}
