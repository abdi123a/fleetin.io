import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceNotificationKind, WorkspaceRecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AssignMessageDto, CreateMessageDto, UpdateMessageDto } from './dto/message.dto';
import { RecordAccessService } from './record-access.service';
import { WorkspaceNotificationsService } from './notifications.service';
import { mentionedUserIds } from './tokens.util';

const MESSAGE_INCLUDE = {
  author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  assignedBy: { select: { id: true, firstName: true, lastName: true } },
  resolvedBy: { select: { id: true, firstName: true, lastName: true } },
  mentions: { select: { userId: true } },
} satisfies Prisma.WorkspaceMessageInclude;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordAccessService,
    private readonly notifications: WorkspaceNotificationsService,
  ) {}

  async findMany(params: { taskId?: string; recordType?: WorkspaceRecordType; recordId?: string }) {
    const where: Prisma.WorkspaceMessageWhereInput = {};
    if (params.taskId) {
      const task = await this.prisma.workspaceTask.findFirst({
        where: { OR: [{ id: params.taskId }, { reference: params.taskId }] },
        select: { id: true },
      });
      if (!task) throw new NotFoundException(`Task "${params.taskId}" not found`);
      where.taskId = task.id;
    } else if (params.recordType && params.recordId) {
      const record = await this.records.resolve(params.recordType, params.recordId);
      where.recordType = params.recordType;
      where.recordId = record.id;
    } else {
      throw new BadRequestException('Provide either taskId, or recordType and recordId');
    }

    return this.prisma.workspaceMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });
  }

  async create(dto: CreateMessageDto, user: AuthenticatedUser) {
    const anchor = await this.resolveAnchor(dto);

    const message = await this.prisma.workspaceMessage.create({
      data: {
        ...anchor,
        body: dto.body,
        authorId: user.id,
        parentMessageId: dto.parentMessageId ?? null,
        ...(dto.assigneeId
          ? { assigneeId: dto.assigneeId, assignedById: user.id, assignedAt: new Date() }
          : {}),
        mentions: {
          create: mentionedUserIds(dto.body).map((userId) => ({ userId })),
        },
      },
      include: MESSAGE_INCLUDE,
    });

    await this.fanOut(message, user, dto.parentMessageId);
    return message;
  }

  async update(id: string, dto: UpdateMessageDto, user: AuthenticatedUser) {
    const existing = await this.findOneBare(id);
    /* Author-only, and not overridable by `workspace.manage`: editing somebody
       else's words is a different thing from managing their work. */
    if (existing.authorId !== user.id) {
      throw new ForbiddenException('Only the author can edit a message');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceMention.deleteMany({ where: { messageId: id } });
      return tx.workspaceMessage.update({
        where: { id },
        data: {
          body: dto.body,
          editedAt: new Date(),
          mentions: { create: mentionedUserIds(dto.body).map((userId) => ({ userId })) },
        },
        include: MESSAGE_INCLUDE,
      });
    });
  }

  /**
   * Soft delete. The row keeps its place in the thread so the replies around it
   * still make sense, and the body is never served again — the same shape the
   * withdrawn `Comment` service used.
   */
  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.findOneBare(id);
    if (existing.authorId !== user.id) {
      throw new ForbiddenException('Only the author can withdraw a message');
    }
    return this.prisma.workspaceMessage.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
  }

  /**
   * The assigned comment.
   *
   * The lightest unit of accountability in the system: a message plus an owner.
   * No title, no due date, no priority — asking for those is what stops people
   * writing the thing down. It shows in the assignee's Inbox beside real tasks
   * and is closed by resolving, not by a status ladder.
   */
  async assign(id: string, dto: AssignMessageDto, user: AuthenticatedUser) {
    await this.findOneBare(id);
    const assigneeId = dto.assigneeId ?? null;

    const message = await this.prisma.workspaceMessage.update({
      where: { id },
      data: {
        assigneeId,
        assignedById: assigneeId ? user.id : null,
        assignedAt: assigneeId ? new Date() : null,
      },
      include: MESSAGE_INCLUDE,
    });

    if (assigneeId) {
      await this.notifications.notify({
        userIds: [assigneeId],
        kind: WorkspaceNotificationKind.COMMENT_ASSIGNED,
        actorId: user.id,
        messageId: message.id,
        taskId: message.taskId,
      });
    }
    return message;
  }

  async setResolved(id: string, resolved: boolean, user: AuthenticatedUser) {
    const existing = await this.findOneBare(id);

    const message = await this.prisma.workspaceMessage.update({
      where: { id },
      data: {
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? user.id : null,
      },
      include: MESSAGE_INCLUDE,
    });

    /* Tell whoever asked for it, not the whole thread — they are the one
       waiting on the answer. */
    if (resolved && existing.assignedById) {
      await this.notifications.notify({
        userIds: [existing.assignedById],
        kind: WorkspaceNotificationKind.COMMENT_RESOLVED,
        actorId: user.id,
        messageId: message.id,
        taskId: message.taskId,
      });
    }
    return message;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async findOneBare(id: string) {
    const message = await this.prisma.workspaceMessage.findFirst({ where: { id, deletedAt: null } });
    if (!message) throw new NotFoundException(`Message "${id}" not found`);
    return message;
  }

  /**
   * Exactly one anchor: a task, or a record — never both, never neither.
   *
   * This lives here rather than in the database because MySQL will not accept
   * a CHECK on `taskId` while that column also carries a cascading foreign key
   * (error 3823). `shipment-crew.util.ts` keeps "at most one lead" the same
   * way, for the same reason.
   */
  private async resolveAnchor(dto: CreateMessageDto) {
    const hasTask = Boolean(dto.taskId);
    const hasRecord = Boolean(dto.recordType && dto.recordId);

    if (hasTask && hasRecord) {
      throw new BadRequestException('A message belongs to a task or to a record, not both');
    }
    if (!hasTask && !hasRecord) {
      throw new BadRequestException('A message needs an anchor: taskId, or recordType and recordId');
    }

    if (hasTask) {
      const task = await this.prisma.workspaceTask.findFirst({
        where: { OR: [{ id: dto.taskId! }, { reference: dto.taskId! }], deletedAt: null },
        select: { id: true },
      });
      if (!task) throw new NotFoundException(`Task "${dto.taskId}" not found`);
      return { taskId: task.id, recordType: null, recordId: null, recordRef: null };
    }

    const record = await this.records.resolve(dto.recordType!, dto.recordId!);
    return {
      taskId: null,
      recordType: record.type,
      recordId: record.id,
      recordRef: record.reference,
    };
  }

  /** Mentions, replies and the task's owner — each told once, never twice. */
  private async fanOut(
    message: { id: string; body: string; taskId: string | null; assigneeId: string | null },
    user: AuthenticatedUser,
    parentMessageId?: string,
  ) {
    const mentioned = mentionedUserIds(message.body);
    if (mentioned.length) {
      await this.notifications.notify({
        userIds: mentioned,
        kind: WorkspaceNotificationKind.MENTIONED,
        actorId: user.id,
        messageId: message.id,
        taskId: message.taskId,
      });
    }

    if (message.assigneeId) {
      await this.notifications.notify({
        userIds: [message.assigneeId],
        kind: WorkspaceNotificationKind.COMMENT_ASSIGNED,
        actorId: user.id,
        messageId: message.id,
        taskId: message.taskId,
      });
    }

    if (parentMessageId) {
      const parent = await this.prisma.workspaceMessage.findUnique({
        where: { id: parentMessageId },
        select: { authorId: true },
      });
      if (parent) {
        await this.notifications.notify({
          userIds: [parent.authorId].filter((id) => !mentioned.includes(id)),
          kind: WorkspaceNotificationKind.REPLY_ADDED,
          actorId: user.id,
          messageId: message.id,
          taskId: message.taskId,
        });
      }
    } else if (message.taskId) {
      const task = await this.prisma.workspaceTask.findUnique({
        where: { id: message.taskId },
        select: { assigneeId: true },
      });
      if (task?.assigneeId && !mentioned.includes(task.assigneeId)) {
        await this.notifications.notify({
          userIds: [task.assigneeId],
          kind: WorkspaceNotificationKind.COMMENT_ADDED,
          actorId: user.id,
          messageId: message.id,
          taskId: message.taskId,
        });
      }
    }
  }
}
