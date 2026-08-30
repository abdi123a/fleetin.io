import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRecordType, WorkspaceTaskPriority, WorkspaceTaskStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryTasksDto {
  @ApiPropertyOptional({ description: 'Free text over title, description and reference' })
  @IsOptional() @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: WorkspaceTaskStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  status?: WorkspaceTaskStatus[];

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  priority?: WorkspaceTaskPriority[];

  @ApiPropertyOptional({ description: 'A user id, or the literal "unassigned"' })
  @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  createdById?: string;

  @ApiPropertyOptional({ enum: WorkspaceRecordType })
  @IsOptional() @IsEnum(WorkspaceRecordType)
  recordType?: WorkspaceRecordType;

  @ApiPropertyOptional({ description: 'A record id or reference — "what is open on SHI-00412?"' })
  @IsOptional() @IsString()
  recordId?: string;

  @ApiPropertyOptional({ enum: ['overdue', 'today', 'week', 'none'] })
  @IsOptional() @IsString()
  due?: 'overdue' | 'today' | 'week' | 'none';

  @ApiPropertyOptional({ description: 'Only tasks assigned to the caller' })
  @IsOptional() @IsBooleanString()
  mine?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}
