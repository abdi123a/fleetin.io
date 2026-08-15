import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HoldsService } from './holds.service';
import { CreateHoldDto } from './dto/create-hold.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Payout Holds')
@ApiBearerAuth()
@Controller()
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post('shipments/:shipmentId/holds')
  @RequirePermissions(PERMISSIONS.finance.create)
  @ApiOperation({ summary: 'Raise a hold — pauses this shipment (or one of its bookings) from payout' })
  raise(@Param('shipmentId') shipmentId: string, @Body() dto: CreateHoldDto, @CurrentUser() user: AuthenticatedUser) {
    return this.holdsService.raise(shipmentId, dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Get('shipments/:shipmentId/holds')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: "A shipment's holds, newest first" })
  findForShipment(@Param('shipmentId') shipmentId: string) {
    return this.holdsService.findForShipment(shipmentId);
  }

  @Get('holds')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Every hold book-wide, newest first — for the Finance overview' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'cleared'] })
  findAll(@Query('status') status?: 'open' | 'cleared') {
    return this.holdsService.findAll(status);
  }

  @Patch('holds/:id/clear')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({ summary: 'Clear a hold — a no-op if already cleared' })
  clear(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.holdsService.clear(id, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
