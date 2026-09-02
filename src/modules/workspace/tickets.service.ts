import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  WorkspaceRecordType,
  WorkspaceTaskPriority,
  WorkspaceTaskStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { nextReference } from '../../common/helpers/reference.util';
import { RecordAccessService } from './record-access.service';
import { TasksService } from './tasks.service';
import { CreateTicketDto, RaiseTicketTaskDto, UpdateTicketDto } from './dto/ticket.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

const TICKET_INCLUDE = {
  openedBy: PERSON,
  task: {
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
      assignee: PERSON,
    },
  },
} satisfies Prisma.WorkspaceTicketInclude;

/** Closed by being answered, or by being withdrawn. */
const CLOSED: WorkspaceTaskStatus[] = [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED];

/**
 * Tickets — the customer's side of the work.
 *
 * This service owns the ticket and nothing else. It creates tasks by calling
 * `TasksService`, never by writing `workspace_tasks` itself: a task raised from
 * a ticket has to get the same reference, the same events, the same assignee
 * notification and the same permission checks as one raised from the board, and
 * the only way to guarantee that is to go through the one door.
 *
 * The status rule lives in two halves, deliberately:
 *
 * - **Task → ticket** is automatic and in `TasksService.update`, because that
 *   is where a status actually moves. Doing it here would mean the ticket only
 *   caught up when somebody happened to open it.
 * - **Ticket → task** does not exist. A ticket with a task attached refuses a
 *   direct status write (see `update`), because two writable statuses on one
 *   piece of work is the double bookkeeping this feature exists to remove.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordAccessService,
    private readonly tasks: TasksService,
  ) {}

  private async findBare(idOrRef: string) {
    const ticket = await this.prisma.workspaceTicket.findFirst({
      where: { OR: [{ id: idOrRef }, { reference: idOrRef }], deletedAt: null },
    });
    if (!ticket) throw new NotFoundException(`Ticket "${idOrRef}" does not exist`);
    return ticket;
  }

  async findOne(idOrRef: string) {
    const bare = await this.findBare(idOrRef);
    const ticket = await this.prisma.workspaceTicket.findUniqueOrThrow({
      where: { id: bare.id },
      include: TICKET_INCLUDE,
    });
    return this.enrich(ticket);
  }

  /**
   * Hang the record's LIVE status off the row, the way a task link does.
   *
   * Same reasoning as `TasksService.enrichLinks`: a shipment status copied when
   * the phone call came in is wrong by the afternoon, and a chip wearing the
   * wrong colour is worse than one wearing none.
   */
  private async enrich<T extends { recordType: WorkspaceRecordType | null; recordId: string | null }>(
    ticket: T,
  ): Promise<T & { recordStatus?: string | null; recordParentRef?: string | null; recordMissing?: boolean }> {
    if (!ticket.recordType || !ticket.recordId) return ticket;
    const [summary] = await this.records.resolveMany([
      { type: ticket.recordType, idOrRef: ticket.recordId },
    ]);
    return Object.assign(ticket, {
      recordStatus: summary?.status ?? null,
      recordParentRef: summary?.parentRef ?? null,
      recordMissing: !summary,
    });
  }

  private async enrichMany<T extends { recordType: WorkspaceRecordType | null; recordId: string | null }>(
    tickets: T[],
  ): Promise<T[]> {
    const wanted = tickets
      .filter((t) => t.recordType && t.recordId)
      .map((t) => ({ type: t.recordType!, idOrRef: t.recordId! }));
    if (wanted.length === 0) return tickets;
    const summaries = await this.records.resolveMany(wanted);
    const byKey = new Map(summaries.map((s) => [`${s.type}:${s.id}`, s]));
    for (const ticket of tickets) {
      if (!ticket.recordType || !ticket.recordId) continue;
      const summary = byKey.get(`${ticket.recordType}:${ticket.recordId}`);
      Object.assign(ticket, {
        recordStatus: summary?.status ?? null,
        recordParentRef: summary?.parentRef ?? null,
        recordMissing: !summary,
      });
    }
    return tickets;
  }

  async list(
    query: {
      status?: WorkspaceTaskStatus;
      priority?: WorkspaceTaskPriority;
      scope?: 'open' | 'unassigned' | 'closed' | 'all' | 'mine';
      recordType?: WorkspaceRecordType;
      recordId?: string;
      assigneeId?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    },
    userId?: string,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.WorkspaceTicketWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.scope === 'open') where.status = { notIn: CLOSED };
    if (query.scope === 'closed') where.status = { in: CLOSED };
    /* "Unassigned" is a ticket nobody has been given the work for — not a task
       with a null assignee. A ticket whose task exists but is unowned is
       somebody's problem already; this queue is the ones with no task at all. */
    if (query.scope === 'unassigned') {
      where.taskId = null;
      where.status = { notIn: CLOSED };
    }
    /* "Mine" is the ones whose WORK is on my desk — the task is assigned to
       me — not the ones I happened to log. Somebody who takes twenty calls a
       day owns none of them; the person who has to answer them does. */
    if (query.scope === 'mine' && userId) {
      where.task = { assigneeId: userId };
      where.status = { notIn: CLOSED };
    }
    if (query.assigneeId) where.task = { assigneeId: query.assigneeId };
    if (query.recordType) where.recordType = query.recordType;
    if (query.recordId) {
      where.OR = [{ recordId: query.recordId }, { recordRef: query.recordId }];
    }
    if (query.q) {
      const q = query.q.trim();
      where.AND = [
        {
          OR: [
            { reference: { contains: q } },
            { subject: { contains: q } },
            { description: { contains: q } },
            { reporterName: { contains: q } },
            { recordRef: { contains: q } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.workspaceTicket.findMany({
        where,
        include: TICKET_INCLUDE,
        /* Urgent first, then oldest — a queue is worked from the top of the
           priority and the bottom of the clock. */
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workspaceTicket.count({ where }),
    ]);

    return {
      items: await this.enrichMany(items),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** The tab counts above the list. */
  async summary(userId?: string) {
    const [mine, open, unassigned, closed, all, urgent] = await Promise.all([
      userId
        ? this.prisma.workspaceTicket.count({
            where: { deletedAt: null, status: { notIn: CLOSED }, task: { assigneeId: userId } },
          })
        : Promise.resolve(0),
      this.prisma.workspaceTicket.count({ where: { deletedAt: null, status: { notIn: CLOSED } } }),
      this.prisma.workspaceTicket.count({
        where: { deletedAt: null, taskId: null, status: { notIn: CLOSED } },
      }),
      this.prisma.workspaceTicket.count({ where: { deletedAt: null, status: { in: CLOSED } } }),
      this.prisma.workspaceTicket.count({ where: { deletedAt: null } }),
      this.prisma.workspaceTicket.count({
        where: {
          deletedAt: null,
          status: { notIn: CLOSED },
          priority: WorkspaceTaskPriority.URGENT,
        },
      }),
    ]);
    return { mine, open, unassigned, closed, all, urgent };
  }

  async create(dto: CreateTicketDto, user: AuthenticatedUser) {
    /* Resolved, not trusted. The caller sends whatever the picker gave it — a
       reference or a uuid — and this is where it becomes both, so a list can
       print the reference without a second query per row. */
    let record: { type: WorkspaceRecordType; id: string; reference: string; subtitle: string | null } | null =
      null;
    if (dto.recordType && dto.recordId) {
      const summary = await this.records.resolve(dto.recordType, dto.recordId);
      record = {
        type: summary.type,
        id: summary.id,
        reference: summary.reference,
        subtitle: summary.subtitle,
      };
    }

    const reference = await nextReference(
      this.prisma.workspaceTicket as never,
      'TKT',
    );

    const ticket = await this.prisma.workspaceTicket.create({
      data: {
        reference,
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        priority: dto.priority ?? WorkspaceTaskPriority.NORMAL,
        channel: dto.channel,
        reporterName: dto.reporterName?.trim() || null,
        reporterContact: dto.reporterContact?.trim() || null,
        recordType: record?.type ?? null,
        recordId: record?.id ?? null,
        recordRef: record?.reference ?? null,
        recordLabel: record?.subtitle ?? null,
        openedBy: { connect: { id: user.id } },
      },
      include: TICKET_INCLUDE,
    });

    /* Naming somebody is what turns a complaint into work, so it happens in
       the same call. Through `raiseTask` rather than inline, so a ticket
       assigned on the form and one handed over a day later produce exactly the
       same task — same reference, same events, same notification. */
    if (dto.assigneeId) {
      return this.raiseTask(
        ticket.reference,
        { assigneeId: dto.assigneeId, dueAt: dto.dueAt },
        user,
      );
    }

    return this.enrich(ticket);
  }

  async update(idOrRef: string, dto: UpdateTicketDto, user: AuthenticatedUser) {
    const existing = await this.findBare(idOrRef);
    const data: Prisma.WorkspaceTicketUpdateInput = {};

    if (dto.subject !== undefined) data.subject = dto.subject.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.reporterName !== undefined) data.reporterName = dto.reporterName?.trim() || null;
    if (dto.reporterContact !== undefined) {
      data.reporterContact = dto.reporterContact?.trim() || null;
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      /* One writable status per piece of work. Once the ticket has a task, the
         task is where the status moves and this follows it — letting both be
         written is exactly the double bookkeeping that leaves a ticket saying
         OPEN a week after the job was finished. */
      if (existing.taskId) {
        throw new BadRequestException(
          'This ticket follows its task. Move the task instead and the ticket follows.',
        );
      }
      data.status = dto.status;
      data.closedAt = CLOSED.includes(dto.status) ? new Date() : null;
    }

    if (dto.recordType !== undefined || dto.recordId !== undefined) {
      const type = dto.recordType ?? existing.recordType;
      const id = dto.recordId ?? existing.recordId;
      if (type && id) {
        const summary = await this.records.resolve(type, id);
        data.recordType = summary.type;
        data.recordId = summary.id;
        data.recordRef = summary.reference;
        data.recordLabel = summary.subtitle;
      } else {
        data.recordType = null;
        data.recordId = null;
        data.recordRef = null;
        data.recordLabel = null;
      }
    }

    const ticket = await this.prisma.workspaceTicket.update({
      where: { id: existing.id },
      data,
      include: TICKET_INCLUDE,
    });
    void user;
    return this.enrich(ticket);
  }

  /**
   * Hand the problem to somebody — the moment a ticket becomes work.
   *
   * The task is created through `TasksService` so it is indistinguishable from
   * one raised on the board: same reference scheme, same CREATED event, same
   * assignee notification, same permission check on handing work to others.
   * The only thing this adds is the join.
   */
  async raiseTask(idOrRef: string, dto: RaiseTicketTaskDto, user: AuthenticatedUser) {
    const existing = await this.findBare(idOrRef);
    if (existing.taskId) {
      throw new BadRequestException(
        'This ticket already has a task. Reassign that task rather than raising a second one.',
      );
    }
    if (CLOSED.includes(existing.status)) {
      throw new BadRequestException('This ticket is closed.');
    }

    const task = await this.tasks.create(
      {
        title: dto.title?.trim() || existing.subject,
        /* The complaint travels with the work. Whoever picks this up at 7am
           needs the caller's account of it, not a one-line summary of it. */
        description: dto.description?.trim() || existing.description,
        priority: dto.priority ?? existing.priority,
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt,
        links:
          dto.linkRecord !== false && existing.recordType && existing.recordId
            ? [{ recordType: existing.recordType, recordId: existing.recordId }]
            : [],
      },
      user,
    );

    const ticket = await this.prisma.workspaceTicket.update({
      where: { id: existing.id },
      data: {
        taskId: task.id,
        /* The ticket takes the task's status from here on. At creation that is
           OPEN unless the caller asked for something else. */
        status: task.status,
        closedAt: CLOSED.includes(task.status) ? new Date() : null,
      },
      include: TICKET_INCLUDE,
    });
    return this.enrich(ticket);
  }

  /** Only the person who took the call, or an admin, can withdraw it. */
  async remove(idOrRef: string, user: AuthenticatedUser) {
    const existing = await this.findBare(idOrRef);
    if (existing.openedById !== user.id && !user.permissions?.includes('workspace.admin')) {
      throw new ForbiddenException('Only the person who opened this ticket can delete it');
    }
    await this.prisma.workspaceTicket.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
