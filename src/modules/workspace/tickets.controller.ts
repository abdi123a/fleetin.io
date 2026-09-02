import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WorkspaceRecordType,
  WorkspaceTaskPriority,
  WorkspaceTaskStatus,
} from '@prisma/client';

import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateTicketDto, RaiseTicketTaskDto, UpdateTicketDto } from './dto/ticket.dto';
import { TicketsService } from './tickets.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Tickets')
@ApiBearerAuth()
@Controller('workspace/tickets')
export class WorkspaceTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  /* Declared above `:idOrRef` so "summary" is not read as a reference. */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Counts per queue tab' })
  async summary(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tickets.summary(user.id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'The ticket queue — urgent first, then oldest' })
  @ApiQuery({ name: 'scope', required: false, enum: ['open', 'unassigned', 'closed', 'all', 'mine'] })
  async list(
    @Query('scope') scope: 'open' | 'unassigned' | 'closed' | 'all' | 'mine',
    @Query('status') status: WorkspaceTaskStatus,
    @Query('priority') priority: WorkspaceTaskPriority,
    @Query('recordType') recordType: WorkspaceRecordType,
    @Query('recordId') recordId: string,
    @Query('assigneeId') assigneeId: string,
    @Query('q') q: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tickets.list(
      {
        scope,
        status,
        priority,
        recordType,
        recordId,
        assigneeId,
        q,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      user.id,
    );
  }

  @Get(':idOrRef')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'One ticket, by id or TKT- reference' })
  async findOne(@Param('idOrRef') idOrRef: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tickets.findOne(idOrRef);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Log a problem somebody reported' })
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tickets.create(dto, user);
  }

  @Patch(':idOrRef')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({
    summary: 'Edit a ticket. Status is refused once a task is attached — move the task instead',
  })
  async update(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tickets.update(idOrRef, dto, user);
  }

  @Post(':idOrRef/task')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Raise the task that answers this ticket, and join the two' })
  async raiseTask(
    @Param('idOrRef') idOrRef: string,
    @Body() dto: RaiseTicketTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.tickets.raiseTask(idOrRef, dto, user);
  }

  @Delete(':idOrRef')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Withdraw a ticket that should never have been logged' })
  async remove(@Param('idOrRef') idOrRef: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.tickets.remove(idOrRef, user);
  }
}
