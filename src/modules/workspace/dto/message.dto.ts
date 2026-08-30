import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRecordType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Matches the withdrawn CommentThread's limit — long enough for a real note. */
export const MESSAGE_MAX_LENGTH = 4000;

export class CreateMessageDto {
  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @IsString() @IsNotEmpty() @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({ description: 'Anchor: a task reference or id' })
  @IsOptional() @IsString()
  taskId?: string;

  @ApiPropertyOptional({ enum: WorkspaceRecordType, description: 'Anchor: a domain record' })
  @IsOptional() @IsEnum(WorkspaceRecordType)
  recordType?: WorkspaceRecordType;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  recordId?: string;

  @ApiPropertyOptional({ description: 'Reply to another message, one level deep' })
  @IsOptional() @IsString()
  parentMessageId?: string;

  @ApiPropertyOptional({ description: 'Assign this comment on creation — the ClickUp "assigned comment"' })
  @IsOptional() @IsString()
  assigneeId?: string;
}

export class UpdateMessageDto {
  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH })
  @IsString() @IsNotEmpty() @MaxLength(MESSAGE_MAX_LENGTH)
  body: string;
}

/** `assigneeId: null` clears it. A mention is never an assignment. */
export class AssignMessageDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsString()
  assigneeId?: string | null;
}
