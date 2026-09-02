import { buildLocator, locate, type CataloguedPlace } from './bi-geo';

/**
 * The gazetteer is the fallback now, not the source. These pin the resolution
 * order, because it is the only thing keeping a saved coordinate from losing
 * to a hardcoded one that happens to match a substring of the same name.
 */

/** Prisma hands coordinates back as Decimal; the locator only needs `toNumber`. */
const place = (id: string, name: string, lat: number, lng: number): CataloguedPlace => ({
  id,
  name,
  latitude: { toNumber: () => lat },
  longitude: { toNumber: () => lng },
});

describe('bi-geo', () => {
  describe('locate (the gazetteer)', () => {
    it('matches on a substring, longest key first', () => {
      /* "doraleh container terminal" and "doraleh port" both appear in the
         table; the longer key has to win or every DCT shipment lands on DMP. */
      expect(locate('Doraleh Container Terminal (DCT) — Port of Doraleh')).toEqual({
        lat: 11.6094,
        lng: 43.0567,
      });
    });

    it('returns null for a place it has never heard of, rather than guessing', () => {
      expect(locate('Somebody Private Yard, PK20')).toBeNull();
      expect(locate(null)).toBeNull();
      expect(locate('')).toBeNull();
    });
  });

  describe('buildLocator', () => {
    const catalogue = [
      place('loc-1', 'Doraleh Container Terminal (SGTD)', 11.61, 43.05),
      place('loc-2', 'UKAB Free Zone', 11.55, 43.09),
    ];

    it('prefers the linked location over everything else', () => {
      const resolve = buildLocator(catalogue);
      /* The name says Port of Djibouti, which the gazetteer knows and would
         happily answer. The id must still win: it is what the shipment was
         actually created against. */
      expect(resolve('Port of Djibouti', 'loc-1')).toEqual({ lat: 11.61, lng: 43.05 });
    });

    it('falls back to an exact catalogue name, case- and space-insensitively', () => {
      const resolve = buildLocator(catalogue);
      /* This is what makes an old free-text shipment snap onto a place somebody
         has since saved properly. */
      expect(resolve('  ukab   free zone  ')).toEqual({ lat: 11.55, lng: 43.09 });
    });

    it('falls back to the gazetteer for text that matches no saved place', () => {
      const resolve = buildLocator(catalogue);
      expect(resolve('Port of Tadjourah')).toEqual({ lat: 11.7869, lng: 42.8822 });
    });

    it('does not let a stale id resolve to the wrong place', () => {
      const resolve = buildLocator(catalogue);
      /* A shipment pointing at a location that has since been hard-deleted:
         the id misses, and the name still has to be given its chance. */
      expect(resolve('UKAB Free Zone', 'loc-gone')).toEqual({ lat: 11.55, lng: 43.09 });
    });

    it('returns null when nothing knows the place', () => {
      const resolve = buildLocator(catalogue);
      expect(resolve('Somebody Private Yard, PK20', null)).toBeNull();
    });

    it('works with an empty catalogue — every shipment before this table existed', () => {
      const resolve = buildLocator([]);
      expect(resolve('Port of Djibouti')).toEqual({ lat: 11.5951, lng: 43.1437 });
    });
  });
});
