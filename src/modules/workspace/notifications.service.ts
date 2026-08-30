import { Injectable } from '@nestjs/common';
import { WorkspaceNotificationKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface NotifyInput {
  userIds: string[];
  kind: WorkspaceNotificationKind;
  actorId: string;
  taskId?: string | null;
  messageId?: string | null;
}

/**
 * Everything that reaches the bell goes through here.
 *
 * One rule, applied in one place: **nobody is ever notified about their own
 * action.** Assigning a task to yourself, mentioning yourself, resolving your
 * own comment — none of it should light up your own bell, and filtering the
 * actor out centrally means no caller can forget.
 *
 * There is no email or SMS. The Settings notification matrix
 * (`NotificationsSection.tsx`) writes channel preferences to localStorage and
 * is read by nothing; it does not govern this and should not be mistaken for
 * working configuration.
 */
@Injectable()
export class WorkspaceNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify({ userIds, kind, actorId, taskId, messageId }: NotifyInput): Promise<void> {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== actorId);
    if (recipients.length === 0) return;

    await this.prisma.workspaceNotification.createMany({
      data: recipients.map((userId) => ({
        userId,
        kind,
        actorId,
        taskId: taskId ?? null,
        messageId: messageId ?? null,
      })),
    });
  }

  /** The bell's badge, and the Inbox's per-section counts. */
  async unreadCount(userId: string): Promise<number> {
    return this.prisma.workspaceNotification.count({ where: { userId, readAt: null } });
  }

  async list(userId: string, take = 30) {
    return this.prisma.workspaceNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        task: { select: { id: true, reference: true, title: true, status: true } },
        message: { select: { id: true, body: true, taskId: true, recordType: true, recordRef: true } },
      },
    });
  }

  /** Mark some, or everything. Read state is server-side so it survives a refresh. */
  async markRead(userId: string, ids?: string[]): Promise<{ updated: number }> {
    const result = await this.prisma.workspaceNotification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
