import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/**
 * The "Plan Empty Return" decision — the branch taken when no full load can
 * use the container before its deadline.
 *
 * The flag itself carries no payload (stopping matching is the decision), so
 * the only field here is when the box is actually going back. Optional: an
 * operator can stop matching before the slot is known, and the deadline the
 * return is racing lives on the booking regardless.
 */
export class PlanEmptyReturnDto {
  @ApiPropertyOptional({ description: 'When the empty is planned to reach the depot (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  plannedReturnAt?: string;
}
