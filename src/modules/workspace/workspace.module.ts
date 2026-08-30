import { Module } from '@nestjs/common';
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
  controllers: [WorkspaceTasksController, WorkspaceMessagesController, WorkspaceController],
  providers: [
    TasksService,
    MessagesService,
    InboxService,
    WorkspaceNotificationsService,
    RecordAccessService,
  ],
  exports: [TasksService, WorkspaceNotificationsService],
})
export class WorkspaceModule {}
