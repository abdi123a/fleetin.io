import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * One carrier's share of a shipment, exactly as `CreateShipmentModal`'s
 * `transporterAssignments[]` already collects it. The single-tier `Shipment`
 * model (no `Booking` split — see the task's scope decision) collapses this
 * array to its first entry as the shipment's `partnerId`, matching what
 * `handleCreateShipment()` already did client-side before this endpoint
 * existed; every assignment still contributes its vehicle count to the
 * server-computed rate.
 */
export class TransporterAssignmentDto {
  @ApiProperty({ example: 'partner-uuid' })
  @IsString()
  @IsNotEmpty()
  partnerId: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  vehicles: number;

  @ApiPropertyOptional({ type: [String], example: ['BKG-1178'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bookingIds?: string[];
}
