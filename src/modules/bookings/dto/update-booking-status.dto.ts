import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Identical vocabulary to `UpdateShipmentStatusDto` — one status ladder, shared. */
const BOOKING_STATUSES = [
  'Pending',
  'Payment Pending',
  'Assigned',
  'Driver Assigned',
  'En Route',
  'Arrived',
  'Loading',
  'Unloading',
  'POD Submitted',
  'Completed',
  'Cancelled',
  'Failed',
] as const;

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BOOKING_STATUSES })
  @IsIn(BOOKING_STATUSES)
  status: (typeof BOOKING_STATUSES)[number];
}
