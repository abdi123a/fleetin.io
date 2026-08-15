import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Every payment goes through a real account — choose which one the shipper's money landed in. */
export class MarkPaidDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;
}
