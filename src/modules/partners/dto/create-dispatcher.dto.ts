import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDispatcherDto {
  @ApiProperty({ example: 'Omar Hassan Ali' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Fleet Operations Manager' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'omar@redsea-express.dj' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+253 77 81 12 01' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
