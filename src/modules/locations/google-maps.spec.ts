import { haversineMeters } from './google-maps.service';
import { formatDuration } from './locations.service';

describe('haversineMeters', () => {
  /* The straight-line fallback, used when no API key is configured. Its job is
     to be honestly approximate, not accurate — but it still has to be right
     about the geometry, because it is what gets stored and billed off when
     Google is unreachable. */

  it('is zero between a point and itself', () => {
    const point = { latitude: 11.6094, longitude: 43.0567 };
    expect(haversineMeters(point, point)).toBe(0);
  });

  it('measures the corridor to within a few percent of the published figure', () => {
    /* Doraleh Container Terminal to the DIFTZ gate: about 8.8km as the crow
       flies. The road is longer, which is exactly why this is marked
       `haversine` and never passed off as a driving distance. */
    const metres = haversineMeters(
      { latitude: 11.6094, longitude: 43.0567 },
      { latitude: 11.5364, longitude: 43.0244 },
    );
    expect(metres).toBeGreaterThan(8_500);
    expect(metres).toBeLessThan(9_200);
  });

  it('is symmetric', () => {
    const a = { latitude: 11.5951, longitude: 43.1437 };
    const b = { latitude: 11.7869, longitude: 42.8822 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it('handles a long haul without losing precision to the small-angle case', () => {
    /* Djibouti to Addis Ababa: ~560km great-circle, against a road corridor of
       roughly 900km — the gap this whole module exists to stop anybody quoting
       as a distance. */
    const metres = haversineMeters(
      { latitude: 11.5721, longitude: 43.1456 },
      { latitude: 8.9806, longitude: 38.7578 },
    );
    expect(metres).toBeGreaterThan(550_000);
    expect(metres).toBeLessThan(570_000);
  });
});

describe('formatDuration', () => {
  it('reads as a drive time, not a number of seconds', () => {
    expect(formatDuration(4_500)).toBe('1h 15m');
    expect(formatDuration(1_800)).toBe('30m');
    expect(formatDuration(7_200)).toBe('2h');
  });

  it('is null when the provider gave no duration', () => {
    /* The straight-line fallback has no drive time. Inventing one from an
       average speed would be the same class of guess this module removes. */
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
  });
});
