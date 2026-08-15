import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const SHIPMENT_STATUSES = [
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

export class UpdateShipmentStatusDto {
  @ApiProperty({ enum: SHIPMENT_STATUSES })
  @IsIn(SHIPMENT_STATUSES)
  status: (typeof SHIPMENT_STATUSES)[number];
}
