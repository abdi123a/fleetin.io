import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaymentOrdersService } from './payment-orders.service';
import { PayTransporterDto } from './dto/pay-transporter.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Payment Orders')
@ApiBearerAuth()
@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(private readonly paymentOrdersService: PaymentOrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'List transporter payment orders' })
  @ApiQuery({ name: 'transporterId', required: false })
  @ApiQuery({ name: 'shipmentId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @Query('transporterId') transporterId?: string,
    @Query('shipmentId') shipmentId?: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.paymentOrdersService.findAll({ transporterId, shipmentId, status, page: +page, limit: +limit });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.finance.view)
  @ApiOperation({ summary: 'Get a payment order by ID or number' })
  findOne(@Param('id') id: string) {
    return this.paymentOrdersService.findOne(id);
  }

  @Post('pay-transporter')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({
    summary:
      'Pay one transporter their share of one shipment — sums only that transporter\'s own bookings, guarded by shipment release + no open hold + not already paid',
  })
  payTransporter(@Body() dto: PayTransporterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentOrdersService.payTransporter(dto, user.id, `${user.firstName} ${user.lastName}`.trim());
  }
}
