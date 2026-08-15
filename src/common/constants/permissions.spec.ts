import {
  ALL_PERMISSIONS,
  ALL_RESOURCES,
  PERMISSIONS,
  WILDCARD_ALL,
  grantSatisfies,
  hasPermission,
  isKnownPermission,
} from './permissions';

describe('permission resolution', () => {
  describe('grantSatisfies', () => {
    it('matches an exact permission', () => {
      expect(grantSatisfies('partners.view', 'partners.view')).toBe(true);
    });

    it('rejects a different action on the same resource', () => {
      expect(grantSatisfies('partners.view', 'partners.delete')).toBe(false);
    });

    it('rejects the same action on a different resource', () => {
      expect(grantSatisfies('partners.view', 'vehicles.view')).toBe(false);
    });

    it('honours the global wildcard', () => {
      expect(grantSatisfies(WILDCARD_ALL, 'finance.approve')).toBe(true);
    });

    it('honours a resource wildcard', () => {
      expect(grantSatisfies('partners.*', 'partners.delete')).toBe(true);
    });

    it('does not let a resource wildcard leak to another resource', () => {
      expect(grantSatisfies('partners.*', 'vehicles.delete')).toBe(false);
    });

    it('does not treat a prefix as a resource match', () => {
      /* `partner.*` must not satisfy `partners.view` — the dot boundary is
       * what stops a shorter resource name from swallowing a longer one. */
      expect(grantSatisfies('partner.*', 'partners.view')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('is false when no grant matches', () => {
      expect(hasPermission(['bookings.view'], 'users.delete')).toBe(false);
    });

    it('is true when any grant matches', () => {
      expect(
        hasPermission(['bookings.view', 'users.delete'], 'users.delete'),
      ).toBe(true);
    });

    it('is false for an empty grant list', () => {
      expect(hasPermission([], 'users.view')).toBe(false);
    });
  });

  describe('catalogue integrity', () => {
    it('uses resource.action form throughout', () => {
      for (const permission of ALL_PERMISSIONS) {
        expect(permission).toMatch(/^[a-z][a-z-]*\.[a-z][a-z-]*$/);
      }
    });

    it('contains no duplicates', () => {
      expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    });

    it('derives resources from the catalogue', () => {
      expect(ALL_RESOURCES).toContain('partners');
      expect(ALL_RESOURCES).toContain('empty-returns');
    });

    it('recognises catalogue entries and wildcards', () => {
      expect(isKnownPermission(PERMISSIONS.finance.approve)).toBe(true);
      expect(isKnownPermission('partners.*')).toBe(true);
      expect(isKnownPermission(WILDCARD_ALL)).toBe(true);
    });

    it('rejects an unknown permission', () => {
      expect(isKnownPermission('teleportation.engage')).toBe(false);
      expect(isKnownPermission('nonsense.*')).toBe(false);
    });
  });
});
