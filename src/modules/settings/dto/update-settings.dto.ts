import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    example: 7.5,
    description:
      "Fleetin's cut as a percentage of the shipment total, applied to every transporter alike. " +
      'The shipper pays the transporter price list figure; the transporter is paid that minus this percentage.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  fleetinCommissionPct?: number;
}
