import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { EmptyReturnsModule } from '../empty-returns/empty-returns.module';
import { EmissionsModule } from '../emissions/emissions.module';

@Module({
  imports: [EmptyReturnsModule, EmissionsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
