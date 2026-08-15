import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Metadata key marking a handler as requiring *all* listed permissions rather
 * than any one of them.
 */
export const PERMISSIONS_MODE_KEY = 'required_permissions_mode';

export type PermissionMode = 'any' | 'all';

/**
 * Require permissions to reach a route.
 *
 * Default is `any` — the caller needs at least one of the listed permissions,
 * which is what a read endpoint reachable by several roles usually wants.
 *
 *   @RequirePermissions(PERMISSIONS.partners.view)
 *   @RequirePermissions(PERMISSIONS.finance.view, PERMISSIONS.analytics.view)
 *
 * Applies at class level too, in which case it covers every route in the
 * controller unless a method overrides it.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Require *every* listed permission.
 *
 * For endpoints that genuinely cross two concerns — e.g. an action that both
 * moves money and mutates a shipment.
 */
export const RequireAllPermissions = (...permissions: string[]) => {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, permissions)(target, key, descriptor);
    SetMetadata(PERMISSIONS_MODE_KEY, 'all' as PermissionMode)(target, key, descriptor);
  };
};
