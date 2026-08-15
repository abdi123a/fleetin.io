import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

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
