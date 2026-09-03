import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { SetShipmentCrewDto } from './dto/set-shipment-crew.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { isPortalAccount, ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('Shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('kpis')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'The header KPI tiles: total, active, delayed, pending assignment' })
  kpis(@CurrentUser() user: AuthenticatedUser) {
    return this.shipmentsService.kpis(ownCompanyScope(user, { shipperField: 'shipperId', partnerField: 'partnerId' }));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'List shipments — row-scoped to the caller’s own company for portal users' })
  @ApiQuery({ name: 'searchKeyword', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @ApiQuery({ name: 'customerId', required: false, description: 'Shipper id' })
  @ApiQuery({ name: 'transporterId', required: false, description: 'Partner id' })
  @ApiQuery({ name: 'driverId', required: false })
  @ApiQuery({ name: 'vehicleId', required: false })
  @ApiQuery({ name: 'cargoType', required: false })
  @ApiQuery({ name: 'containerNumber', required: false })
  @ApiQuery({ name: 'route', required: false })
  @ApiQuery({
    name: 'assigneeId',
    required: false,
    description: "Staff member on the shipment's crew. The literal 'unassigned' returns the shipments nobody is on.",
  })
  @ApiQuery({ name: 'datePreset', required: false, description: 'all | today | week | month | custom' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sortBy', required: false, description: 'plate:asc | booking:asc | date:desc | customer:asc' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('searchKeyword') searchKeyword?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('customerId') customerId?: string,
    @Query('transporterId') transporterId?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('cargoType') cargoType?: string,
    @Query('containerNumber') containerNumber?: string,
    @Query('route') route?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('datePreset') datePreset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.shipmentsService.findAll({
      searchKeyword,
      status,
      paymentStatus,
      customerId,
      transporterId,
      driverId,
      vehicleId,
      cargoType,
      containerNumber,
      route,
      assigneeId,
      datePreset,
      startDate,
      endDate,
      sortBy,
      // Which of our people is on a job is our staffing, not the customer's.
      includeCrew: !isPortalAccount(user),
      page: +page,
      limit: +limit,
      scope: ownCompanyScope(user, { shipperField: 'shipperId', partnerField: 'partnerId' }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.shipments.view)
  @ApiOperation({ summary: 'Get a shipment by ID, including its status timeline' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipmentsService.findOne(
      id,
      ownCompanyScope(user, { shipperField: 'shipperId', partnerField: 'partnerId' }),
      !isPortalAccount(user),
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.shipments.create)
  @ApiOperation({ summary: 'Create a shipment — the rate is always server-computed, never accepted from the client (BR-2.6)' })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.shipmentsService.create(dto, `${user.firstName} ${user.lastName}`.trim(), user.id);
  }


  @Put(':id/assignees')
  @RequirePermissions(PERMISSIONS.shipments.update)
  @ApiOperation({
    summary: 'Set the whole crew on this shipment — the Fleetin staff working it. Replaces the current set.',
  })
  setAssignees(
    @Param('id') id: string,
    @Body() dto: SetShipmentCrewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shipmentsService.setAssignees(id, dto.userIds, dto.leadUserId, user.id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.shipments.update)
  @ApiOperation({ summary: 'Update non-status fields (driver/vehicle assignment, route details, etc.)' })
  update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.shipmentsService.update(id, dto);
  }

  @Patch(':id/pay-transporter')
  @RequirePermissions(PERMISSIONS.finance.approve)
  @ApiOperation({
    summary:
      "Record that the transporter has been paid for this shipment — one payment per shipment, never per container. Idempotent; refuses undelivered or unpriced work.",
  })
  payTransporter(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipmentsService.payTransporter(id, user.id, `${user.firstName} ${user.lastName}`.trim());
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.shipments.update)
  @ApiOperation({ summary: 'Move the shipment to its next status — validated server-side against the status ladder (BR-2.1/2.2/2.3)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateShipmentStatusDto) {
    return this.shipmentsService.updateStatus(id, dto);
  }


  @Delete(':id')
  @RequirePermissions(PERMISSIONS.shipments.delete)
  @ApiOperation({ summary: 'Soft-delete a shipment' })
  remove(@Param('id') id: string) {
    return this.shipmentsService.remove(id);
  }
}
