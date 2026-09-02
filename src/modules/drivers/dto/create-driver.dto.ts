import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OPERATIONAL_STATUSES } from '../../vehicles/dto/create-vehicle.dto';

export class CreateDriverDto {
  @ApiProperty({ example: 'Abdi Yusuf Mohamed' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '+253 77 55 11 22' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'DJ-NID-882211' })
  @IsString()
  @IsNotEmpty()
  nationalId: string;

  @ApiProperty({ example: 'DL-DJ-44821' })
  @IsString()
  @IsNotEmpty()
  drivingLicenseNumber: string;


  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nationalIdExpiry?: string;

  @ApiPropertyOptional({ type: [String], example: ['Port Gate A', 'Free Zone'] })
  @IsOptional()
  @IsArray()
  accessCards?: string[];

  @ApiPropertyOptional({ enum: OPERATIONAL_STATUSES, default: 'Available' })
  @IsOptional()
  @IsIn(OPERATIONAL_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  joinDate?: string;
}
