import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRecordType, WorkspaceTaskPriority, WorkspaceTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

/** One pointer at a domain row. `recordId` may be an id or a reference. */
export class TaskLinkDto {
  @ApiProperty({ enum: WorkspaceRecordType })
  @IsEnum(WorkspaceRecordType)
  recordType: WorkspaceRecordType;

  @ApiProperty({ description: 'A uuid or a human reference — SHI-00412, DJ-4471-AB' })
  @IsString()
  @IsNotEmpty()
  recordId: string;
}

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: WorkspaceTaskStatus })
  @IsOptional()
  @IsEnum(WorkspaceTaskStatus)
  status?: WorkspaceTaskStatus;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional()
  @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({ description: 'Null or absent means nobody has picked it up yet' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ type: [TaskLinkDto], description: 'Empty is valid — a task need not be about a record' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskLinkDto)
  links?: TaskLinkDto[];
}
