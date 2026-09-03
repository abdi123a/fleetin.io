import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Minimal — just enough for a `CreditFacility` to have something real to reference. No statement-line reconciliation here. */
export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountHolder: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swiftCode?: string;

  @ApiProperty({ default: 'DJF' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
