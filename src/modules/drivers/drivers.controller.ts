import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Flat, all-partners read/update/delete view — the direct equivalent of the
 * frontend's getAllDrivers(). Creation is deliberately absent here: DD-02
 * means a driver only ever comes into existence under a partner, via
 * POST /partners/:id/drivers (see PartnersController).
 */
@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get('expiring')
  @RequirePermissions(PERMISSIONS.drivers.view)
  @ApiOperation({ summary: 'Drivers with a license expiring soon' })
  @ApiQuery({ name: 'withinDays', required: false, example: 30 })
  expiring(@Query('withinDays') withinDays = 30) {
    return this.driversService.expiring(+withinDays);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.drivers.view)
  @ApiOperation({ summary: 'List drivers across every partner' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'partnerId', required: false })
  @ApiQuery({ name: 'licenseExpiringWithinDays', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 25 })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('partnerId') partnerId?: string,
    @Query('licenseExpiringWithinDays') licenseExpiringWithinDays?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 25,
  ) {
    return this.driversService.findAll({
      search,
      status,
      partnerId,
      licenseExpiringWithinDays: licenseExpiringWithinDays ? +licenseExpiringWithinDays : undefined,
      page: +page,
      limit: +limit,
      scope: ownCompanyScope(user, { partnerField: 'partnerId' }),
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.drivers.view)
  @ApiOperation({ summary: 'Get a driver by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.driversService.findOne(id, ownCompanyScope(user, { partnerField: 'partnerId' }));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.drivers.update)
  @ApiOperation({ summary: 'Update a driver' })
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.drivers.delete)
  @ApiOperation({ summary: 'Soft-delete a driver' })
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }
}
