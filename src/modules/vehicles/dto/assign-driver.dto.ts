import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AssignDriverDto {
  @ApiPropertyOptional({ description: 'Driver id to assign, or omit/null to unassign', nullable: true })
  @IsOptional()
  @IsString()
  driverId?: string | null;
}
