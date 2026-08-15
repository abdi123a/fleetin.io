import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';

interface ScopeFields {
  /** Field on the queried model that identifies its owning shipper. */
  shipperField?: string;
  /** Field on the queried model that identifies its owning partner. */
  partnerField?: string;
}

/**
 * Row-level scoping for portal users (BR-10.5).
 *
 * A SHIPPER-role account may only see rows tied to its own `shipperId`; a
 * TRANSPORTER-role account, its own `partnerId`. Every other role
 * (ADMIN/MANAGER/DISPATCHER/DRIVER) is unscoped here — the permission check
 * already gated whether they can call the endpoint at all. Returns `null`
 * when no scoping applies, so callers can spread the result into a Prisma
 * `where` clause without a conditional at each call site.
 */
export function ownCompanyScope(user: AuthenticatedUser, fields: ScopeFields): Record<string, string> | null {
  if (user.role.name === 'SHIPPER' && fields.shipperField && user.shipperId) {
    return { [fields.shipperField]: user.shipperId };
  }
  if (user.role.name === 'TRANSPORTER' && fields.partnerField && user.partnerId) {
    return { [fields.partnerField]: user.partnerId };
  }
  return null;
}
