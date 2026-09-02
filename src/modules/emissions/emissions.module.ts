import { Module } from '@nestjs/common';
import { EmissionsController } from './emissions.controller';
import { EmissionsService } from './emissions.service';
import { LocationsModule } from '../locations/locations.module';

/**
 * Carbon. Reads bookings, measures roads through `LocationsModule`'s cache.
 *
 * Exported because `BookingsModule` calls `snapshotFactor` the moment a truck
 * is put on a job — the snapshot has to happen inside the assignment, not on
 * some later sweep, or a booking exists briefly with a vehicle and no factor.
 */
@Module({
  imports: [LocationsModule],
  controllers: [EmissionsController],
  providers: [EmissionsService],
  exports: [EmissionsService],
})
export class EmissionsModule {}
