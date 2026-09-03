import { Module } from '@nestjs/common';
import { EmptyReturnsController } from './empty-returns.controller';
import { EmptyReturnsService } from './empty-returns.service';
import { EmissionsModule } from '../emissions/emissions.module';

/**
 * Deliberately does not import `BookingsModule` — `BookingsModule` imports
 * this one instead (bookings need to notify empty-returns of status changes;
 * empty-returns writes to bookings directly via Prisma, not through
 * `BookingsService`), so the two never form a cycle.
 *
 * `EmissionsModule` is imported for `CarbonImpactService`: a pairing's
 * impact is judged the moment its next load lands, which this module is the
 * first to know. Emissions imports only Locations, so no cycle there either.
 */
@Module({
  imports: [EmissionsModule],
  controllers: [EmptyReturnsController],
  providers: [EmptyReturnsService],
  exports: [EmptyReturnsService],
})
export class EmptyReturnsModule {}
