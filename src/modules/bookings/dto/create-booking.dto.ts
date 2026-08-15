import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * One container's booking, as `CreateShipmentModal`'s per-container
 * assignment already resolves it (which vehicle in the rotation carries it,
 * whether it has a container number at all — bulk/machinery bookings don't).
 */
export class CreateBookingItemDto {
  @ApiPropertyOptional({ description: 'DPCS already assigns its own booking id externally — pass it through as this booking\'s reference instead of minting a new one. Omit to auto-generate (Fleetin-direct).' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ example: 'Containerized (40ft Rice)' })
  @IsString()
  @IsNotEmpty()
  cargoType: string;

  @ApiPropertyOptional({ enum: ['container_20', 'container_40', 'bulk', 'machinery', 'containerized', 'bulky_goods', 'special'] })
  @IsOptional()
  @IsString()
  shipmentCategory?: string;

  @ApiPropertyOptional({ description: 'Only containerized bookings have one' })
  @IsOptional()
  @IsString()
  containerNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingLine?: string;

  @ApiPropertyOptional({ description: 'The vehicle-rotation assignment this booking was placed under' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: "Used to price transporterCostMinorUnits against the partner's own pricing tier — same fuzzy match CreateShipmentModal's own rate estimate uses" })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Containers only — the empty-return commitment for this box' })
  @IsOptional()
  @IsString()
  containerReturnDepot?: string;

  @ApiPropertyOptional({ example: '2026-08-10T17:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  containerReturnDeadline?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  containerReturnFreeDays?: number;

  @ApiPropertyOptional({ example: '2026-08-06T08:30:00.000Z', description: 'Defaults to the parent shipment\'s own pickup time when omitted' })
  @IsOptional()
  @IsDateString()
  scheduledPickupTime?: string;
}

export class CreateBookingsDto {
  @ApiProperty({ type: [CreateBookingItemDto], description: 'One entry per container/vehicle trip' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBookingItemDto)
  bookings: CreateBookingItemDto[];
}
