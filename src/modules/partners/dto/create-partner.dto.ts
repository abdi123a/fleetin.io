import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDispatcherDto } from './create-dispatcher.dto';

export const PARTNER_STATUSES = ['Active', 'Suspended', 'Pending', 'Inactive'] as const;

export class CreatePartnerDto {
  @ApiProperty({ example: 'Red Sea Express Ltd' })
  @IsString()
  @IsNotEmpty()
  companyLegalName: string;

  @ApiPropertyOptional({ description: 'Server-generated if omitted' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessLicenseNumber?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  operatingRegions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  serviceCategories?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  fleetSize?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  vehicleTypes?: string[];

  @ApiProperty({ example: 'Djibouti' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'Zone Industrielle, Port Ave, Djibouti City' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiPropertyOptional({ enum: PARTNER_STATUSES, default: 'Pending' })
  @IsOptional()
  @IsIn(PARTNER_STATUSES)
  partnerStatus?: string;

  @ApiPropertyOptional({ description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  registrationDate?: string;

  @ApiProperty({ type: CreateDispatcherDto })
  @ValidateNested()
  @Type(() => CreateDispatcherDto)
  primaryDispatcher: CreateDispatcherDto;

  @ApiPropertyOptional({ type: [CreateDispatcherDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDispatcherDto)
  additionalDispatchers?: CreateDispatcherDto[];
}
