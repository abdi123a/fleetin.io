import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** A grouping tag over one shipper's shipments — nothing more. See `Project`'s own schema doc comment. */
export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shipperId: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  startedAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  contractEndAt?: string;

  @ApiPropertyOptional({
    example: 120000000,
    description:
      "What the shipper expects to run through this project in a month, in whole DJF. An ESTIMATE for planning only — " +
      'it is never a budget, cap or credit limit, and no shipment is ever refused, delayed or warned about for exceeding it.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyEstimate?: number;
}
