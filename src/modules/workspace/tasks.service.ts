import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  WorkspaceNotificationKind,
  WorkspaceRecordType,
  WorkspaceTaskEventKind,
  WorkspaceTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateTaskDto, TaskLinkDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { RecordAccessService } from './record-access.service';
import { WorkspaceNotificationsService } from './notifications.service';
import { ProductivityService } from './productivity.service';

const TASK_INCLUDE = {
  assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  links: true,
  /* The complaint this task answers, when there is one.
   *
   * Cheap — one nullable row over the `taskId @unique`, no fan-out — and it
   * settles the question the board could not answer at all: whether a row is
   * internal work or somebody outside Fleetin waiting for an answer. Those
   * two are read differently and were indistinguishable in the list. */
  ticket: { select: { id: true, reference: true, subject: true } },
} satisfies Prisma.WorkspaceTaskInclude;

/**
 * How the board is stacked.
 *
 * Newest first is the default: the list is opened to see what has come in, and
 * a task raised this morning sitting below one from last week reads as if
 * nothing happened today. The old default sorted by status, then deadline,
 * then age — a sensible work order, and completely opaque to a reader who had
 * no control over it and no way to ask "what is new". It survives as `due`.
 */
export const TASK_SORTS = ['newest', 'oldest', 'due', 'priority'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

const TASK_ORDER: Record<TaskSort, Prisma.WorkspaceTaskOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  /* Open work first, then the soonest deadline. A board sorted this way never
     buries the thing that is late — which is why it was the only ordering for
     so long. */
  due: [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  priority: [{ priority: 'desc' }, { dueAt: { sort: 'asc', nulls: 'last' } }],
};

/** Start of today, local to the server — the boundary "due today" is read against. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordAccessService,
    private readonly notifications: WorkspaceNotificationsService,
    /* Plain injection, no forwardRef: ProductivityService does not import this
       one back, so there is no cycle to break and pretending otherwise would
       imply one to the next reader. */
    private readonly productivity: ProductivityService,
  ) {}

  /**
   * Hang each link's LIVE status and parent reference off the row.
   *
   * Not stored on `WorkspaceTaskLink` on purpose. A booking's status moves
   * several times a day, so a value copied when the task was raised is wrong
   * by the afternoon — and a chip wearing "Delivered" green for a box still on
   * the road is worse than a chip with no colour at all.
   *
   * `parentRef` is what lets a booking chip go somewhere real: a booking has no
   * page of its own, it opens as a sheet on its shipment, so the chip needs the
   * shipment's reference to build `?openBooking=`.
   *
   * The cost is bounded: `resolveMany` groups by record type, so a page of 25
   * tasks carrying 40 links is at most ten queries, and usually two.
   */
  private async enrichLinks<T extends { links: { recordType: WorkspaceRecordType; recordId: string }[] }>(
    tasks: T[],
  ): Promise<T[]> {
    const wanted = tasks.flatMap((task) =>
      task.links.map((link) => ({ type: link.recordType, idOrRef: link.recordId })),
    );
    if (wanted.length === 0) return tasks;

    const summaries = await this.records.resolveMany(wanted);
    const byKey = new Map(summaries.map((summary) => [`${summary.type}:${summary.id}`, summary]));

    for (const task of tasks) {
      for (const link of task.links) {
        const summary = byKey.get(`${link.recordType}:${link.recordId}`);
        Object.assign(link, {
          status: summary?.status ?? null,
          parentRef: summary?.parentRef ?? null,
          /* The record has since been deleted. The chip renders as plain text
             rather than a link into a 404. */
          missing: !summary,
        });
      }
    }
    return tasks;
  }

  /** The Inbox draws the same chips; this is `enrichLinks` for its rows. */
  async enrichInboxLinks(tasks: { links: { recordType: WorkspaceRecordType; recordId: string }[] }[]) {
    await this.enrichLinks(tasks);
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * The task list, filtered server-side and paginated.
   *
   * Everyone holding `workspace.view` sees every task. That is deliberate:
   * work is shared, data is not. A task naming an invoice is visible to the
   * whole desk, and the invoice BEHIND the link is still gated on
   * `finance.view` when the client follows it. The alternative — hiding rows —
   * produces a board with unexplained gaps, which is worse than useless for
   * the one job a board has: telling you whether somebody is already on it.
   */
  async findAll(query: QueryTasksDto, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.WorkspaceTaskWhereInput = { deletedAt: null };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q } },
        { description: { contains: query.q } },
        { reference: { contains: query.q } },
      ];
    }
    if (query.status?.length) where.status = { in: query.status };
    if (query.priority?.length) where.priority = { in: query.priority };
    if (query.createdById) where.createdById = query.createdById;

    if (query.mine === 'true') {
      where.assigneeId = user.id;
    } else if (query.assigneeId === 'unassigned') {
      where.assigneeId = null;
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }

    /* A record filter accepts a reference OR an id, because the record pages
       hold uuids and a pasted link holds a reference. */
    if (query.recordId || query.recordType) {
      where.links = {
        some: {
          ...(query.recordType ? { recordType: query.recordType } : {}),
          ...(query.recordId
            ? { OR: [{ recordId: query.recordId }, { recordRef: query.recordId }] }
            : {}),
        },
      };
    }

    if (query.followerId) {
      const who = query.followerId === 'me' ? user.id : query.followerId;
      where.followers = { some: { userId: who } };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }

    const today = startOfToday();
    if (query.due === 'overdue') {
      where.dueAt = { lt: today };
      where.status = { notIn: [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED] };
    } else if (query.due === 'today') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.dueAt = { gte: today, lt: tomorrow };
    } else if (query.due === 'week') {
      const inAWeek = new Date(today);
      inAWeek.setDate(inAWeek.getDate() + 7);
      where.dueAt = { gte: today, lt: inAWeek };
    } else if (query.due === 'none') {
      where.dueAt = null;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.workspaceTask.count({ where }),
      this.prisma.workspaceTask.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: TASK_ORDER[query.sort && TASK_SORTS.includes(query.sort) ? query.sort : 'newest'],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    await this.enrichLinks(items);
    return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** One task, by reference or id, with its whole conversation and history. */
  async findOne(idOrRef: string) {
    const task = await this.prisma.workspaceTask.findFirst({
      where: { OR: [{ id: idOrRef }, { reference: idOrRef }], deletedAt: null },
      include: {
        ...TASK_INCLUDE,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true } },
            mentions: { select: { userId: true } },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        checklist: { orderBy: { position: 'asc' } },
        followers: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        /* The rule this task came from, if any. One row by the `taskId @unique`
           on the occurrence, so a badge can say "every Monday" rather than
           leaving the reader wondering who keeps filing the same job. */
        occurrence: { include: { recurrence: true } },
      },
    });
    if (!task) throw new NotFoundException(`Task "${idOrRef}" not found`);
    await this.enrichLinks([task]);
    await this.nameEventPeople(task.events);
    return task;
  }

  /**
   * Turns the user ids on assignment events into names.
   *
   * The event rail stores WHO as an id, correctly — a person can be renamed
   * and the history should still point at the same human. But an id is
   * meaningless to a reader, and the rail was printing
   * "assigned it df545439-34e1… → 64495415-2eda…" on screen.
   *
   * Resolved on read rather than denormalised on write, for the same reason
   * record status is: a name written into an event in March is a stale name in
   * September. One batched query for the whole rail.
   */
  private async nameEventPeople(
    events: { kind: string; fromValue: string | null; toValue: string | null }[],
  ): Promise<void> {
    const ids = new Set<string>();
    for (const event of events) {
      if (event.kind !== 'ASSIGNED' && event.kind !== 'UNASSIGNED') continue;
      if (event.fromValue) ids.add(event.fromValue);
      if (event.toValue) ids.add(event.toValue);
    }
    if (ids.size === 0) return;

    const people = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));

    for (const event of events) {
      if (event.kind !== 'ASSIGNED' && event.kind !== 'UNASSIGNED') continue;
      /* A deleted account keeps its id rather than becoming "Unknown" — the id
         is at least a fact, and the rail renders it as one. */
      if (event.fromValue) event.fromValue = nameOf.get(event.fromValue) ?? event.fromValue;
      if (event.toValue) event.toValue = nameOf.get(event.toValue) ?? event.toValue;
    }
  }

  /**
   * Totals for the four scope tabs, under whatever base filter is in force.
   *
   * The list is paginated server-side, so the page cannot count the scopes it
   * is not showing — and a tab that prints `(0)` because nobody counted is a
   * lie, not a placeholder. Four `count`s in one round trip is the honest
   * price of four honest numbers.
   */
  async summary(
    query: Pick<QueryTasksDto, 'assigneeId' | 'createdById' | 'recordType' | 'recordId'>,
    userId: string,
  ) {
    const base: Prisma.WorkspaceTaskWhereInput = { deletedAt: null };
    if (query.createdById) base.createdById = query.createdById;
    if (query.assigneeId && query.assigneeId !== 'unassigned') base.assigneeId = query.assigneeId;
    if (query.recordId || query.recordType) {
      base.links = {
        some: {
          ...(query.recordType ? { recordType: query.recordType } : {}),
          ...(query.recordId ? { OR: [{ recordId: query.recordId }, { recordRef: query.recordId }] } : {}),
        },
      };
    }

    const live = { notIn: [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED] };
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [all, open, overdue, dueToday, unassigned, urgent, following] = await this.prisma.$transaction([
      this.prisma.workspaceTask.count({ where: base }),
      this.prisma.workspaceTask.count({ where: { ...base, status: live } }),
      this.prisma.workspaceTask.count({ where: { ...base, status: live, dueAt: { lt: today } } }),
      this.prisma.workspaceTask.count({ where: { ...base, status: live, dueAt: { gte: today, lt: tomorrow } } }),
      /*
       * `AND`, not a spread — the two conditions have to survive together.
       *
       * `{ ...base, assigneeId: null }` silently dropped the page's own pin,
       * so "My Tasks" counted every unassigned task in the system and printed
       * "Unassigned 1" beside "All 0". Spreading the other way round is no
       * better: it would drop the `null` and count every task assigned to you.
       *
       * Both kept, a pinned page asks for "assigned to Ahmed AND assigned to
       * nobody" and gets the truthful 0 — which is why the band is hidden
       * there rather than printed as a permanent zero.
       */
      this.prisma.workspaceTask.count({
        where: { AND: [base, { status: live, assigneeId: null }] },
      }),
      this.prisma.workspaceTask.count({ where: { ...base, status: live, priority: 'URGENT' } }),
      /* Whose watch list — the caller's, always. "Following" on somebody
         else's behalf is not a question this screen asks. */
      this.prisma.workspaceTask.count({
        where: { ...base, status: live, followers: { some: { userId } } },
      }),
    ]);
    return { all, open, overdue, today: dueToday, unassigned, urgent, following };
  }

  /**
   * Open-task counts for a set of records — the number beside every Raise
   * button. One query for the whole page, never one per card.
   */
  async countsForRecords(recordType: WorkspaceRecordType, recordIds: string[]) {
    const rows = await this.prisma.workspaceTaskLink.findMany({
      where: {
        recordType,
        OR: [{ recordId: { in: recordIds } }, { recordRef: { in: recordIds } }],
        task: {
          deletedAt: null,
          status: { notIn: [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED] },
        },
      },
      select: { recordId: true, recordRef: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.recordId] = (counts[row.recordId] ?? 0) + 1;
      if (row.recordRef !== row.recordId) {
        counts[row.recordRef] = (counts[row.recordRef] ?? 0) + 1;
      }
    }
    return counts;
  }

  // ── writes ────────────────────────────────────────────────────────────────

  async create(dto: CreateTaskDto, user: AuthenticatedUser) {
    const links = await this.resolveLinks(dto.links ?? []);
    const reference = await nextReference(this.prisma.workspaceTask as never, 'TSK');

    const task = await this.prisma.workspaceTask.create({
      data: {
        reference,
        title: dto.title,
        description: dto.description ?? null,
        status: dto.status ?? WorkspaceTaskStatus.OPEN,
        priority: dto.priority ?? undefined,
        assigneeId: dto.assigneeId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        createdById: user.id,
        links: { create: links },
        events: {
          create: { actorId: user.id, kind: WorkspaceTaskEventKind.CREATED, toValue: dto.title },
        },
      },
      include: TASK_INCLUDE,
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

  /**
   * Partial edit. Every changed field writes an event, because the rail on the
   * task detail is the only answer to "who moved this and when" — and that is
   * the question a manager actually asks.
   */
  async update(idOrRef: string, dto: UpdateTaskDto, user: AuthenticatedUser) {
    const existing = await this.findOneBare(idOrRef);
    this.assertMayEdit(existing, user);

    const data: Prisma.WorkspaceTaskUpdateInput = {};
    const events: Prisma.WorkspaceTaskEventCreateWithoutTaskInput[] = [];
    const event = (kind: WorkspaceTaskEventKind, from?: string | null, to?: string | null) =>
      events.push({ actor: { connect: { id: user.id } }, kind, fromValue: from ?? null, toValue: to ?? null });

    if (dto.title !== undefined && dto.title !== existing.title) {
      data.title = dto.title;
      event(WorkspaceTaskEventKind.TITLE_CHANGED, existing.title, dto.title);
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      data.description = dto.description;
      event(WorkspaceTaskEventKind.DESCRIPTION_CHANGED);
    }
    if (dto.priority !== undefined && dto.priority !== existing.priority) {
      data.priority = dto.priority;
      event(WorkspaceTaskEventKind.PRIORITY_CHANGED, existing.priority, dto.priority);
    }
    if (dto.dueAt !== undefined) {
      const next = dto.dueAt ? new Date(dto.dueAt) : null;
      if (next?.getTime() !== existing.dueAt?.getTime()) {
        data.dueAt = next;
        event(
          WorkspaceTaskEventKind.DUE_CHANGED,
          existing.dueAt?.toISOString() ?? null,
          next?.toISOString() ?? null,
        );
      }
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      /* `completedAt` is stamped here rather than derived, so "closed this
         week" is a column comparison instead of a walk of the event rail. */
      data.completedAt = dto.status === WorkspaceTaskStatus.COMPLETED ? new Date() : null;
      event(WorkspaceTaskEventKind.STATUS_CHANGED, existing.status, dto.status);
    }

    let newAssignee: string | null = null;
    if (dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId) {
      if (dto.assigneeId && !this.mayAssign(user)) {
        throw new ForbiddenException('You cannot hand work to somebody else');
      }
      data.assignee = dto.assigneeId ? { connect: { id: dto.assigneeId } } : { disconnect: true };
      event(
        dto.assigneeId ? WorkspaceTaskEventKind.ASSIGNED : WorkspaceTaskEventKind.UNASSIGNED,
        existing.assigneeId,
        dto.assigneeId ?? null,
      );
      newAssignee = dto.assigneeId ?? null;
    }

    if (events.length === 0) return this.findOne(idOrRef);

    const task = await this.prisma.workspaceTask.update({
      where: { id: existing.id },
      data: { ...data, events: { create: events } },
      include: TASK_INCLUDE,
    });

    if (newAssignee) {
      await this.notifications.notify({
        userIds: [newAssignee],
        kind: WorkspaceNotificationKind.ASSIGNED,
        actorId: user.id,
        taskId: task.id,
      });
    }

    /* Followers wanted updates without owning it — a status move is the update
       they wanted. `notifyWatchers` drops the actor, so nobody hears about
       their own click. */
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.productivity.notifyWatchers(
        task.id,
        user.id,
        WorkspaceNotificationKind.TASK_UPDATED,
      );
      /* And the customer's copy of it.
       *
       * A ticket that has a task takes its status from that task — the whole
       * point of joining them was that a helpdesk maintaining two statuses by
       * hand ends up telling a shipper their problem is still OPEN a week
       * after it was fixed. `updateMany` rather than `update` because most
       * tasks have no ticket, and a miss must be a no-op rather than a throw.
       *
       * Deliberately not wrapped in the task's transaction: the ticket
       * following a beat late is a cosmetic lag, while a failed ticket write
       * rolling back a status the operator just set is a lost update. */
      await this.prisma.workspaceTicket.updateMany({
        where: { taskId: task.id },
        data: {
          status: task.status,
          closedAt:
            task.status === WorkspaceTaskStatus.COMPLETED ||
            task.status === WorkspaceTaskStatus.CANCELLED
              ? new Date()
              : null,
        },
      });
    }
    return task;
  }

  /** Replace the whole link set — an empty array unlinks everything. */
  async setLinks(idOrRef: string, links: TaskLinkDto[], user: AuthenticatedUser) {
    const existing = await this.findOneBare(idOrRef);
    this.assertMayEdit(existing, user);
    const resolved = await this.resolveLinks(links);

    await this.prisma.$transaction([
      this.prisma.workspaceTaskLink.deleteMany({ where: { taskId: existing.id } }),
      this.prisma.workspaceTaskLink.createMany({
        data: resolved.map((l) => ({ ...l, taskId: existing.id })),
      }),
      this.prisma.workspaceTaskEvent.create({
        data: {
          taskId: existing.id,
          actorId: user.id,
          kind: WorkspaceTaskEventKind.LINKED,
          toValue: resolved.map((l) => l.recordRef).join(', ') || null,
        },
      }),
    ]);
    return this.findOne(existing.id);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async findOneBare(idOrRef: string) {
    const task = await this.prisma.workspaceTask.findFirst({
      where: { OR: [{ id: idOrRef }, { reference: idOrRef }], deletedAt: null },
    });
    if (!task) throw new NotFoundException(`Task "${idOrRef}" not found`);
    return task;
  }

  private mayAssign(user: AuthenticatedUser): boolean {
    return user.permissions.some((p) => p === '*' || p === 'workspace.*' || p === 'workspace.assign');
  }

  /**
   * You may always edit work you raised or own. Editing somebody else's needs
   * `workspace.manage` — the difference between tidying your own desk and
   * reaching across somebody else's.
   */
  private assertMayEdit(task: { createdById: string; assigneeId: string | null }, user: AuthenticatedUser): void {
    if (task.createdById === user.id || task.assigneeId === user.id) return;
    const manages = user.permissions.some((p) => p === '*' || p === 'workspace.*' || p === 'workspace.manage');
    if (!manages) throw new ForbiddenException('You cannot edit work raised by somebody else');
  }

  /**
   * Turn what the client sent into storable links, proving each record exists.
   *
   * This is the only place a Workspace write touches the domain, and it reads
   * — never writes. A reference the user typed that resolves to nothing throws
   * here rather than being stored as a chip that links to a 404.
   */
  private async resolveLinks(links: TaskLinkDto[]) {
    if (links.length === 0) return [];
    const summaries = await this.records.resolveMany(
      links.map((l) => ({ type: l.recordType, idOrRef: l.recordId })),
    );

    return links.map((link) => {
      const match = summaries.find(
        (s) => s.type === link.recordType && (s.id === link.recordId || s.reference === link.recordId),
      );
      if (!match) {
        throw new NotFoundException(`${link.recordType} "${link.recordId}" does not exist`);
      }
      return {
        recordType: match.type,
        recordId: match.id,
        recordRef: match.reference,
        label: match.subtitle,
      };
    });
  }
}
