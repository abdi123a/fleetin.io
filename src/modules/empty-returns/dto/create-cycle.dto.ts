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
}
