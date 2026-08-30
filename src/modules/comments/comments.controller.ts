import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * ## Why every route here asks for `shipments.view`
 *
 * Commenting is a write, so the reflex is to gate it on `shipments.update`.
 * That would be wrong for what this is: the point of the thread is that
 * *everybody who can open the shipment* can say something on it and read
 * what everybody else said. Gating the composer on update permission would
 * mute exactly the people a handover note is usually for — whoever is looking
 * at the job without owning it.
 *
 * It also avoids a failure this codebase has been bitten by: a brand-new
 * permission string is absent from every role row that already exists, so the
 * feature ships as a 403 until a data migration catches up. Reusing the
 * permission that already governs "can this person see this shipment" means
 * the thread works the day it deploys, for exactly the audience that should
 * have it.
 *
 * Authorship is enforced in the service, not here: edit and delete are the
 * author's alone, which is not a thing the permission vocabulary can express.
 */
@ApiTags('Comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('shipments/:shipmentId/comments')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: "A shipment's thread, oldest first — every comment on it, or just one booking's" })
  @ApiQuery({
    name: 'bookingId',
    required: false,
    description: "Only the comments scoped to this booking (id or reference). Omitted, the whole shipment's thread.",
  })
  findForShipment(
    @Param('shipmentId') shipmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('bookingId') bookingId?: string,
  ) {
    return this.commentsService.findForShipment(shipmentId, user, bookingId);
  }

  @Post('shipments/:shipmentId/comments')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'Say something on this shipment, or on one of its containers' })
  create(
    @Param('shipmentId') shipmentId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.commentsService.create(shipmentId, dto, user);
  }

  @Patch('comments/:id')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'Rewrite your own comment — author only, and it is marked as edited' })
  update(@Param('id') id: string, @Body() dto: UpdateCommentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.commentsService.update(id, dto, user);
  }

  @Delete('comments/:id')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'Withdraw your own comment — author only; the row keeps its place in the thread' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.commentsService.remove(id, user);
  }
}
