import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'DISPATCHER', description: 'Unique role code name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Logistics Dispatcher managing active shipments' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: ['shipments:*', 'bookings:read'], description: 'List of role permission strings' })
  @IsArray()
  permissions: string[];
}
