import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class RepayDrawdownDto {
  @ApiProperty({ example: 1000000 })
  @IsInt()
  @Min(1)
  amountMinorUnits: number;
}
