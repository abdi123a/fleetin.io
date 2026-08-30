import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { isKnownPermission } from '../../../common/constants/permissions';

/**
 * Rejects grants the guard could never match.
 *
 * The old DTO typed `permissions` as a bare `string[]`, and its own Swagger
 * example used colons (`shipments:*`) — a syntax `grantSatisfies` does not
 * understand. A role created from that example stores happily and then grants
 * nothing, which reads as a broken account rather than a typo. Unknown
 * permissions now fail at the edge, and the message names them.
 */
@ValidatorConstraint({ name: 'knownPermissions' })
class KnownPermissionsConstraint implements ValidatorConstraintInterface {
  private unknown: string[] = [];

  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    this.unknown = value.filter(
      (entry) => typeof entry !== 'string' || !isKnownPermission(entry),
    ) as string[];
    return this.unknown.length === 0;
  }

  defaultMessage(): string {
    return `Unknown permission(s): ${this.unknown.join(', ')}. Use resource.action, resource.* or *.`;
  }
}

export class CreateRoleDto {
  @ApiProperty({ example: 'DISPATCHER', description: 'Unique role code name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'name must be upper snake case, e.g. YARD_SUPERVISOR',
  })
  name: string;

  @ApiPropertyOptional({ example: 'Logistics Dispatcher managing active shipments' })
  @IsString()
  @IsOptional()
  @MaxLength(280)
  description?: string;

  @ApiProperty({
    example: ['shipments.*', 'bookings.view'],
    description: 'Grants from the permission catalogue: resource.action, resource.* or *',
  })
  @IsArray()
  @ArrayNotEmpty()
  @Validate(KnownPermissionsConstraint)
  permissions: string[];
}
