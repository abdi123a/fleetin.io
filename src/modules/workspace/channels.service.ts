import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceChannelKind, WorkspaceChannelRole } from '@prisma/client';
import { PERMISSIONS, WILDCARD_ALL } from '../../common/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateChannelDto, SetChannelMembersDto, UpdateChannelDto } from './dto/channel.dto';

const PERSON = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

/** `dm:<a>:<b>`, ids sorted — both sides compute the same string. */
export function directKey(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

/** A channel handle from a name: "Empty Returns" -> "empty-returns". */
function channelKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'channel';
}

interface UnreadRow { channelId: string; unread: bigint | number }

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── the rail ──────────────────────────────────────────────────────────────

  /**
   * Every room I am in, with its unread count, mention count and last message.
   *
   * Four queries total, not four per row. The counts cannot be a Prisma
   * `groupBy` because the cutoff differs per channel — each membership has its
   * own `lastReadAt` — so they join the member row and compare against it in
   * SQL. With twenty channels the N+1 version would be sixty round trips on
   * every poll of the rail.
   */
  async listForUser(user: AuthenticatedUser) {
    const userId = user.id;
    /* Computed once for the whole rail rather than per row — the answer is the
       same for every channel, and it decides whether each one offers a delete. */
    const canManage =
      user.permissions?.includes(WILDCARD_ALL) ||
      user.permissions?.includes(PERMISSIONS.workspace.manage);

    const memberships = await this.prisma.workspaceChannelMember.findMany({
      where: { userId, channel: { archivedAt: null } },
      include: {
        channel: {
          include: {
            members: { include: { user: { select: PERSON } } },
          },
        },
      },
    });
    if (memberships.length === 0) return [];

    const [unreadRows, mentionRows, lastMessages] = await Promise.all([
      this.prisma.$queryRaw<UnreadRow[]>`
        SELECT m.channelId AS channelId, COUNT(*) AS unread
        FROM workspace_messages m
        JOIN workspace_channel_members cm
          ON cm.channelId = m.channelId AND cm.userId = ${userId}
        WHERE m.channelId IS NOT NULL
          AND m.deletedAt IS NULL
          AND m.authorId <> ${userId}
          AND (cm.lastReadAt IS NULL OR m.createdAt > cm.lastReadAt)
        GROUP BY m.channelId`,

      /* Mentions are counted separately because they are coloured separately —
         an unread channel is quiet, an unread mention is not. */
      this.prisma.$queryRaw<UnreadRow[]>`
        SELECT m.channelId AS channelId, COUNT(*) AS unread
        FROM workspace_messages m
        JOIN workspace_mentions mn ON mn.messageId = m.id AND mn.userId = ${userId}
        JOIN workspace_channel_members cm
          ON cm.channelId = m.channelId AND cm.userId = ${userId}
        WHERE m.channelId IS NOT NULL
          AND m.deletedAt IS NULL
          AND m.authorId <> ${userId}
          AND (cm.lastReadAt IS NULL OR m.createdAt > cm.lastReadAt)
        GROUP BY m.channelId`,

      this.lastMessagePerChannel(memberships.map((m) => m.channelId)),
    ]);

    const unread = new Map(unreadRows.map((r) => [r.channelId, Number(r.unread)]));
    const mentions = new Map(mentionRows.map((r) => [r.channelId, Number(r.unread)]));

    return memberships
      .map((membership) => {
        const { channel } = membership;
        const other = channel.kind === WorkspaceChannelKind.DIRECT
          ? channel.members.find((m) => m.userId !== userId)?.user ?? null
          : null;

        return {
          id: channel.id,
          key: channel.key,
          kind: channel.kind,
          /* A DM is named by whoever you are talking to. */
          name: channel.name ?? (other ? `${other.firstName} ${other.lastName}`.trim() : 'Direct message'),
          topic: channel.topic,
          isPrivate: channel.isPrivate,
          memberCount: channel.members.length,
          members: channel.members.slice(0, 8).map((m) => m.user),
          counterpart: other,
          lastReadAt: membership.lastReadAt,
          muted: Boolean(membership.mutedAt),
          unread: unread.get(channel.id) ?? 0,
          mentions: mentions.get(channel.id) ?? 0,
          lastMessage: lastMessages.get(channel.id) ?? null,
          /* Whether THIS reader may delete the room, decided by the same rule
             `remove` enforces. Sent from the server so the rail never offers a
             control that would 403, and never has to re-implement the rule. */
          deletableByMe:
            channel.kind !== WorkspaceChannelKind.DIRECT &&
            (channel.createdById === userId || Boolean(canManage)),
        };
      })
      /* Rooms with something in them first, then most recent. An empty channel
         at the top of the rail is a row that never changes. */
      .sort((a, b) => {
        const at = a.lastMessage?.createdAt?.getTime() ?? 0;
        const bt = b.lastMessage?.createdAt?.getTime() ?? 0;
        return bt - at;
      });
  }

  private async lastMessagePerChannel(channelIds: string[]) {
    if (channelIds.length === 0) return new Map<string, { body: string; createdAt: Date; author: string }>();

    const rows = await this.prisma.$queryRaw<
      { channelId: string; body: string; createdAt: Date; firstName: string; lastName: string }[]
    >`
      SELECT m.channelId, m.body, m.createdAt, u.firstName, u.lastName
      FROM workspace_messages m
      JOIN users u ON u.id = m.authorId
      JOIN (
        SELECT channelId, MAX(createdAt) AS latest
        FROM workspace_messages
        WHERE channelId IN (${Prisma.join(channelIds)}) AND deletedAt IS NULL
        GROUP BY channelId
      ) newest ON newest.channelId = m.channelId AND newest.latest = m.createdAt
      WHERE m.deletedAt IS NULL`;

    return new Map(
      rows.map((r) => [
        r.channelId,
        { body: r.body, createdAt: r.createdAt, author: `${r.firstName} ${r.lastName}`.trim() },
      ]),
    );
  }

  // ── membership & authorisation ────────────────────────────────────────────

  /**
   * The gate on every channel read and write.
   *
   * A private channel is *invisible* to a non-member rather than merely
   * read-refused, so this throws NotFound rather than Forbidden for one: a 403
   * on a private room confirms it exists, and who is in it, to somebody who
   * should not know either.
   */
  async assertMember(channelId: string, userId: string) {
    const channel = await this.prisma.workspaceChannel.findUnique({
      where: { id: channelId },
      include: { members: { select: { userId: true, role: true, lastReadAt: true } } },
    });
    if (!channel) throw new NotFoundException(`Channel "${channelId}" not found`);

    const membership = channel.members.find((m) => m.userId === userId);
    if (!membership) {
      if (channel.isPrivate || channel.kind === WorkspaceChannelKind.DIRECT) {
        throw new NotFoundException(`Channel "${channelId}" not found`);
      }
      throw new ForbiddenException('Join this channel to read it');
    }
    return { channel, membership };
  }

  async findOne(channelId: string, userId: string) {
    const { channel } = await this.assertMember(channelId, userId);
    const full = await this.prisma.workspaceChannel.findUniqueOrThrow({
      where: { id: channelId },
      include: { members: { include: { user: { select: PERSON } } } },
    });
    const other = channel.kind === WorkspaceChannelKind.DIRECT
      ? full.members.find((m) => m.userId !== userId)?.user ?? null
      : null;
    return {
      ...full,
      name: full.name ?? (other ? `${other.firstName} ${other.lastName}`.trim() : 'Direct message'),
      counterpart: other,
    };
  }

  // ── writes ────────────────────────────────────────────────────────────────

  async create(dto: CreateChannelDto, user: AuthenticatedUser) {
    const base = channelKey(dto.name);
    /* A duplicate name is a real thing people do; suffix rather than refuse. */
    let key = base;
    for (let n = 2; await this.prisma.workspaceChannel.findUnique({ where: { key } }); n += 1) {
      key = `${base}-${n}`;
    }

    const memberIds = [...new Set([user.id, ...(dto.memberIds ?? [])])];
    const internal = await this.internalOnly(memberIds);

    return this.prisma.workspaceChannel.create({
      data: {
        key,
        name: dto.name.trim(),
        topic: dto.topic?.trim() || null,
        isPrivate: dto.isPrivate ?? false,
        kind: WorkspaceChannelKind.CHANNEL,
        createdById: user.id,
        members: {
          create: internal.map((id) => ({
            userId: id,
            role: id === user.id ? WorkspaceChannelRole.OWNER : WorkspaceChannelRole.MEMBER,
          })),
        },
      },
      include: { members: { include: { user: { select: PERSON } } } },
    });
  }

  /**
   * Delete a channel and everything said in it.
   *
   * Only the person who opened it, or somebody holding `workspace.manage`, may
   * do this — a channel is a shared room, and a member who merely joined it
   * cannot take the room away from the rest. The seeded channels have no
   * creator (`createdById` is null once that user is removed, and the seed
   * writes none), so they can only be removed by a manager, which is the right
   * answer for Operations or General.
   *
   * A DM is refused outright. It is not "yours" to delete — the other person's
   * half of the conversation would go with it, and there is nothing to
   * re-create it from.
   *
   * The messages and the memberships go with the row: both relations are
   * `onDelete: Cascade` in the schema, so this is one statement rather than a
   * hand-rolled sweep that could half-succeed.
   */
  async remove(channelId: string, user: AuthenticatedUser) {
    const { channel } = await this.assertMember(channelId, user.id);

    if (channel.kind === WorkspaceChannelKind.DIRECT) {
      throw new BadRequestException('A direct message cannot be deleted');
    }

    const canManage =
      user.permissions?.includes(WILDCARD_ALL) ||
      user.permissions?.includes(PERMISSIONS.workspace.manage);

    if (channel.createdById !== user.id && !canManage) {
      throw new ForbiddenException('Only the person who created this channel can delete it');
    }

    await this.prisma.workspaceChannel.delete({ where: { id: channelId } });
    return { ok: true, id: channelId };
  }

  async update(channelId: string, dto: UpdateChannelDto, user: AuthenticatedUser) {
    const { channel } = await this.assertMember(channelId, user.id);
    if (channel.kind === WorkspaceChannelKind.DIRECT) {
      throw new BadRequestException('A direct message has no name or topic to change');
    }
    return this.prisma.workspaceChannel.update({
      where: { id: channelId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic?.trim() || null } : {}),
        ...(dto.isPrivate !== undefined ? { isPrivate: dto.isPrivate } : {}),
      },
      include: { members: { include: { user: { select: PERSON } } } },
    });
  }

  async setMembers(channelId: string, dto: SetChannelMembersDto, user: AuthenticatedUser) {
    const { channel } = await this.assertMember(channelId, user.id);
    if (channel.kind === WorkspaceChannelKind.DIRECT) {
      throw new BadRequestException('A direct message is between two people and cannot take more');
    }

    const internal = await this.internalOnly([...new Set(dto.memberIds)]);
    const existing = new Set(channel.members.map((m) => m.userId));
    const next = new Set(internal);

    await this.prisma.$transaction([
      /* Removing somebody drops their `lastReadAt` with them, which is correct:
         re-added later, they should see what they missed as unread. */
      this.prisma.workspaceChannelMember.deleteMany({
        where: { channelId, userId: { in: [...existing].filter((id) => !next.has(id)) } },
      }),
      this.prisma.workspaceChannelMember.createMany({
        data: [...next].filter((id) => !existing.has(id)).map((userId) => ({ channelId, userId })),
        skipDuplicates: true,
      }),
    ]);
    return this.findOne(channelId, user.id);
  }

  /**
   * The DM between me and somebody else — found, or made.
   *
   * `key` is deterministic and unique, so two people opening each other at the
   * same instant race onto one row instead of creating two conversations that
   * each hold half the history. The catch-and-refetch is that race resolving.
   */
  async findOrCreateDirect(otherUserId: string, user: AuthenticatedUser) {
    if (otherUserId === user.id) {
      throw new BadRequestException('You cannot open a direct message with yourself');
    }
    const [other] = await this.internalOnly([otherUserId]);
    if (!other) throw new NotFoundException('That person is not on the Fleetin team');

    const key = directKey(user.id, otherUserId);
    const existing = await this.prisma.workspaceChannel.findUnique({ where: { key } });
    if (existing) return this.findOne(existing.id, user.id);

    try {
      const created = await this.prisma.workspaceChannel.create({
        data: {
          key,
          kind: WorkspaceChannelKind.DIRECT,
          isPrivate: true,
          createdById: user.id,
          members: { create: [{ userId: user.id }, { userId: otherUserId }] },
        },
      });
      return this.findOne(created.id, user.id);
    } catch {
      const raced = await this.prisma.workspaceChannel.findUnique({ where: { key } });
      if (!raced) throw new BadRequestException('Could not open that conversation');
      return this.findOne(raced.id, user.id);
    }
  }

  /** Stamps how far I have read. The whole unread mechanism, server-side. */
  async markRead(channelId: string, userId: string) {
    await this.assertMember(channelId, userId);
    await this.prisma.workspaceChannelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Drops anybody who is not internal staff.
   *
   * The same predicate `GET /users/team` uses — belt and braces, deliberately:
   * a portal account must never be added to an internal room, and a client-sent
   * id list is exactly where that would happen.
   */
  private async internalOnly(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        status: 'ACTIVE',
        shipperId: null,
        partnerId: null,
        role: { name: { notIn: ['SHIPPER', 'TRANSPORTER'] } },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
