import { Module } from '@nestjs/common';
import { EmissionsController } from './emissions.controller';
import { EmissionsService } from './emissions.service';
import { CarbonImpactService } from './carbon-impact.service';
import { LocationsModule } from '../locations/locations.module';

/**
 * Carbon. Reads bookings, measures roads through `LocationsModule`'s cache.
 *
 * Two services, two questions. `EmissionsService` prices what the trucks
 * drove; `CarbonImpactService` records what a realized match stopped them
 * driving. They share the road cache and nothing else — neither ever writes
 * the other's columns.
 *
 * Exported because `BookingsModule` calls `snapshotFactor` the moment a truck
 * is put on a job — the snapshot has to happen inside the assignment, not on
 * some later sweep, or a booking exists briefly with a vehicle and no factor —
 * and because `EmptyReturnsModule` judges a pairing's impact the moment the
 * next load lands.
 */
@Module({
  imports: [LocationsModule],
  controllers: [EmissionsController],
  providers: [EmissionsService, CarbonImpactService],
  exports: [EmissionsService, CarbonImpactService],
})
export class EmissionsModule {}
