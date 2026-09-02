import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRecurrenceFrequency, WorkspaceTaskPriority, WorkspaceTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty,
  IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

/* ── Checklist ───────────────────────────────────────────────────────────── */

export class ChecklistItemDto {
  @ApiPropertyOptional({ description: 'Absent for a new item' })
  @IsOptional() @IsString()
  id?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString() @IsNotEmpty() @MaxLength(255)
  text: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  done?: boolean;
}

export class SetChecklistDto {
  @ApiProperty({ type: [ChecklistItemDto], description: 'The whole list, in order' })
  @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];
}

export class ToggleChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  done: boolean;
}

/* ── Followers ───────────────────────────────────────────────────────────── */

export class SetFollowersDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMaxSize(50)
  userIds: string[];
}

/* ── Templates ───────────────────────────────────────────────────────────── */

/* ── Recurrence ──────────────────────────────────────────────────────────── */

/* ── Bulk ────────────────────────────────────────────────────────────────── */

export class BulkTaskDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMaxSize(200)
  taskIds: string[];

  @ApiPropertyOptional({ enum: WorkspaceTaskStatus })
  @IsOptional() @IsEnum(WorkspaceTaskStatus)
  status?: WorkspaceTaskStatus;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional() @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({ description: 'A user id, or null to unassign' })
  @IsOptional() @IsString()
  assigneeId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  dueAt?: string;
}
