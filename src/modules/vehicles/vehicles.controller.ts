import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VehiclesService } from './vehicles.service';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Flat, all-partners read/update/delete view — the direct equivalent of the
 * frontend's getAllVehicles(). Creation is deliberately absent here: DD-02
 * means a vehicle only ever comes into existence under a partner, via
 * POST /partners/:id/vehicles (see PartnersController).
 */
@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.vehicles.view)
  @ApiOperation({ summary: 'Vehicles with insurance or registration expiring soon' })
  @ApiQuery({ name: 'withinDays', required: false, example: 30 })
  expiring(@Query('withinDays') withinDays = 30) {
    return this.vehiclesService.expiring(+withinDays);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.vehicles.view)
  @ApiOperation({ summary: 'List vehicles across every partner' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'truckType', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('truckType') truckType?: string,
    @Query('partnerId') partnerId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.vehiclesService.findAll({
      search,
      status,
      truckType,
      partnerId,
      page: +page,
      limit: +limit,
      scope: ownCompanyScope(user, { partnerField: 'partnerId' }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.vehicles.view)
  @ApiOperation({ summary: 'Get a vehicle by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findOne(id, ownCompanyScope(user, { partnerField: 'partnerId' }));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.vehicles.update)
  @ApiOperation({ summary: 'Update a vehicle' })
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @Patch(':id/assign-driver')
  @RequirePermissions(PERMISSIONS.vehicles.update)
  @ApiOperation({ summary: 'Assign or unassign this vehicle’s driver' })
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.vehiclesService.assignDriver(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.vehicles.delete)
  @ApiOperation({ summary: 'Soft-delete a vehicle' })
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
