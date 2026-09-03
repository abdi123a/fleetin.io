import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmissionsService } from './emissions.service';
import { CarbonImpactService } from './carbon-impact.service';
import { avoidanceRate } from './carbon-impact.util';
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
 *
 * Two figures ride together and are never one: what was emitted, from
 * `EmissionsService`, and what Fleetin stopped being driven, from
 * `CarbonImpactService`. The dashboard carries both blocks side by side so a
 * reader can hold them apart; nothing here subtracts one from the other.
 */
@ApiTags('Emissions')
@ApiBearerAuth()
@Controller('emissions')
export class EmissionsController {
  constructor(
    private readonly emissions: EmissionsService,
    private readonly impact: CarbonImpactService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.analytics.view)
  @ApiOperation({ summary: 'Every panel of the CO₂ dashboard, over one filtered set — emitted and avoided, kept apart' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-12-31' })
  @ApiQuery({ name: 'transporterId', required: false })
  @ApiQuery({ name: 'vehicleId', required: false })
  @ApiQuery({ name: 'truckType', required: false })
  @ApiQuery({ name: 'shipmentId', required: false, description: 'Id or SHP reference' })
  @ApiQuery({ name: 'bookingId', required: false, description: 'Id or BKG reference' })
  async dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('transporterId') transporterId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('truckType') truckType?: string,
    @Query('shipmentId') shipmentId?: string,
    @Query('bookingId') bookingId?: string,
  ) {
    const filters = {
      dateFrom,
      dateTo,
      transporterId,
      vehicleId,
      truckType,
      shipmentId,
      bookingId,
      scope: ownCompanyScope(user, { partnerField: 'partnerId' }),
    };
    const [dashboard, impact] = await Promise.all([
      this.emissions.dashboard(filters),
      this.impact.summary(filters),
    ]);
    return {
      ...dashboard,
      impact: {
        ...impact,
        /* The one place both figures are in hand: the road that was driven
           and the road that was not, over the same filters. The rate is the
           avoided share of their sum — the only baseline this data can
           defend — and it is null, not a guess, when either side is empty. */
        avoidanceRate: avoidanceRate(impact.distanceAvoidedKm, dashboard.kpis.totalDistanceKm),
      },
    };
  }

  @Get('filters')
  @RequirePermissions(PERMISSIONS.analytics.view)
  @ApiOperation({ summary: 'What the dashboard filters may be set to' })
  filters() {
    return this.emissions.filterOptions();
  }

  @Get('bookings/:id/route')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: "One booking's measured route, leg by leg, and the continuations it is an end of" })
  async route(@Param('id') id: string) {
    const [route, impacts] = await Promise.all([this.emissions.routeFor(id), this.impact.forBooking(id)]);
    return { ...route, impacts };
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
  async replaceRoute(@Param('id') id: string, @Body() dto: ReplaceRouteDto) {
    const result = await this.emissions.replaceRoute(id, dto.stops);
    /* A recorded garage stop is Case 3 — the match was not realized after
       all — so the verdict is re-read from the legs that were just written. */
    await this.impact.evaluateForBooking(id);
    return result;
  }

  @Get('shipments/:id/impact')
  @RequirePermissions(PERMISSIONS.bookings.view)
  @ApiOperation({ summary: "A shipment's Fleetin Impact — the repositioning its containers' continuations eliminated" })
  shipmentImpact(@Param('id') id: string) {
    return this.impact.forShipment(id);
  }

  /**
   * Judge every pairing in the book from what is on record.
   *
   * For the cycles that existed before the impact record did, and for a
   * garage set after the fact — a transporter whose garage was recorded
   * today has continuations from last month that can now be measured.
   */
  @Post('impact/rebuild')
  @RequirePermissions(PERMISSIONS.bookings.update)
  @ApiOperation({ summary: 'Re-evaluate every pairing’s Fleetin Impact from the bookings’ own rungs' })
  rebuildImpact() {
    return this.impact.rebuildAll();
  }
}
