import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
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
 * Correcting a claim before anybody has ruled on it.
 *
 * JSON, not multipart: the receipt is not re-uploaded here. Replacing the
 * evidence under an amount somebody is about to approve is a different act
 * from fixing a typo in the description, and it is not offered — withdraw the
 * claim and file it again.
 */
export class UpdateExpenseDto {
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendorOrPayee?: string;

  @ApiPropertyOptional({ example: 18500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ example: '2026-09-02' })
  @IsOptional()
  @IsDateString()
  incurredAt?: string;

  @ApiPropertyOptional({ enum: EXPENSE_METHODS })
  @IsOptional()
  @IsIn(EXPENSE_METHODS)
  method?: ExpenseMethod;

  @ApiPropertyOptional()
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
