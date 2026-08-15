import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const HOLD_CATEGORIES = ['weight_mismatch', 'damage', 'documentation', 'other'] as const;

/** Raises the one manual dispute override the payout workflow keeps — pauses a shipment's (or one booking's) payout. */
export class CreateHoldDto {
  @ApiProperty({ enum: HOLD_CATEGORIES })
  @IsIn(HOLD_CATEGORIES)
  category: (typeof HOLD_CATEGORIES)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Narrow the hold to one specific booking rather than the whole shipment' })
  @IsOptional()
  @IsString()
  bookingId?: string;
}
