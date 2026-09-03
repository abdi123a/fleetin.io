import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDispatcherDto } from './create-dispatcher.dto';

export const PARTNER_STATUSES = ['Active', 'Suspended', 'Pending', 'Inactive'] as const;

/** A deal is a share of the job, or a flat fee per container. */
export const COMMISSION_MODES = ['percent', 'fixed'] as const;

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

  /**
   * How Fleetin's cut is worked out for this transporter: `percent` (a share of the
   * job) or `fixed` (a flat fee per container).
   *
   * Omit it — or send `null` — for the normal case, which is no special deal:
   * the house rate under Settings applies. The MODE is what says a deal
   * exists, never the amount: a negotiated 0% or 0-franc fee is a real
   * commercial decision and is stored as one.
   */
  @ApiPropertyOptional({ enum: COMMISSION_MODES, description: 'Null/omitted = use the house rate.' })
  @IsOptional()
  @IsIn(COMMISSION_MODES)
  commissionMode?: string | null;

  /** The percentage, when `commissionMode` is `percent`. 7.5 means 7.5%. */
  @ApiPropertyOptional({ example: 7.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number | null;

  /** The flat fee per container, in whole DJF, when `commissionMode` is `fixed`. */
  @ApiPropertyOptional({ example: 5000, description: 'Charged once per booking (container).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionFixedAmount?: number | null;


  /**
   * Where this transporter's trucks are based — a catalogue location id. The
   * Fleetin Impact arithmetic measures `Free Zone → Garage → Port` from it;
   * without one a realized continuation is recognised but not measured.
   * Send `null` (or an empty string) to clear it.
   */
  @ApiPropertyOptional({ description: 'Catalogue location the trucks sleep at — see Partner.garageLocationId', nullable: true })
  @IsOptional()
  @IsString()
  garageLocationId?: string | null;

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
