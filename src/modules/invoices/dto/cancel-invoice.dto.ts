import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Withdrawing a document is a decision somebody has to own — say why. */
export class CancelInvoiceDto {
  @ApiProperty({ example: 'Raised against the wrong shipment' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
