import { bookingOwnerScope, cycleOwnerScope, ownCompanyScope } from './row-scope.util';
import type { AuthenticatedUser } from '../../modules/auth/jwt.strategy';

/**
 * These three decide what a portal account is allowed to read, so the cases
 * that matter are the negative ones: a role that should not be scoped, and a
 * role that should be scoped but has no company on it. Returning `null` there
 * would be read by every call site as "no filter" — i.e. the whole table.
 */
function user(roleName: string, company: { shipperId?: string; partnerId?: string } = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'u@example.com',
    firstName: 'A',
    lastName: 'B',
    status: 'ACTIVE',
    roleId: 'r1',
    role: { id: 'r1', name: roleName, permissions: [] },
    familyId: 'f1',
    permissions: [],
    shipperId: company.shipperId ?? null,
    partnerId: company.partnerId ?? null,
  };
}

const shipper = user('SHIPPER', { shipperId: 'shp-1' });
const transporter = user('TRANSPORTER', { partnerId: 'ptr-1' });
const admin = user('ADMIN');

describe('bookingOwnerScope', () => {
  it('reaches a shipper through the shipment above the booking', () => {
    expect(bookingOwnerScope(shipper)).toEqual({ shipment: { shipperId: 'shp-1' } });
  });

  it('reads a transporter straight off the booking', () => {
    expect(bookingOwnerScope(transporter)).toEqual({ partnerId: 'ptr-1' });
  });

  it('does not scope an internal role', () => {
    expect(bookingOwnerScope(admin)).toBeNull();
  });

  it('does not scope a portal account whose company is missing', () => {
    expect(bookingOwnerScope(user('SHIPPER'))).toBeNull();
    expect(bookingOwnerScope(user('TRANSPORTER'))).toBeNull();
  });

  it('never crosses the two portals over', () => {
    expect(bookingOwnerScope(user('SHIPPER', { partnerId: 'ptr-1' }))).toBeNull();
    expect(bookingOwnerScope(user('TRANSPORTER', { shipperId: 'shp-1' }))).toBeNull();
  });
});

describe('cycleOwnerScope', () => {
  it('nests the booking filter under the cycle it belongs to', () => {
    expect(cycleOwnerScope(shipper)).toEqual({ booking: { shipment: { shipperId: 'shp-1' } } });
    expect(cycleOwnerScope(transporter)).toEqual({ booking: { partnerId: 'ptr-1' } });
  });

  it('does not scope an internal role', () => {
    expect(cycleOwnerScope(admin)).toBeNull();
  });
});

describe('ownCompanyScope', () => {
  it('still scopes the flat models it was written for', () => {
    expect(ownCompanyScope(shipper, { shipperField: 'shipperId', partnerField: 'partnerId' })).toEqual({
      shipperId: 'shp-1',
    });
    expect(ownCompanyScope(transporter, { shipperField: 'shipperId', partnerField: 'partnerId' })).toEqual({
      partnerId: 'ptr-1',
    });
    expect(ownCompanyScope(admin, { shipperField: 'shipperId' })).toBeNull();
  });
});
