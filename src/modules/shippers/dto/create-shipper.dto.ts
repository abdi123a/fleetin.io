import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';

export const COMPANY_SIZES = [
  'Micro (1-10)',
  'Small (11-50)',
  'Medium (51-250)',
  'Large (251-1000)',
  'Enterprise (1000+)',
] as const;

/**
 * `Suspended` added 2026-08-30 — a paused account, not a refused or a closed
 * one. Without it the only way to stop a shipper trading was to delete the
 * record. `approvalStatus` is a VarChar(16), so the new word needed no
 * migration.
 */
export const SHIPPER_APPROVAL_STATUSES = ['Verified', 'Pending', 'Suspended', 'Canceled'] as const;

export class CreateShipperDto {
  @ApiProperty({ example: 'CMA-CGM' })
  @IsString()
  @IsNotEmpty()
  companyLegalName: string;

  @ApiProperty({ example: 'DJ-REG-2022-4482' })
  @IsString()
  @IsNotEmpty()
  registrationNumber: string;

  @ApiProperty({ example: 'Logistics & Freight' })
  @IsString()
  @IsNotEmpty()
  industry: string;

  @ApiProperty({ enum: COMPANY_SIZES })
  @IsIn(COMPANY_SIZES)
  companySize: string;

  @ApiProperty({ example: 'Djibouti' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'PK12 Free Zone Commercial Complex, Djibouti City' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ enum: SHIPPER_APPROVAL_STATUSES, default: 'Pending' })
  @IsOptional()
  @IsIn(SHIPPER_APPROVAL_STATUSES)
  approvalStatus?: string;

  @ApiPropertyOptional({ description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  @ApiProperty({ type: CreateContactDto })
  @ValidateNested()
  @Type(() => CreateContactDto)
  primaryContact: CreateContactDto;

  @ApiPropertyOptional({ type: [CreateContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  operationalContacts?: CreateContactDto[];
}
