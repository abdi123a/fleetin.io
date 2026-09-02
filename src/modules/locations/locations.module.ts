import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { GoogleMapsService } from './google-maps.service';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, GoogleMapsService],
  /* Exported because BI resolves a shipment's coordinates from this catalogue
   * (see `bi-geo.ts`) and Shipments measures its own distance through it. */
  exports: [LocationsService, GoogleMapsService],
})
export class LocationsModule {}
