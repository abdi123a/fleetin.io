import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export const MOVEMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'] as const;

/** A deposit into, or a withdrawal out of, one account. */
export class RecordMovementDto {
  @ApiProperty({ example: 5000000, description: 'Minor units, always positive — the direction is the endpoint, not the sign' })
  @IsInt()
  @IsPositive()
  amountMinorUnits: number;

  @ApiPropertyOptional({ enum: MOVEMENT_METHODS })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ description: 'The bank/teller reference for this movement' })
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

/** Money moving between two accounts Fleetin owns. Writes two legs, one group. */
export class TransferFundsDto extends RecordMovementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  toBankAccountId: string;

  @ApiPropertyOptional({
    description:
      'Amount actually landing in the destination. Required when the two accounts hold different currencies; defaults to the amount sent.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  receivedAmountMinorUnits?: number;
}
