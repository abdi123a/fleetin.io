import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** The body cap. Long enough for a real handover note, short enough that the thread stays a thread. */
export const COMMENT_MAX_LENGTH = 4000;

/**
 * Trim *before* validation, not after.
 *
 * `@IsNotEmpty` is happy with `"   "`, so trimming in the service instead let
 * a body of three spaces through the guard and then stored it as the empty
 * string — a blank row in the thread that nobody typed and nobody can read.
 * Transforming here means the check and the stored value are the same string.
 */
const trimmed = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Says something on a shipment — or, with `bookingId`, on one of its containers. */
export class CreateCommentDto {
  @ApiProperty({ maxLength: COMMENT_MAX_LENGTH })
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({
    description:
      "Scope this comment to one booking under the shipment. Omitted, it speaks to the whole shipment. Accepts the booking's id or its reference.",
  })
  @IsOptional()
  @IsString()
  bookingId?: string;
}

export { trimmed };
