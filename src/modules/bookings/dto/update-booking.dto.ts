import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Non-status edits — mirrors `UpdateShipmentDto`. Status moves exclusively
 * through `PATCH /bookings/:id/status`.
 */
export class UpdateBookingDto {
  /**
   * How the delivery went, as the operator saw it — captured when the booking
   * is marked Delivered.
   *
   * This IS the rating. Since 2026-08-30 nothing in this system awards a star
   * of its own: `lib/rating.ts` still measures the mission window, the
   * turnaround and the container's return, and still reports them as figures,
   * but every star beside a name is one of these answers.
   */
  @ApiPropertyOptional({ description: 'Operator rating for the driver on this delivery, 1-5', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driverRating?: number;

  @ApiPropertyOptional({ description: 'Did the job get done as planned, 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driverRatingReliability?: number;

  @ApiPropertyOptional({ description: 'Was it done on time, 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driverRatingPunctuality?: number;

  @ApiPropertyOptional({ description: 'How the driver handled it, 1-5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  driverRatingProfessionalism?: number;

  @ApiPropertyOptional({ description: 'Free-text remark about how the delivery went' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  driverNote?: string;

  /**
   * The closing debrief — the shipper's half, asked when the box is home.
   *
   * The carrier owns the road; the shipper owns the yard. How fast they
   * stripped and released the box is what ran the detention clock, and it is
   * otherwise charged to the carrier who only fetched it. Same three axes, so
   * the two debriefs stay comparable.
   */
  @ApiPropertyOptional({ description: 'Assign or change the driver' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Assign or change the vehicle' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({
    description:
      "The driver taking the empty container back, when that is not who delivered it. Recorded on the 'Empty Picked Up' rung; null means the delivery crew took it back.",
  })
  @IsOptional()
  @IsString()
  returnDriverId?: string;

  @ApiPropertyOptional({ description: 'The vehicle running the empty return leg' })
  @IsOptional()
  @IsString()
  returnVehicleId?: string;

  @ApiPropertyOptional({ description: 'Overall 1-5 for the return driver', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  returnDriverRating?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  returnDriverRatingReliability?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  returnDriverRatingPunctuality?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  returnDriverRatingProfessionalism?: number;

  @ApiPropertyOptional({ description: 'Free-text remark about the return driver on this booking' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  returnDriverNote?: string;

  @ApiPropertyOptional({ description: 'Reassign to a different transporter' })
  @IsOptional()
  @IsString()
  partnerId?: string;

  @ApiPropertyOptional({ description: "Used to re-price transporterCostMinorUnits against the partner's own pricing tier whenever partnerId changes" })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerReturnDepot?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  containerReturnDeadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  containerReturnFreeDays?: number;
}
