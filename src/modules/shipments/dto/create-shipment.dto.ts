import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TransporterAssignmentDto } from './transporter-assignment.dto';

export class CreateShipmentDto {
  @ApiProperty({ enum: ['dpcs', 'custom'] })
  @IsIn(['dpcs', 'custom'])
  shipmentSource: 'dpcs' | 'custom';

  @ApiPropertyOptional({ example: 'DPCS-DJ-2026-9901' })
  @IsOptional()
  @IsString()
  dpcsReference?: string;

  @ApiPropertyOptional({ description: 'Only used for shipmentSource "custom"; a value is generated if omitted.' })
  @IsOptional()
  @IsString()
  bookingId?: string;

  @ApiProperty({ example: 'shipper-uuid' })
  @IsString()
  @IsNotEmpty()
  shipperId: string;

  @ApiProperty({ type: [TransporterAssignmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransporterAssignmentDto)
  transporterAssignments: TransporterAssignmentDto[];

  @ApiProperty({ example: 'Container Chassis Skeleton Carrier (40ft)' })
  @IsString()
  @IsNotEmpty()
  preferredVehicleType: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pickupLocationName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pickupLocationAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pickupLocationCity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupGateOrTerminal?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deliveryLocationName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deliveryLocationAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deliveryLocationCity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryGateOrTerminal?: string;

  @ApiProperty({ example: 42 })
  @IsNumber()
  estimatedDistanceKm: number;

  @ApiPropertyOptional({ example: '1h 15m' })
  @IsOptional()
  @IsString()
  estimatedDurationHours?: string;

  @ApiProperty({ example: 'Containerized (40ft Rice)' })
  @IsString()
  @IsNotEmpty()
  cargoType: string;

  @ApiPropertyOptional({ enum: ['container_20', 'container_40', 'bulk', 'machinery', 'containerized', 'bulky_goods', 'special'] })
  @IsOptional()
  @IsString()
  shipmentCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  machineryType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bulkCommodity?: string;

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

  @ApiPropertyOptional({ example: '2026-08-10T17:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  containerReturnDeadline?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  containerReturnFreeDays?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  goodsDescription: string;

  @ApiProperty({ example: 24000 })
  @IsNumber()
  totalWeightKg: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredDocuments?: string[];

  @ApiPropertyOptional({ enum: ['Paid', 'Pending', 'Overdue', 'Partially Paid'] })
  @IsOptional()
  @IsIn(['Paid', 'Pending', 'Overdue', 'Partially Paid'])
  paymentStatus?: string;

  @ApiProperty({ example: '2026-08-06T08:30:00.000Z' })
  @IsDateString()
  scheduledPickupTime: string;

  @ApiPropertyOptional({
    example: 650000,
    description:
      'What Fleetin bills the shipper, FDJ minor units — the revenue side. Distinct from the transporter-cost rate computed automatically from the pricing grid. Optional: the wizard does not collect this today, so a shipment created without it simply is not invoiceable until Finance sets it.',
  })
  @IsOptional()
  @IsInt()
  clientRateMinorUnits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;
}
