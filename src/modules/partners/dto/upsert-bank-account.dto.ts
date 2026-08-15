import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertBankAccountDto {
  @ApiProperty({ example: 'Banque de Djibouti' })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({ example: 'Red Sea Express Ltd' })
  @IsString()
  @IsNotEmpty()
  accountHolder: string;

  @ApiProperty({ example: '0001234567890' })
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

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
