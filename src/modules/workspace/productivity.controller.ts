import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  BulkTaskDto, SetChecklistDto, SetFollowersDto, ToggleChecklistItemDto,
} from './dto/productivity.dto';
import { ProductivityService } from './productivity.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Productivity')
@ApiBearerAuth()
@Controller('workspace')
export class WorkspaceProductivityController {
  constructor(
    private readonly productivity: ProductivityService,
  ) {}

  /* ── Checklist ─────────────────────────────────────────────────────────── */

  @Put('tasks/:idOrRef/checklist')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Replace the whole checklist, in order. Ticks survive a reorder' })
  async setChecklist(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: SetChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.productivity.setChecklist(idOrRef, dto, user);
  }

  @Patch('checklist/:itemId')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Tick or untick one box — its own route because it is the common action' })
  async toggleChecklistItem(
    @Param('itemId') itemId: string,
    @Body() dto: ToggleChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.productivity.toggleChecklistItem(itemId, dto, user);
  }

  /* ── Followers ─────────────────────────────────────────────────────────── */

  @Put('tasks/:idOrRef/followers')
  @RequirePermissions(PERMISSIONS.workspace.create)
  async setFollowers(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: SetFollowersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.productivity.setFollowers(idOrRef, dto, user);
  }

  @Post('tasks/:idOrRef/follow')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Follow this task yourself — updates without owning it' })
  async follow(@Param('idOrRef') idOrRef: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.setOwnFollow(idOrRef, true, user);
  }

  @Delete('tasks/:idOrRef/follow')
  @RequirePermissions(PERMISSIONS.workspace.view)
  async unfollow(@Param('idOrRef') idOrRef: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.setOwnFollow(idOrRef, false, user);
  }

  @Post('tasks/bulk')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'One change, many tasks. Rows the caller may not edit are skipped, not refused' })
  async bulk(@Body() dto: BulkTaskDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.bulk(dto, user);
  }

  @Get('workload')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'One row per teammate — open, overdue, due this week' })
  async workload(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.workload();
  }
}
