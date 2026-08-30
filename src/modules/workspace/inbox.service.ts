import { Injectable } from '@nestjs/common';
import { WorkspaceTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceNotificationsService } from './notifications.service';
import { TasksService } from './tasks.service';

/**
 * "What needs my attention?" — the one question the Inbox answers.
 *
 * Deliberately NOT an activity feed. A chronological river of everything
 * everybody did is a surface people open twice and then never again; this is
 * only things with the reader's name on them. Four sections, and every one of
 * them is something the reader owes somebody or has been asked directly.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: WorkspaceNotificationsService,
    private readonly tasks: TasksService,
  ) {}

  async forUser(userId: string) {
    const [tasks, assignedComments, notifications, unread] = await Promise.all([
      this.prisma.workspaceTask.findMany({
        where: {
          assigneeId: userId,
          deletedAt: null,
          status: { notIn: [WorkspaceTaskStatus.COMPLETED, WorkspaceTaskStatus.CANCELLED] },
        },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          links: true,
        },
        take: 100,
      }),

      /* The assigned comment half. Same Inbox as tasks on purpose: to the
         person who owes it, "review this" and "TSK-00184" are the same job. */
      this.prisma.workspaceMessage.findMany({
        where: { assigneeId: userId, resolvedAt: null, deletedAt: null },
        orderBy: { assignedAt: 'desc' },
        include: {
          author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          assignedBy: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, reference: true, title: true } },
        },
        take: 100,
      }),

      this.notifications.list(userId, 50),
      this.notifications.unreadCount(userId),
    ]);

    /* Same live-status enrichment the board gets — the Inbox draws the same
       chips and must not be the one place they lose their colour. */
    await this.tasks.enrichInboxLinks(tasks);

    return {
      tasks,
      assignedComments,
      notifications,
      counts: {
        tasks: tasks.length,
        assignedComments: assignedComments.length,
        unread,
        overdue: tasks.filter((t) => t.dueAt && t.dueAt < new Date()).length,
      },
    };
  }
}
