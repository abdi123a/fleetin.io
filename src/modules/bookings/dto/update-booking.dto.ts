import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Non-status edits — mirrors `UpdateShipmentDto`. Status moves exclusively
 * through `PATCH /bookings/:id/status`.
 */
export class UpdateBookingDto {
  @ApiPropertyOptional({ description: 'Assign or change the driver' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Assign or change the vehicle' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Reassign to a different transporter' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: "Used to re-price transporterCostMinorUnits against the partner's own pricing tier whenever partnerId changes" })
  @IsOptional()
  @IsString()
  vehicleType?: string;

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
  @IsDateString()
  containerReturnDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  containerReturnFreeDays?: number;
}
