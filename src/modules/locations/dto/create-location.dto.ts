import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * What a place IS — and, in the shipment wizard, which picker offers it.
 *
 * Deliberately short. These are the distinctions the corridor actually makes:
 * a box comes off a ship at a `port`, is delivered into a `free_zone` or a
 * customer's own `yard`, and the empty goes back to a `depot`. Anything else
 * is `other` rather than a category invented in advance of a need for it.
 */
export const LOCATION_KINDS = [
  'port',
  'free_zone',
  'depot',
  'yard',
  'customer',
  'other',
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export class CreateLocationDto {
  /**
   * Google's id for the place, from `GET /locations/search`.
   *
   * Present is the normal path: the server re-fetches the place from Google and
   * saves Google's name, address and coordinates, so what is stored is what
   * Google stands behind rather than what survived a round trip through a form.
   * Absent means this is a place entered by hand, and then `latitude` and
   * `longitude` are required — see below.
   */
  @ApiPropertyOptional({ example: 'ChIJ_____________' })
  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @ApiProperty({ example: 'Doraleh Container Terminal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ enum: LOCATION_KINDS, default: 'other' })
  @IsOptional()
  @IsIn(LOCATION_KINDS)
  kind?: LocationKind;

  /* Required only when Google is not supplying them. A place picked from search
   * arrives with coordinates the server fetches itself; a place typed by hand
   * has to carry its own, because a location without a position cannot be
   * measured to and is the exact hole this whole table was dug to fill. */
  @ApiPropertyOptional({ example: 11.6094 })
  @ValidateIf((dto: CreateLocationDto) => !dto.googlePlaceId)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 43.0567 })
  @ValidateIf((dto: CreateLocationDto) => !dto.googlePlaceId)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  formattedAddress?: string;

  @ApiPropertyOptional({ example: 'Djibouti' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ example: 'Djibouti' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ example: 'Gate 3' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  gateOrTerminal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
