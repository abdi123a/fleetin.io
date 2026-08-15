import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCreditFacilityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @ApiProperty({ example: 50000000 })
  @IsInt()
  limitMinorUnits: number;

  @ApiProperty({ default: 'DJF' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRevolving?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feeDescription?: string;
}
