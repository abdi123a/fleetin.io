import { describe, expect, it } from 'vitest';

import { containerCount, formatKm, shipmentDistance } from './shipmentDistance';

describe('containerCount', () => {
  it('counts the joined references the backend returns', () => {
    expect(containerCount('57734, 3458348, 34583486, 348348, 374357')).toBe(5);
  });

  it('counts a single booking', () => {
    expect(containerCount('57734')).toBe(1);
  });

  it('falls back to one run, never zero, when nothing was recorded', () => {
    for (const value of [null, undefined, '', '   ', ',,']) {
      expect(containerCount(value)).toBe(1);
    }
  });

  it('ignores the gaps a trailing separator leaves', () => {
    expect(containerCount('57734, 3458348,')).toBe(2);
  });
});

describe('shipmentDistance', () => {
  it('is the whole road, not one leg of it', () => {
    /* The case that prompted this: five containers on the 25km corridor read
       "25 km" on the shipment row. */
    const distance = shipmentDistance(25, '57734, 3458348, 34583486, 348348, 374357');
    expect(distance.containers).toBe(5);
    expect(distance.legKm).toBe(25);
    expect(distance.totalKm).toBe(250);
  });

  it('still doubles a single-container shipment — the box comes back', () => {
    expect(shipmentDistance(25, '57734').totalKm).toBe(50);
  });

  it('reads zero when the shipment was never quoted a distance', () => {
    expect(shipmentDistance(0, '57734, 3458348').totalKm).toBe(0);
    expect(shipmentDistance(null, '57734').totalKm).toBe(0);
  });

  it('never returns a negative road', () => {
    expect(shipmentDistance(-25, '57734').totalKm).toBe(0);
  });
});

describe('formatKm', () => {
  it('rounds to whole kilometres and groups thousands', () => {
    expect(formatKm(250)).toBe('250 km');
    expect(formatKm(1250.4)).toBe('1,250 km');
  });
});
