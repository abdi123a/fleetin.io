import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceChannelKind, WorkspaceNotificationKind, WorkspaceRecordType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AssignMessageDto, CreateMessageDto, UpdateMessageDto } from './dto/message.dto';
import { SearchMessagesDto } from './dto/channel.dto';
import { ChannelsService } from './channels.service';
import { RecordAccessService } from './record-access.service';
import { WorkspaceNotificationsService } from './notifications.service';
import { mentionedUserIds, parseTokens } from './tokens.util';

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
    private readonly channels: ChannelsService,
  ) {}

  /**
   * Resolve every record a batch of messages *mentions in its body*, so a chip
   * in a message can wear the same live status a chip on a task does.
   *
   * Without this, `609196` in a channel renders as a grey plate while the same
   * booking on a task card is amber "Empty Ready" — two colours for one fact,
   * and the greyer one is the surface people spend all day in.
   *
   * Resolved per read, never stored, and batched by record type: a page of 40
   * messages naming a dozen records costs at most ten queries.
   */
  private async attachReferences<T extends { body: string }>(messages: T[]): Promise<T[]> {
    const KIND_TYPE: Record<string, WorkspaceRecordType> = {
      shipment: WorkspaceRecordType.SHIPMENT,
      booking: WorkspaceRecordType.BOOKING,
      vehicle: WorkspaceRecordType.VEHICLE,
      driver: WorkspaceRecordType.DRIVER,
      partner: WorkspaceRecordType.PARTNER,
      transporter: WorkspaceRecordType.PARTNER,
      shipper: WorkspaceRecordType.SHIPPER,
      invoice: WorkspaceRecordType.INVOICE,
      hold: WorkspaceRecordType.PAYOUT_HOLD,
      cycle: WorkspaceRecordType.EMPTY_RETURN_CYCLE,
      chain: WorkspaceRecordType.EMPTY_RETURN_CHAIN,
    };

    const wanted: { type: WorkspaceRecordType; idOrRef: string }[] = [];
    for (const message of messages) {
      for (const token of parseTokens(message.body)) {
        const type = KIND_TYPE[token.kind];
        /* A booking token carries `reference~parentShipment`; the reference is
           the half that resolves. */
        if (type) wanted.push({ type, idOrRef: token.value.split('~')[0] ?? token.value });
      }
    }
    if (wanted.length === 0) {
      return messages.map((message) => ({ ...message, references: [] }));
    }

    const summaries = await this.records.resolveMany(wanted);
    const byRef = new Map(summaries.map((s) => [`${s.type}:${s.reference}`, s]));

    return messages.map((message) => {
      const references = parseTokens(message.body)
        .map((token) => {
          const type = KIND_TYPE[token.kind];
          if (!type) return null;
          const reference = token.value.split('~')[0] ?? token.value;
          const found = byRef.get(`${type}:${reference}`);
          return found ? { ...found } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      return { ...message, references };
    });
  }

  async findMany(params: {
    taskId?: string;
    channelId?: string;
    recordType?: WorkspaceRecordType;
    recordId?: string;
    userId: string;
  }) {
    const where: Prisma.WorkspaceMessageWhereInput = {};
    if (params.taskId) {
      const task = await this.prisma.workspaceTask.findFirst({
        where: { OR: [{ id: params.taskId }, { reference: params.taskId }] },
        select: { id: true },
      });
      if (!task) throw new NotFoundException(`Task "${params.taskId}" not found`);
      where.taskId = task.id;
    } else if (params.channelId) {
      await this.channels.assertMember(params.channelId, params.userId);
      where.channelId = params.channelId;
    } else if (params.recordType && params.recordId) {
      const record = await this.records.resolve(params.recordType, params.recordId);
      where.recordType = params.recordType;
      where.recordId = record.id;
    } else {
      throw new BadRequestException('Provide taskId, channelId, or recordType and recordId');
    }

    const rows = await this.prisma.workspaceMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });
    return this.attachReferences(rows);
  }

  /**
   * A channel's river, newest page first, oldest message last.
   *
   * Thread replies are excluded: they belong to the thread panel, and letting
   * them back into the river is how a channel becomes unreadable the first
   * time somebody has a long back-and-forth. The channel shows the parent and
   * a reply count instead.
   *
   * Cursor pagination on `before`, not offset — a river gets new messages at
   * the end while somebody is scrolling back through it, and offsets shift
   * under them.
   */
  async channelMessages(
    channelId: string,
    userId: string,
    { before, limit = 40 }: { before?: string; limit?: number },
  ) {
    await this.channels.assertMember(channelId, userId);

    let cursorAt: Date | undefined;
    if (before) {
      const anchorMessage = await this.prisma.workspaceMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      cursorAt = anchorMessage?.createdAt;
    }

    const rows = await this.prisma.workspaceMessage.findMany({
      where: {
        channelId,
        parentMessageId: null,
        ...(cursorAt ? { createdAt: { lt: cursorAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        ...MESSAGE_INCLUDE,
        _count: { select: { replies: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    /* Reversed so the caller renders top-to-bottom without thinking about it. */
    const items = await this.attachReferences(page.reverse());
    return { items, hasMore, nextBefore: hasMore ? items[0]?.id ?? null : null };
  }

  /** A thread: the parent, then its replies oldest-first. */
  async thread(messageId: string, userId: string) {
    const parent = await this.prisma.workspaceMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: MESSAGE_INCLUDE,
    });
    if (!parent) throw new NotFoundException(`Message "${messageId}" not found`);
    if (parent.channelId) await this.channels.assertMember(parent.channelId, userId);

    const replies = await this.prisma.workspaceMessage.findMany({
      where: { parentMessageId: parent.id },
      orderBy: { createdAt: 'asc' },
      include: MESSAGE_INCLUDE,
    });
    const [withRefs, repliesWithRefs] = await Promise.all([
      this.attachReferences([parent]),
      this.attachReferences(replies),
    ]);
    return { parent: withRefs[0] ?? parent, replies: repliesWithRefs };
  }

  /**
   * Search, scoped to rooms the reader is actually in.
   *
   * The record clause is the point of it: searching `609196` finds messages
   * that merely *reference* that booking, because the reference is stored as a
   * token in the body rather than as rendered text. That is a thing a WhatsApp
   * group cannot do at all.
   */
  async search(dto: SearchMessagesDto, userId: string) {
    const memberships = await this.prisma.workspaceChannelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });
    const myChannels = memberships.map((m) => m.channelId);
    if (myChannels.length === 0) return [];

    const where: Prisma.WorkspaceMessageWhereInput = {
      deletedAt: null,
      channelId: dto.channelId ? dto.channelId : { in: myChannels },
    };
    if (dto.channelId && !myChannels.includes(dto.channelId)) return [];
    if (dto.authorId) where.authorId = dto.authorId;
    if (dto.q?.trim()) where.body = { contains: dto.q.trim() };
    if (dto.from || dto.to) {
      where.createdAt = {
        ...(dto.from ? { gte: new Date(dto.from) } : {}),
        ...(dto.to ? { lte: new Date(dto.to) } : {}),
      };
    }

    return this.prisma.workspaceMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: dto.limit ?? 30,
      include: {
        ...MESSAGE_INCLUDE,
        channel: { select: { id: true, key: true, name: true, kind: true } },
      },
    });
  }

  async create(dto: CreateMessageDto, user: AuthenticatedUser) {
    const anchor = await this.resolveAnchor(dto, user.id);

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
  private async resolveAnchor(dto: CreateMessageDto, userId: string) {
    const hasTask = Boolean(dto.taskId);
    const hasRecord = Boolean(dto.recordType && dto.recordId);
    const hasChannel = Boolean(dto.channelId);

    const anchors = [hasTask, hasRecord, hasChannel].filter(Boolean).length;
    if (anchors > 1) {
      throw new BadRequestException('A message belongs to a task, a record or a channel — not more than one');
    }
    if (anchors === 0) {
      throw new BadRequestException('A message needs an anchor: taskId, channelId, or recordType and recordId');
    }

    if (hasChannel) {
      /* Membership is the gate. A private room is invisible to a non-member,
         so this throws NotFound rather than Forbidden — see `assertMember`. */
      await this.channels.assertMember(dto.channelId!, userId);
      return { taskId: null, channelId: dto.channelId!, recordType: null, recordId: null, recordRef: null };
    }

    if (hasTask) {
      const task = await this.prisma.workspaceTask.findFirst({
        where: { OR: [{ id: dto.taskId! }, { reference: dto.taskId! }], deletedAt: null },
        select: { id: true },
      });
      if (!task) throw new NotFoundException(`Task "${dto.taskId}" not found`);
      return { taskId: task.id, channelId: null, recordType: null, recordId: null, recordRef: null };
    }

    const record = await this.records.resolve(dto.recordType!, dto.recordId!);
    return {
      taskId: null,
      channelId: null,
      recordType: record.type,
      recordId: record.id,
      recordRef: record.reference,
    };
  }

  /** Mentions, replies and the task's owner — each told once, never twice. */
  private async fanOut(
    message: { id: string; body: string; taskId: string | null; channelId: string | null; assigneeId: string | null },
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
    } else if (message.channelId) {
      /*
       * The one rule that decides whether people keep notifications on.
       *
       * A DM notifies its recipient, always — somebody wrote to you by name.
       * A CHANNEL message notifies NOBODY beyond the mentions handled above:
       * a bell that rings for every message in Operations is a bell people
       * turn off within a day, and then the mention that mattered is missed
       * along with the noise. §8 asks for exactly this restraint.
       *
       * Unread counts still move for everyone. Unread is a number you glance
       * at; a notification is an interruption, and they are not the same thing.
       */
      const channel = await this.prisma.workspaceChannel.findUnique({
        where: { id: message.channelId },
        select: {
          kind: true,
          members: { where: { mutedAt: null }, select: { userId: true } },
        },
      });

      if (channel?.kind === WorkspaceChannelKind.DIRECT) {
        await this.notifications.notify({
          userIds: channel.members.map((m) => m.userId).filter((id) => !mentioned.includes(id)),
          kind: WorkspaceNotificationKind.COMMENT_ADDED,
          actorId: user.id,
          messageId: message.id,
        });
      }
    }
  }
}
