import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePricingTierDto {
  @ApiProperty({ example: 'Djibouti → Addis Ababa' })
  @IsString()
  @IsNotEmpty()
  route: string;

  @ApiProperty({ example: '40ft Container' })
  @IsString()
  @IsNotEmpty()
  vehicleType: string;

  @ApiProperty({ example: 3500, description: 'Whole currency units — converted to minor units server-side' })
  @IsNumber()
  @Min(0)
  basePrice: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 1.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKm?: number;
}
