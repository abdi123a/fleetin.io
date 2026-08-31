import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ChannelsService } from './channels.service';
import { ProductivityService } from './productivity.service';
import { WorkspaceProductivityController } from './productivity.controller';
import { WORKSPACE_RECURRENCE_QUEUE, WorkspaceRecurrenceProcessor } from './recurrence.processor';
import { WorkspaceChannelsController } from './channels.controller';
import { InboxService } from './inbox.service';
import { MessagesService } from './messages.service';
import { WorkspaceMessagesController } from './messages.controller';
import { WorkspaceNotificationsService } from './notifications.service';
import { RecordAccessService } from './record-access.service';
import { TasksService } from './tasks.service';
import { WorkspaceTasksController } from './tasks.controller';
import { WorkspaceController } from './workspace.controller';

/**
 * The work layer.
 *
 * `RecordAccessService` is the only member that reads a domain table, and it
 * never writes one. That boundary is the module's whole design: Workspace
 * points at shipments, vehicles and invoices; it does not own, copy or
 * recompute anything about them.
 */
@Module({
  imports: [BullModule.registerQueue({ name: WORKSPACE_RECURRENCE_QUEUE })],
  controllers: [
    WorkspaceTasksController,
    WorkspaceMessagesController,
    WorkspaceChannelsController,
    WorkspaceController,
    WorkspaceProductivityController,
  ],
  providers: [
    TasksService,
    MessagesService,
    ChannelsService,
    ProductivityService,
    WorkspaceRecurrenceProcessor,
    InboxService,
    WorkspaceNotificationsService,
    RecordAccessService,
  ],
  exports: [TasksService, WorkspaceNotificationsService],
})
export class WorkspaceModule implements OnModuleInit {
  constructor(@InjectQueue(WORKSPACE_RECURRENCE_QUEUE) private readonly recurrence: Queue) {}

  /**
   * One repeatable job, registered on boot.
   *
   * Hourly rather than daily: a rule created this morning for today should
   * produce its task within the hour, not tomorrow. Running more often than a
   * rule is due costs nothing — `resolveDueOccurrence` returns null for a rule
   * that is not due, and the occurrence index refuses anything that slips past.
   *
   * `jobId` is fixed so a restart re-registers the same schedule instead of
   * stacking a second one on every deploy.
   */
  async onModuleInit(): Promise<void> {
    await this.recurrence.add(
      'generate-due',
      {},
      {
        jobId: 'workspace-recurrence-hourly',
        repeat: { pattern: '5 * * * *' },
        removeOnComplete: true,
      },
    );
  }
}
