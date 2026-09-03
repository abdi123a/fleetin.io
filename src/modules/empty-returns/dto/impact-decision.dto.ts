import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * An operator's word on whether a pairing was physically realized.
 *
 * The rungs answer most cases on their own; this is the door for the ones
 * they cannot — the truck that went back to the garage anyway and came out
 * again in the morning (the saving is not real), or the continuation the
 * yard watched happen but nobody stamped (it is). A person's verdict is
 * remembered and never overruled by a later automatic pass.
 */
export class ImpactDecisionDto {
  @ApiProperty({ description: 'True if the truck continued from the free zone to the port; false if it went back to the garage' })
  @IsBoolean()
  realized: boolean;

  @ApiPropertyOptional({ description: 'Why, in the operator’s words', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
