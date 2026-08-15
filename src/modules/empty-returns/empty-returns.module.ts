import { Module } from '@nestjs/common';
import { EmptyReturnsController } from './empty-returns.controller';
import { EmptyReturnsService } from './empty-returns.service';

/**
 * Deliberately does not import `BookingsModule` — `BookingsModule` imports
 * this one instead (bookings need to notify empty-returns of status changes;
 * empty-returns writes to bookings directly via Prisma, not through
 * `BookingsService`), so the two never form a cycle.
 */
@Module({
  controllers: [EmptyReturnsController],
  providers: [EmptyReturnsService],
  exports: [EmptyReturnsService],
})
export class EmptyReturnsModule {}
