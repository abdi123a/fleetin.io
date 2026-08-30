import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

/**
 * The whole crew, in one call.
 *
 * A set rather than an add/remove pair, because the picker on screen is a
 * checklist of the whole team: the client always knows the full answer, and
 * sending it whole is what makes the save atomic and idempotent.
 */
export class SetShipmentCrewDto {
  @ApiProperty({
    type: [String],
    description:
      'Every Fleetin staff account on this shipment. An empty array clears the crew, which is a real state — the shipment reads as unassigned.',
    example: [],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userIds: string[];

  @ApiPropertyOptional({
    description:
      'Which of `userIds` is on point. Must be one of them. Omit to keep the current lead if they are still on the crew, otherwise the first id leads.',
  })
  @IsOptional()
  @IsString()
  leadUserId?: string;
}
