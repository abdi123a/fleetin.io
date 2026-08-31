import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkspaceRecordType } from '@prisma/client';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { SetTaskLinksDto } from './dto/set-task-links.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Tasks')
@ApiBearerAuth()
@Controller('workspace/tasks')
export class WorkspaceTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('counts')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Open-task counts for records — the number beside every Raise button' })
  @ApiQuery({ name: 'recordIds', description: 'Comma-separated ids or references' })
  async counts(
    @Query('recordType') recordType: WorkspaceRecordType,
    @Query('recordIds') recordIds: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tasks.countsForRecords(recordType, (recordIds ?? '').split(',').filter(Boolean));
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Totals per scope tab — declared above :idOrRef so it is not read as a reference' })
  async summary(@Query() query: QueryTasksDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tasks.summary(query, user.id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Tasks, filtered and paginated server-side' })
  async findAll(@Query() query: QueryTasksDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tasks.findAll(query, user);
  }

  @Get(':idOrRef')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'One task with its conversation and history — by TSK reference or id' })
  async findOne(@Param('idOrRef') idOrRef: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tasks.findOne(idOrRef);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Raise a task. Records and assignee are both optional' })
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tasks.create(dto, user);
  }

  @Patch(':idOrRef')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Edit a task — every changed field writes an event' })
  async update(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tasks.update(idOrRef, dto, user);
  }

  @Put(':idOrRef/links')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Replace the whole link set — an empty array unlinks everything' })
  async setLinks(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: SetTaskLinksDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tasks.setLinks(idOrRef, dto.links, user);
  }
}
