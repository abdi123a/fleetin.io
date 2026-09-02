import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ProductivityService } from './productivity.service';
import { WorkspaceProductivityController } from './productivity.controller';
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
    InboxService,
    WorkspaceNotificationsService,
    RecordAccessService,
  ],
  exports: [TasksService, WorkspaceNotificationsService],
})
/*
 * No queue, and no `onModuleInit`.
 *
 * Recurring tasks were removed on 2026-08-31 — one rule ever existed and it
 * was a test one. Their processor was this application's only BullMQ job, and
 * it registered itself here with an unguarded `await queue.add(...)` on a
 * connection configured `maxRetriesPerRequest: null`. An unreachable Redis at
 * boot therefore did not degrade recurring tasks: it hung Nest's bootstrap
 * forever and the whole API never came up. That risk leaves with the feature.
 */
export class WorkspaceModule {}
