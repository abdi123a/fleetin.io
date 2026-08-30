import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { COMMENT_MAX_LENGTH, trimmed } from './create-comment.dto';

/**
 * Rewrites a comment's body. The scope (`shipmentId`/`bookingId`) is not
 * editable: moving a comment to a different container would silently rewrite
 * what a colleague read yesterday. Delete and say it again instead.
 */
export class UpdateCommentDto {
  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH })
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  body: string;
}
