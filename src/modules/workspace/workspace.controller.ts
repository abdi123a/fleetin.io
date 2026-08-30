import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { InboxService } from './inbox.service';
import { WorkspaceNotificationsService } from './notifications.service';
import { RecordAccessService } from './record-access.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace')
@ApiBearerAuth()
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly inbox: InboxService,
    private readonly notifications: WorkspaceNotificationsService,
    private readonly records: RecordAccessService,
  ) {}

  @Get('inbox')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'What needs my attention — my tasks, comments assigned to me, mentions' })
  async getInbox(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.inbox.forUser(user.id);
  }

  @Get('unread')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: "The bell's badge — deliberately cheap, it is polled" })
  async unread(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Get('notifications')
  @RequirePermissions(PERMISSIONS.workspace.view)
  async list(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.notifications.list(user.id);
  }

  @Post('notifications/read')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Mark read. No ids means everything — read state is server-side' })
  async markRead(@Body('ids') ids: string[] | undefined, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.notifications.markRead(user.id, ids);
  }

  @Get('records/search')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: "The composer's `/` menu — one call across every record type" })
  @ApiQuery({ name: 'q', description: 'A reference or free text. A reference narrows to one type' })
  async searchRecords(@Query('q') q: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.records.search(q ?? '');
  }
}
