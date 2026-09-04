import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  type ExpenseCategory,
  type ExpenseMethod,
} from '../expense-catalog';

/**
 * A claim, as it arrives from the form.
 *
 * **Five fields, four of them optional.** The form asks for a receipt, a
 * category, an amount, what it was for and the date — nothing else. Everything
 * below that is optional exists because the API is also how a claim gets
 * corrected later; the person standing at a fuel pump with a phone is never
 * asked for it.
 *
 * Multipart, because the receipt travels with it — so every field lands as a
 * string and the global pipe's `enableImplicitConversion` turns the numbers
 * back. The one it cannot do honestly is the boolean: class-transformer maps
 * every non-`"true"` string to `false`, so it is transformed explicitly.
 */
export class CreateExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  @IsIn(EXPENSE_CATEGORIES)
  category: ExpenseCategory;

  @ApiProperty({ example: 'Diesel, 120 L — Doraleh run' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  /** Who took the money: the pump, the landlord, the insurer. */
  @ApiPropertyOptional({ example: 'Total Djibouti — Balbala' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendorOrPayee?: string;

  /**
   * Whole DJF. The currency is not asked for: the whole book is DJF, and an
   * expense in another currency is one somebody converted before typing it.
   */
  @ApiProperty({ example: 18500 })
  @IsInt()
  @Min(1)
  amount: number;

  /** The day the money was spent — not the day the claim was filed. */
  @ApiProperty({ example: '2026-09-02' })
  @IsDateString()
  incurredAt: string;

  /** Optional; defaults to cash, which is what an unrecorded receipt is. */
  @ApiPropertyOptional({ enum: EXPENSE_METHODS, default: 'CASH' })
  @IsOptional()
  @IsIn(EXPENSE_METHODS)
  method?: ExpenseMethod;

  /** True when the claimant spent their own money and Fleetin owes it back. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
  @IsBoolean()
  reimbursable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
