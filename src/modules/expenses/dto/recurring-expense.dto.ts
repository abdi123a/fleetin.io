import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  EXPENSE_FREQUENCIES,
  EXPENSE_METHODS,
  type ExpenseCategory,
  type ExpenseFrequency,
  type ExpenseMethod,
} from '../expense-catalog';

/** A standing obligation: the rent, a salary, the insurance premium. */
export class CreateRecurringExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  @IsIn(EXPENSE_CATEGORIES)
  category: ExpenseCategory;

  @ApiProperty({ example: 'Office lease — Rue de Venise' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiProperty({ example: 'SCI Djibouti Properties' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  vendorOrPayee: string;

  /** Whole DJF, per occurrence — not per month. */
  @ApiProperty({ example: 450000 })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: EXPENSE_FREQUENCIES })
  @IsIn(EXPENSE_FREQUENCIES)
  frequency: ExpenseFrequency;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  nextDueAt: string;

  @ApiPropertyOptional({ enum: EXPENSE_METHODS, default: 'BANK_TRANSFER' })
  @IsOptional()
  @IsIn(EXPENSE_METHODS)
  method?: ExpenseMethod;

  /** When the obligation itself ends — a lease that runs out. */
  @ApiPropertyOptional({ example: '2027-09-30' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateRecurringExpenseDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ enum: EXPENSE_FREQUENCIES })
  @IsOptional()
  @IsIn(EXPENSE_FREQUENCIES)
  frequency?: ExpenseFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextDueAt?: string;

  @ApiPropertyOptional({ enum: EXPENSE_METHODS })
  @IsOptional()
  @IsIn(EXPENSE_METHODS)
  method?: ExpenseMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  /** Pausing a template stops it asking to be posted; it keeps its history. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
