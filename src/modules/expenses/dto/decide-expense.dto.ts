import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Refusing a claim. The reason is required by the service, not by this DTO,
 * so the message says what is missing rather than "reason should not be
 * empty" — a person whose fuel receipt was refused is owed a sentence.
 */
export class RejectExpenseDto {
  @ApiPropertyOptional({ example: 'No VAT number on the receipt — ask the station to reissue.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Recording that the money actually moved. */
export class PayExpenseDto {
  /** When it was settled. Defaults to now. */
  @ApiPropertyOptional({ example: '2026-09-04' })
  @IsOptional()
  @IsString()
  paidAt?: string;
}
