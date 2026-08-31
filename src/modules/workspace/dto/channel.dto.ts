import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class CreateChannelDto {
  @ApiProperty({ maxLength: 120 })
  @IsString() @IsNotEmpty() @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'What this room is for — one line, shown in the header' })
  @IsOptional() @IsString() @MaxLength(255)
  topic?: string;

  @ApiPropertyOptional({ description: 'Private channels are invisible to non-members, not merely read-refused' })
  @IsOptional() @IsBoolean()
  isPrivate?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(200)
  memberIds?: string[];
}

export class UpdateChannelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  topic?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isPrivate?: boolean;
}

/** Replace-the-whole-set, the shape `PUT /shipments/:id/assignees` already uses. */
export class SetChannelMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMaxSize(200)
  memberIds: string[];
}

export class QueryMessagesDto {
  @ApiPropertyOptional({ description: 'Fetch the page ENDING before this message id — scrolling back' })
  @IsOptional() @IsString()
  before?: string;

  @ApiPropertyOptional({ default: 40 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class SearchMessagesDto {
  @ApiPropertyOptional({ description: 'Free text, or a record reference like 609196' })
  @IsOptional() @IsString()
  q?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  channelId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  authorId?: string;

  @ApiPropertyOptional({ description: 'ISO date — messages on or after' })
  @IsOptional() @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — messages on or before' })
  @IsOptional() @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
