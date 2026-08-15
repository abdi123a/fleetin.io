import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class IssueStatementDto {
  @ApiProperty({ example: 'a1b2c3d4-…', description: 'The shipper being billed' })
  @IsString()
  shipperId: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2999)
  year: number;

  @ApiProperty({ example: 8, description: '1-based: 1 = January, 12 = December' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({ description: "Narrow the statement to one project. Omit to bill everything the shipper ran that month." })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
