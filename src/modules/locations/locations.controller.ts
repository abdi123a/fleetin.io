import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions';

/**
 * The location catalogue, and the road between any two of its entries.
 *
 * `/search` is a proxy in front of Google Places and deliberately the only way
 * the frontend reaches Google: the key stays on this server, so it can be
 * locked to this server's IP rather than to a referrer anybody can forge.
 */
@ApiTags('Locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.locations.view)
  @ApiOperation({ summary: 'Whether Google Maps is configured on this server' })
  status() {
    return this.locationsService.status();
  }

  @Get('search')
  @RequirePermissions(PERMISSIONS.locations.create)
  @ApiOperation({
    summary: 'Search Google Places for a real place. Saves nothing.',
  })
  @ApiQuery({ name: 'q', required: true, example: 'doraleh container terminal' })
  @ApiQuery({ name: 'limit', required: false, example: 8 })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.locationsService.searchPlaces(q, limit ? +limit : undefined);
  }

  @Get('distances')
  @RequirePermissions(PERMISSIONS.locations.view)
  @ApiOperation({ summary: 'Every distance measured so far' })
  distanceBook() {
    return this.locationsService.distanceBook();
  }

  @Get('distance')
  @RequirePermissions(PERMISSIONS.locations.view)
  @ApiOperation({
    summary: 'Road distance between two saved locations, measured once and cached',
  })
  @ApiQuery({ name: 'originId', required: true })
  @ApiQuery({ name: 'destinationId', required: true })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: 'Re-measure instead of reading the cache',
  })
  distance(
    @Query('originId') originId: string,
    @Query('destinationId') destinationId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.locationsService.distanceBetween(originId, destinationId, {
      refresh: refresh === 'true' || refresh === '1',
    });
  }

  @Post('distances/build')
  @RequirePermissions(PERMISSIONS.locations.update)
  @ApiOperation({
    summary: 'Measure every unmeasured pair, so the shipment form never waits on Google',
  })
  @ApiQuery({ name: 'refresh', required: false })
  buildDistances(@Query('refresh') refresh?: string) {
    return this.locationsService.buildDistanceBook({
      refresh: refresh === 'true' || refresh === '1',
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.locations.view)
  @ApiOperation({ summary: 'The location catalogue' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'kind', required: false, example: 'port' })
  @ApiQuery({ name: 'active', required: false, example: 'true' })
  findAll(
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('active') active?: string,
  ) {
    return this.locationsService.findAll({
      search,
      kind,
      active: active === undefined ? undefined : active === 'true' || active === '1',
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.locations.view)
  @ApiOperation({ summary: 'One location' })
  findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.locations.create)
  @ApiOperation({
    summary: 'Save a location — from a Google place id, or by hand with coordinates',
  })
  create(@Body() dto: CreateLocationDto) {
    return this.locationsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.locations.update)
  @ApiOperation({ summary: 'Edit a location. Moving it clears its cached distances.' })
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.locations.delete)
  @ApiOperation({
    summary: 'Retire a location. Soft — shipments that used it still read.',
  })
  remove(@Param('id') id: string) {
    return this.locationsService.remove(id);
  }
}
