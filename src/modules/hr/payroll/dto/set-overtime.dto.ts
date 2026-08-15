import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetOvertimeDto {
  @ApiProperty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({
    example: 24,
    description: 'Total hours. Split across the 125% and 150% tiers by the engine.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeHours?: number;

  @ApiPropertyOptional({
    example: 7701,
    description: 'Manual figure in DJF. The source workbook had no formula for it.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  absenceDeduction?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
