import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateDrawdownDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  facilityId: string;

  @ApiProperty({ example: 5000000 })
  @IsInt()
  amountMinorUnits: number;

  @ApiProperty({ example: 14, description: 'Days until due' })
  @IsInt()
  daysUntilDue: number;
}
