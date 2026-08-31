import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  BulkTaskDto, CreateRecurrenceDto, CreateTemplateDto, SetChecklistDto,
  SetFollowersDto, ToggleChecklistItemDto, UpdateRecurrenceDto, UseTemplateDto,
} from './dto/productivity.dto';
import { ProductivityService } from './productivity.service';
import { WorkspaceRecurrenceProcessor } from './recurrence.processor';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Productivity')
@ApiBearerAuth()
@Controller('workspace')
export class WorkspaceProductivityController {
  constructor(
    private readonly productivity: ProductivityService,
    private readonly recurrence: WorkspaceRecurrenceProcessor,
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

  /* ── Templates ─────────────────────────────────────────────────────────── */

  @Get('templates')
  @RequirePermissions(PERMISSIONS.workspace.view)
  async templates(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.listTemplates();
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.workspace.manage)
  async createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.createTemplate(dto, user);
  }

  @Delete('templates/:id')
  @RequirePermissions(PERMISSIONS.workspace.manage)
  @ApiOperation({ summary: 'Archive — never deleted, because tasks reference having used it' })
  async archiveTemplate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.archiveTemplate(id);
  }

  @Post('templates/:id/use')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Raise a task from a template, optionally attached to a record' })
  async useTemplate(
    @Param('id') id: string,
    @Body() dto: UseTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.productivity.useTemplate(id, dto, user);
  }

  /* ── Recurrence ────────────────────────────────────────────────────────── */

  @Get('recurrences')
  @RequirePermissions(PERMISSIONS.workspace.view)
  async recurrences(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.listRecurrences();
  }

  @Post('recurrences')
  @RequirePermissions(PERMISSIONS.workspace.create)
  async createRecurrence(@Body() dto: CreateRecurrenceDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.createRecurrence(dto, user);
  }

  @Patch('recurrences/:id')
  @RequirePermissions(PERMISSIONS.workspace.create)
  async updateRecurrence(
    @Param('id') id: string,
    @Body() dto: UpdateRecurrenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.productivity.updateRecurrence(id, dto);
  }

  @Delete('recurrences/:id')
  @RequirePermissions(PERMISSIONS.workspace.manage)
  async deleteRecurrence(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.productivity.deleteRecurrence(id);
  }

  @Post('recurrences/run')
  @RequirePermissions(PERMISSIONS.workspace.manage)
  @ApiOperation({
    summary: 'Run every due rule now. Safe to call twice — the occurrence index refuses a duplicate',
  })
  async runRecurrences(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.recurrence.runDueRules();
  }

  /* ── Bulk & workload ───────────────────────────────────────────────────── */

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
