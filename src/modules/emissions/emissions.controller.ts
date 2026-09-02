import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmissionsService } from './emissions.service';
import { ReplaceRouteDto } from './dto/replace-route.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';
import { ownCompanyScope } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * The carbon read model, and the two writes that maintain it.
 *
 * Gated on `analytics.view` rather than a new `emissions.*` resource: this is
 * a reading of bookings that already exist, and inventing a permission string
 * would hide the module from every role until a data migration wrote it into
 * their grants — see the note above `PERMISSIONS.locations`.
 */
@ApiTags('Emissions')
@ApiBearerAuth()
@Controller('emissions')
export class EmissionsController {
  constructor(private readonly emissions: EmissionsService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.analytics.view)
  @ApiOperation({ summary: 'Every panel of the CO₂ dashboard, over one filtered set' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'transporterId', required: false })
  @ApiQuery({ name: 'vehicleId', required: false })
  @ApiQuery({ name: 'truckType', required: false })
  @ApiQuery({ name: 'shipmentId', required: false, description: 'Id or SHP reference' })
  @ApiQuery({ name: 'bookingId', required: false, description: 'Id or BKG reference' })
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('transporterId') transporterId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('truckType') truckType?: string,
    @Query('shipmentId') shipmentId?: string,
    @Query('bookingId') bookingId?: string,
  ) {
    return this.emissions.dashboard({
      dateFrom,
      dateTo,
      transporterId,
      vehicleId,
      truckType,
      shipmentId,
      bookingId,
      scope: ownCompanyScope(user, { partnerField: 'partnerId' }),
    });
  }

  @Get('filters')
  @RequirePermissions(PERMISSIONS.analytics.view)
  @ApiOperation({ summary: 'What the dashboard filters may be set to' })
  filters() {
    return this.emissions.filterOptions();
  }

  @Get('bookings/:id/route')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: "One booking's measured route, leg by leg" })
  route(@Param('id') id: string) {
    return this.emissions.routeFor(id);
  }

  /**
   * Re-derive the route from what the system recorded and re-measure it.
   *
   * A write, and deliberately an explicit one: measuring a new lane costs a
   * Routes API element, and a booking whose route has not changed should not
   * pay for it on every page view.
   */
  @Post('bookings/:id/route/rebuild')
  @RequirePermissions(PERMISSIONS.bookings.update)
  @ApiOperation({ summary: "Rebuild and re-measure a booking's route, then re-price its carbon" })
  rebuild(@Param('id') id: string) {
    return this.emissions.rebuildRoute(id);
  }

  /** The route as an operator says it actually went — see `replaceRoute`. */
  @Post('bookings/:id/route')
  @RequirePermissions(PERMISSIONS.bookings.update)
  @ApiOperation({ summary: "Record the booking's real movement as an ordered list of stops" })
  replaceRoute(@Param('id') id: string, @Body() dto: ReplaceRouteDto) {
    return this.emissions.replaceRoute(id, dto.stops);
  }
}
