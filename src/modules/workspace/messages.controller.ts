import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkspaceRecordType } from '@prisma/client';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AssignMessageDto, CreateMessageDto, UpdateMessageDto } from './dto/message.dto';
import { MessagesService } from './messages.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Messages')
@ApiBearerAuth()
@Controller('workspace/messages')
export class WorkspaceMessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'A thread — by taskId, or by recordType + recordId' })
  async findMany(
    @Query('taskId') taskId: string | undefined,
    @Query('recordType') recordType: WorkspaceRecordType | undefined,
    @Query('recordId') recordId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.messages.findMany({ taskId, recordType, recordId });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Post a message. `assigneeId` makes it an assigned comment' })
  async create(@Body() dto: CreateMessageDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Edit — author only, never overridable by workspace.manage' })
  async update(@Param('id') id: string, @Body() dto: UpdateMessageDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Withdraw — soft, author only. The row keeps its place in the thread' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.remove(id, user);
  }

  @Put(':id/assignee')
  @RequirePermissions(PERMISSIONS.workspace.assign)
  @ApiOperation({ summary: 'Assign this comment to somebody. Null clears it' })
  async assign(@Param('id') id: string, @Body() dto: AssignMessageDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.assign(id, dto, user);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Resolve an assigned comment — notifies whoever asked' })
  async resolve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.setResolved(id, true, user);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Reopen a resolved comment' })
  async reopen(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.messages.setResolved(id, false, user);
  }
}
