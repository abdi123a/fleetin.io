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

export class TemplateItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  text: string;
}

export class CreateTemplateDto {
  @ApiProperty({ description: 'What this template is called in the picker' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'The title the generated task gets' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional() @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({ description: 'Days from creation to the due date' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365)
  dueInDays?: number;

  @ApiPropertyOptional({ type: [TemplateItemDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => TemplateItemDto)
  items?: TemplateItemDto[];
}

export class UseTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Attach the generated task to a record' })
  @IsOptional() @IsString()
  recordType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  recordId?: string;
}

/* ── Recurrence ──────────────────────────────────────────────────────────── */

export class CreateRecurrenceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  templateId?: string;

  @ApiProperty({ enum: WorkspaceRecurrenceFrequency })
  @IsEnum(WorkspaceRecurrenceFrequency)
  frequency: WorkspaceRecurrenceFrequency;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(52)
  interval?: number;

  @ApiPropertyOptional({ description: '0–6, Sunday first. Weekly rules only' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6)
  weekday?: number;

  @ApiPropertyOptional({ description: '1–31. A 31 clamps in a short month' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional() @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'First occurrence. Defaults to today' })
  @IsOptional() @IsDateString()
  startOn?: string;
}

export class UpdateRecurrenceDto extends CreateRecurrenceDto {
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

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
