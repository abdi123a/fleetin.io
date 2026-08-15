import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class RequestLeaveDto {
  @ApiProperty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({ enum: LeaveType, default: LeaveType.ANNUAL })
  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;

  @ApiProperty({ example: '2026-02-14' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-19' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
