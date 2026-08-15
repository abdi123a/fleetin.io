import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractType, Gender } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiPropertyOptional({
    example: 'EMP-00011',
    description: 'Generated from the last EMP- number when omitted.',
  })
  @IsOptional()
  @IsString()
  matricule?: string;

  @ApiProperty({ example: 'Kadidja Houmad' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    enum: Gender,
    description:
      'Drives French grammatical agreement on generated documents (M./Mme, employé/employée).',
  })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({ example: 'Djiboutienne' })
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiPropertyOptional({ example: '190 470 701' })
  @IsOptional()
  @IsString()
  cnssNumber?: string;

  @ApiPropertyOptional({ example: '2072435' })
  @IsOptional()
  @IsString()
  nifNumber?: string;

  @ApiProperty({ example: 'Superviseur', description: 'Appears on every generated document.' })
  @IsString()
  @IsNotEmpty()
  profession: string;

  @ApiPropertyOptional({ example: 'Exploitation' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  contractType: ContractType;

  @ApiProperty({
    example: '2024-09-01',
    description: 'Drives seniority, leave accrual and severance.',
  })
  @IsDateString()
  joiningDate: string;

  @ApiPropertyOptional({ description: 'CDD only.' })
  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  trialPeriodEnd?: string;

  @ApiProperty({ example: 70106, description: 'Monthly gross in DJF, before overtime and absence.' })
  @IsNumber()
  @Min(0)
  baseSalary: number;

  @ApiPropertyOptional({ example: '10 46 96 80' })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Line manager, for the MANAGER row scope.' })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({ description: 'Links the record to a login for staff self-service.' })
  @IsOptional()
  @IsString()
  userId?: string;
}
