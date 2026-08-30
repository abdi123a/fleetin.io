import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateRoleDto } from './create-role.dto';

/**
 * A role's name is its identity — `PermissionsGuard`, the seed and several
 * services compare against `ADMIN`, `SHIPPER` and friends by name, so renaming
 * one silently reassigns whoever holds it. Only the description and the grants
 * can be edited; a differently-named role is a new role.
 */
export class UpdateRoleDto extends PartialType(OmitType(CreateRoleDto, ['name'] as const)) {}
