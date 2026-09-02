import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const TRUCK_TYPES = [
  'Flatbed',
  '20ft Container',
  '40ft Container',
  'Refrigerated',
  'Tanker',
  'Tipper',
  'Box Truck',
  'Low Loader',
  'Other',
] as const;

export const OWNERSHIP_TYPES = ['Owned', 'Leased', 'Rented'] as const;

/** Shared with Driver.status — a fleet asset and its driver use the same operational vocabulary. */
export const OPERATIONAL_STATUSES = ['Available', 'In Transit', 'Under Maintenance', 'Out of Service'] as const;

export class CreateVehicleDto {
  @ApiProperty({ example: 'DJ-ABJ-1234' })
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ enum: TRUCK_TYPES })
  @IsIn(TRUCK_TYPES)
  truckType: string;

  @ApiPropertyOptional({ example: '40ft / 28 tons' })
  @IsOptional()
  @IsString()
  containerCapacity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trailerInfo?: string;

  @ApiProperty({ enum: OWNERSHIP_TYPES })
  @IsIn(OWNERSHIP_TYPES)
  ownershipType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  insuranceStartDate?: string;

  /** The insurer. Set from the vehicle's Insurance certificate — see
   *  `DocumentsService.syncVehicleComplianceDates` — and editable here. */
  @ApiPropertyOptional({ example: 'GXA Assurances' })
  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @ApiProperty()
  @IsDateString()
  insuranceExpiry: string;

  @ApiProperty()
  @IsDateString()
  registrationExpiry: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasGPS?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gpsDeviceId?: string;

  @ApiPropertyOptional({ enum: OPERATIONAL_STATUSES, default: 'Available' })
  @IsOptional()
  @IsIn(OPERATIONAL_STATUSES)
  operationalStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;
}
