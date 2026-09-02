import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export const LEG_PURPOSES = ['positioning', 'loaded', 'empty_return', 'manual'] as const;

export class RouteStopDto {
  @ApiProperty({ description: 'A catalogue location id — one stop on the drive.' })
  @IsString()
  locationId: string;

  /**
   * What the leg *arriving at this stop* was for. On the first stop it means
   * nothing and is ignored — a route's first entry is where the truck started.
   */
  @ApiPropertyOptional({ enum: LEG_PURPOSES, default: 'manual' })
  @IsOptional()
  @IsIn(LEG_PURPOSES)
  purpose?: string;
}

export class ReplaceRouteDto {
  /**
   * The drive, in order: `[garage, port, free zone, port, free zone]`. Legs are
   * the consecutive pairs, so n stops make n-1 legs. Two stops is the shortest
   * route worth recording; one is a truck that did not move.
   */
  @ApiProperty({ type: [RouteStopDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops: RouteStopDto[];
}
