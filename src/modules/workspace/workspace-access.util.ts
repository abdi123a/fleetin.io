import { ForbiddenException } from '@nestjs/common';
import { isPortalAccount } from '../../common/helpers/row-scope.util';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Workspace is internal-only, and this is the second lock on that door.
 *
 * The first is the permission: no portal role is granted `workspace.*`, and
 * `..._workspace_permissions` deliberately skips SHIPPER, TRANSPORTER and
 * CLIENT. But a permission is a row in a JSON column that somebody can edit in
 * Administration, and the consequence of a mis-click there is a customer
 * reading the desk's private notes about their own shipment. That is not a
 * mistake this codebase should make survivable, so the role itself is checked
 * on every route as well.
 *
 * Same reasoning as `shipments.controller.ts` stripping `crew` from a portal
 * payload rather than trusting the caller not to ask for it.
 */
export function assertInternal(user: AuthenticatedUser): void {
  if (isPortalAccount(user)) {
    throw new ForbiddenException('Workspace is not available to portal accounts');
  }
}
