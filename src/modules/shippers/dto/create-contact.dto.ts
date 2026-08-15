import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'Mohamed Amin' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Chief Logistics Officer' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'm.amin@amina-fzco.dj' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+253 77 81 92 01' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
