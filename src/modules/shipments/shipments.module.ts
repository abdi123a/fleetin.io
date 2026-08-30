import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  // One-directional: Shipments → Bookings → EmptyReturns. Bookings reaches
  // back to Shipments only through the plain `shipment-sync` function, never
  // by injecting `ShipmentsService`, which is what keeps this from cycling.
  imports: [BookingsModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
