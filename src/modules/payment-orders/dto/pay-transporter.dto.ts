import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Pays one transporter their share of one shipment — the sum of that transporter's own bookings' cost, never the shipment's whole rate. */
export class PayTransporterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shipmentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transporterId: string;

  @ApiProperty({ description: 'The real account this transporter is paid from — deducted for real.' })
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @ApiPropertyOptional({ default: 'bank_transfer' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
