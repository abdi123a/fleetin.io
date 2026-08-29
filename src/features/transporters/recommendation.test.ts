import { describe, expect, it } from 'vitest';
import { recommendTransporters } from '@/features/transporters/recommendation';
import type { PartnerRecord } from '@/types/partner';
import type { EmptyReturnBookingRecord } from '@/features/empty-returns';

const NOW = Date.UTC(2026, 7, 29, 9, 0);
const H = 3_600_000;

const partner = (id: string, vehicles: number): PartnerRecord =>
  ({
    id,
    companyLegalName: id,
    vehicles: Array.from({ length: vehicles }, (_, i) => ({ id: `${id}-v${i}` })),
  }) as unknown as PartnerRecord;

const empty = (partnerId: string, over: Partial<EmptyReturnBookingRecord> = {}) =>
  ({
    id: `${partnerId}-box`,
    partnerId,
    containerNumber: 'MSKU1234567',
    shippingLine: 'Maersk',
    shipmentCategory: 'container_40',
    cargoType: 'Container (40ft)',
    emptyReadyAt: new Date(NOW - 24 * H).toISOString(),
    containerReturnDeadline: new Date(NOW + 96 * H).toISOString(),
    emptyReturnException: null,
    ...over,
  }) as unknown as EmptyReturnBookingRecord;

const run = (partners: PartnerRecord[], available: EmptyReturnBookingRecord[], rate = () => 65_000) =>
  recommendTransporters({
    partners,
    available,
    line: 'Maersk',
    sizes: ["40'"],
    pickupAt: NOW + 12 * H,
    vehiclesNeeded: 1,
    rateOf: rate,
    considerEmpties: true,
  });

describe('transporter recommendation — the score has to mean something', () => {
  /* The bug the user reported on 2026-08-29: every carrier printed 25%.
     Empties/urgency/scheduled are 75 of the 100 points, and none of them are
     winnable when nobody holds a box — so the whole list collapsed onto the
     15 + 10 that were left and read as "all of these are bad". */
  it('does not collapse every carrier to 25% when nobody holds an empty', () => {
    const { ranked, noEmptiesAnywhere } = run(
      [partner('A', 10), partner('B', 8), partner('C', 1)],
      [],
    );
    expect(noEmptiesAnywhere).toBe(true);
    expect(ranked.every((r) => r.score === 25)).toBe(false);
    // The best available carrier should read as a good answer, not a poor one.
    expect(ranked[0].score).toBeGreaterThan(80);
  });

  it('breaks the fleet tie on headroom — 10 trucks outranks 8 for a 1-truck job', () => {
    const { ranked } = run([partner('B', 8), partner('A', 10)], []);
    expect(ranked[0].name).toBe('A');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('still puts a carrier holding a compatible empty on top', () => {
    const { ranked, noEmptiesAnywhere } = run(
      [partner('BIGFLEET', 20), partner('HASBOX', 2)],
      [empty('HASBOX')],
    );
    expect(noEmptiesAnywhere).toBe(false);
    expect(ranked[0].name).toBe('HASBOX');
    expect(ranked[0].emptiesHeld).toBe(1);
    // And the carrier holding nothing is visibly worse, not merely second.
    expect(ranked[0].score - ranked[1].score).toBeGreaterThan(20);
  });

  it('counts the empties it is holding, so the panel can print the number', () => {
    const { ranked } = run(
      [partner('HASBOX', 4)],
      [empty('HASBOX', { id: 'b1' }), empty('HASBOX', { id: 'b2' })],
    );
    expect(ranked[0].emptiesHeld).toBe(2);
  });

  it('ignores a box of the wrong line or size — same gates as Matching', () => {
    const wrongLine = run([partner('X', 2)], [empty('X', { shippingLine: 'CMA CGM' })]);
    expect(wrongLine.ranked[0].emptiesHeld).toBe(0);

    const wrongSize = run(
      [partner('X', 2)],
      [empty('X', { shipmentCategory: 'container_20', cargoType: 'Container (20ft)' })],
    );
    expect(wrongSize.ranked[0].emptiesHeld).toBe(0);
  });

  it('ignores a box already committed to its own return', () => {
    const { ranked } = run(
      [partner('X', 2)],
      [empty('X', { emptyReturnException: 'Standalone empty return required' })],
    );
    expect(ranked[0].emptiesHeld).toBe(0);
  });

  it('prefers the cheaper carrier when everything else is equal', () => {
    const { ranked } = run(
      [partner('DEAR', 5), partner('CHEAP', 5)],
      [],
      (p) => (p.companyLegalName === 'CHEAP' ? 50_000 : 90_000),
    );
    expect(ranked[0].name).toBe('CHEAP');
  });
});
