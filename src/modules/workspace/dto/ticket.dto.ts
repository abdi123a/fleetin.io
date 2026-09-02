import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WorkspaceRecordType,
  WorkspaceTaskPriority,
  WorkspaceTaskStatus,
  WorkspaceTicketChannel,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({ description: "The caller's complaint, shortened to a line" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @ApiProperty({ description: 'The problem as reported, in full' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional()
  @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({ enum: WorkspaceTicketChannel })
  @IsOptional()
  @IsEnum(WorkspaceTicketChannel)
  channel?: WorkspaceTicketChannel;

  @ApiPropertyOptional({ description: 'Who rang. Free text — often nobody with a row here' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reporterName?: string;

  @ApiPropertyOptional({ description: 'How to reach them again' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reporterContact?: string;

  @ApiPropertyOptional({ enum: WorkspaceRecordType, description: 'What the complaint is about' })
  @IsOptional()
  @IsEnum(WorkspaceRecordType)
  recordType?: WorkspaceRecordType;

  @ApiPropertyOptional({ description: 'A uuid or a human reference — SHI-00412, DJ-4471-AB' })
  @IsOptional()
  @IsString()
  recordId?: string;

  /**
   * Naming somebody here is what turns the complaint into work.
   *
   * The ticket is logged either way; with an assignee it also raises the task
   * in the same call, so the commonest path — "this is Ahmed's, tell him" — is
   * one form rather than a form and then a second dialog.
   */
  @ApiPropertyOptional({ description: 'Creates the task at the same time, assigned to them' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: "The task's due date, when one is raised" })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: WorkspaceTaskStatus,
    description:
      'Refused once a task is attached — the task drives the status from then on',
  })
  @IsOptional()
  @IsEnum(WorkspaceTaskStatus)
  status?: WorkspaceTaskStatus;

  @ApiPropertyOptional({ enum: WorkspaceTaskPriority })
  @IsOptional()
  @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({ enum: WorkspaceTicketChannel })
  @IsOptional()
  @IsEnum(WorkspaceTicketChannel)
  channel?: WorkspaceTicketChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reporterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reporterContact?: string;

  @ApiPropertyOptional({ enum: WorkspaceRecordType })
  @IsOptional()
  @IsEnum(WorkspaceRecordType)
  recordType?: WorkspaceRecordType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordId?: string;
}

/**
 * Hand the problem to somebody.
 *
 * Everything here describes the TASK, not the ticket — the ticket has already
 * said what the problem is. The title and description default to the ticket's
 * own, because the commonest case is "this, please, by Friday" and retyping
 * the complaint is how the two records start disagreeing about what was
 * reported.
 */
export class RaiseTicketTaskDto {
  @ApiPropertyOptional({ description: "Defaults to the ticket's subject" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: "Defaults to the ticket's description" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Null or absent means nobody has picked it up yet' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({
    enum: WorkspaceTaskPriority,
    description: "Defaults to the ticket's priority",
  })
  @IsOptional()
  @IsEnum(WorkspaceTaskPriority)
  priority?: WorkspaceTaskPriority;

  @ApiPropertyOptional({
    description:
      "Carry the ticket's record onto the task as a link. Default true — the work is about the same row the complaint is",
  })
  @IsOptional()
  @IsBoolean()
  linkRecord?: boolean;
}
