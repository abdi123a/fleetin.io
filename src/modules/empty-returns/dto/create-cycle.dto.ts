import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Confirms one empty↔full match — Empty Return's one write action. Accepts
 * either a booking's primary key or its `BKG-####` reference, same
 * convention as every other lookup in this domain.
 */
export class CreateCycleDto {
  @ApiProperty({ description: 'The empty going back' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiPropertyOptional({ description: 'The full load this cycle picks up on the way back' })
  @IsOptional()
  @IsString()
  nextBookingId?: string;

  /* v19's `matchInfo`. The engine's own pick and an operator's override are
     different claims, and a board showing both without saying which is which
     is not auditable — so provenance travels with the write. */
  @ApiPropertyOptional({ description: 'Who confirmed the pairing', default: 'Operations' })
  @IsOptional()
  @IsString()
  matchedBy?: string;

  @ApiPropertyOptional({
    description: 'How it was chosen',
    example: 'Suggestion — Recommended',
  })
  @IsOptional()
  @IsString()
  matchSource?: string;
}
