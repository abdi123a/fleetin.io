import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Non-status edits — everything here is a plain field update. Reassigning
 * the shipper or the carrier after creation isn't supported (that's a new
 * shipment in practice); status moves exclusively through
 * `PATCH /shipments/:id/status`.
 */
export class UpdateShipmentDto {
  @ApiPropertyOptional({ description: 'Assign or change the driver' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Assign or change the vehicle' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ enum: ['Paid', 'Pending', 'Overdue', 'Partially Paid'] })
  @IsOptional()
  @IsIn(['Paid', 'Pending', 'Overdue', 'Partially Paid'])
  paymentStatus?: string;

  /** Re-point the pickup at a catalogued location. Re-measures the distance. */
  @ApiPropertyOptional({ description: 'Location.id, from the Locations catalogue' })
  @IsOptional()
  @IsString()
  pickupLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocationAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupGateOrTerminal?: string;

  /** Re-point the drop-off at a catalogued location. Re-measures the distance. */
  @ApiPropertyOptional({ description: 'Location.id, from the Locations catalogue' })
  @IsOptional()
  @IsString()
  deliveryLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryLocationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryLocationAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryLocationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryGateOrTerminal?: string;

  /**
   * Override the measured distance. Only honoured together with
   * `estimatedDistanceSource: 'manual'` — otherwise a re-measurement of a moved
   * route wins, because the road is not a matter of opinion.
   */
  @ApiPropertyOptional({ example: 24.6 })
  @IsOptional()
  @IsNumber()
  estimatedDistanceKm?: number;

  @ApiPropertyOptional({ enum: ['google', 'manual', 'estimate'] })
  @IsOptional()
  @IsIn(['google', 'manual', 'estimate'])
  estimatedDistanceSource?: string;

  @ApiPropertyOptional({ example: '1h 15m' })
  @IsOptional()
  @IsString()
  estimatedDurationHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  goodsDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalWeightKg?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredDocuments?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerReturnDepot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  containerReturnFreeDays?: number;

  @ApiPropertyOptional({ description: 'What Fleetin bills the shipper, FDJ minor units — set by Finance once known, not collected at creation.' })
  @IsOptional()
  @IsInt()
  clientRateMinorUnits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;
}
