import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** One priced line on a quotation. */
export class ProformaLineDto {
  @ApiProperty({ example: '40ft container, Doraleh → Free Zone' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 5, description: 'How many — containers, trips, units.' })
  @IsInt()
  @Min(1)
  qty: number;

  @ApiProperty({ example: 45000, description: 'Price for ONE, in whole DJF.' })
  @IsInt()
  @Min(0)
  unitAmount: number;

  /**
   * What kind of cargo this line prices — the same vocabulary a shipment uses
   * (`containerized`, `bulk`, `machinery`…). Carried so a quotation says
   * whether it is quoting boxes or bulk, exactly as an invoice does.
   */
  @ApiPropertyOptional({ example: 'containerized' })
  @IsOptional()
  @IsString()
  category?: string;
}

/**
 * A quotation for work that has not happened.
 *
 * Deliberately NOT built from a shipment: a proforma is what a client is sent
 * *before* they commit, so at the moment it is written there is nothing in the
 * system to build it from. The lines are typed by the operator, and the total
 * is their sum — no shipment, no bookings, no price lookup.
 */
export class CreateProformaDto {
  @ApiProperty({ description: 'The client being quoted.' })
  @IsString()
  @IsNotEmpty()
  shipperId: string;

  @ApiPropertyOptional({ description: 'What the quote is for. Defaults to a generic line.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'How long the price holds. Defaults to 30 days out.' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Anything the client should read with it.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ProformaLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProformaLineDto)
  lines: ProformaLineDto[];
}
