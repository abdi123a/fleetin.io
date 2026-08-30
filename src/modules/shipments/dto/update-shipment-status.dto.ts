import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/**
 * Only the two a shipment can still be given by hand. Every happy-path status
 * is derived from the shipment's bookings — see `deriveShipmentStatus` and
 * `MANUAL_SHIPMENT_STATUSES` in `shipment-status.util.ts`. Rejecting the rest
 * at the DTO gives a clear 400 instead of a write the next booking undoes.
 */
const SHIPMENT_STATUSES = ['Cancelled', 'Failed'] as const;

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: SHIPMENT_STATUSES })
  @IsIn(SHIPMENT_STATUSES)
  status: (typeof SHIPMENT_STATUSES)[number];
}
