import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { DocumentFieldValues } from '../payload.builder';

export class IssueDocumentDto {
  @ApiProperty({ example: 'attestation_travail' })
  @IsString()
  template: string;

  @ApiPropertyOptional({ description: 'Required for employee-scope documents.' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Required for period-scope documents.' })
  @IsOptional()
  @IsString()
  periodId?: string;

  @ApiPropertyOptional({
    description: "The template's own inputs — leave dates, termination date, and so on.",
    example: { issueDate: '2026-08-15', payUnusedLeave: true },
  })
  @IsOptional()
  @IsObject()
  fields?: DocumentFieldValues;
}
