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

/**
 * Is this a customer's or a carrier's own login, rather than one of ours?
 *
 * Deliberately separate from `ownCompanyScope`, and *not* derivable from it:
 * that helper returns `null` both for an internal account and for a portal
 * account whose company link is missing, because `null` there means "no row
 * filter to apply". Anything deciding what a *customer* may be told has to ask
 * about the role itself, or a half-configured portal account would be treated
 * as staff.
 */
export function isPortalAccount(user: AuthenticatedUser): boolean {
  return user.role.name === 'SHIPPER' || user.role.name === 'TRANSPORTER';
}

/**
 * The same rule as `ownCompanyScope`, for models that reach their owning
 * company through a relation instead of a column.
 *
 * A `Booking` names its transporter directly (`partnerId`) but reaches its
 * shipper through the shipment above it, so a flat `{ field: value }` cannot
 * express the shipper half. Returns a Prisma `where` fragment to spread, or
 * `null` when the caller is an internal role and nothing is scoped.
 */
export function bookingOwnerScope(user: AuthenticatedUser): Record<string, unknown> | null {
  if (user.role.name === 'SHIPPER' && user.shipperId) {
    return { shipment: { shipperId: user.shipperId } };
  }
  if (user.role.name === 'TRANSPORTER' && user.partnerId) {
    return { partnerId: user.partnerId };
  }
  return null;
}

/**
 * `bookingOwnerScope`, one relation further out: a cycle belongs to whoever
 * owns the empty going back, which is the booking it was opened against.
 */
export function cycleOwnerScope(user: AuthenticatedUser): Record<string, unknown> | null {
  const scope = bookingOwnerScope(user);
  return scope ? { booking: scope } : null;
}
