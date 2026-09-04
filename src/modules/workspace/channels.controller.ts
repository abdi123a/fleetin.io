import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, QueryMessagesDto, SetChannelMembersDto, UpdateChannelDto } from './dto/channel.dto';
import { MessagesService } from './messages.service';
import { assertInternal } from './workspace-access.util';

@ApiTags('Workspace · Channels')
@ApiBearerAuth()
@Controller('workspace/channels')
export class WorkspaceChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'The rail — my rooms with unread, mention counts and last message' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.listForUser(user);
  }

  /* Declared before `:id` so the literal is not read as a channel id. */
  @Get('direct/:userId')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'The direct message with this person — found, or opened' })
  async direct(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.findOrCreateDirect(userId, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Create a channel' })
  async create(@Body() dto: CreateChannelDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.create(dto, user);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.workspace.view)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.findOne(id, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.workspace.create)
  async update(@Param('id') id: string, @Body() dto: UpdateChannelDto, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Delete a channel you created, and everything in it' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.remove(id, user);
  }

  @Put(':id/members')
  @RequirePermissions(PERMISSIONS.workspace.create)
  @ApiOperation({ summary: 'Replace the member set. Portal accounts are dropped server-side' })
  async setMembers(
    @Param('id') id: string,
    @Body() dto: SetChannelMembersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.channels.setMembers(id, dto, user);
  }

  @Get(':id/messages')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'The river — cursor-paginated on `before`, thread replies excluded' })
  async messagesFor(
    @Param('id') id: string,
    @Query() query: QueryMessagesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertInternal(user);
    return this.messages.channelMessages(id, user.id, query);
  }

  @Post(':id/read')
  @RequirePermissions(PERMISSIONS.workspace.view)
  @ApiOperation({ summary: 'Stamp how far I have read. Server-side, so a refresh keeps it' })
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertInternal(user);
    return this.channels.markRead(id, user.id);
  }
}
