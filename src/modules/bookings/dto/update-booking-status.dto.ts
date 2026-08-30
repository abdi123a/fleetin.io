import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

/** Identical vocabulary to `UpdateShipmentStatusDto` — one status ladder, shared. */
const BOOKING_STATUSES = [
  'Pending',
  'Payment Pending',
  'Assigned',
  'Driver Assigned',
  'Heading to Pickup',
  'At Pickup',
  'Loading',
  'Loaded',
  'En Route',
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Empty Ready',
  'Empty Picked Up',
  'Completed',
  'Cancelled',
  'Failed',
] as const;

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BOOKING_STATUSES })
  @IsIn(BOOKING_STATUSES)
  status: (typeof BOOKING_STATUSES)[number];

  /**
   * When the change actually happened, if that is not now.
   *
   * A status is a report of the world, and the world does not wait for the
   * office. Every rung is asked for explicitly now — the box was
   * emptied at the consignee's yard hours before anyone recorded it, and every
   * detention day is counted from that moment, not from the click.
   */
  @ApiPropertyOptional({ description: 'ISO 8601 timestamp of when the change happened. Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
