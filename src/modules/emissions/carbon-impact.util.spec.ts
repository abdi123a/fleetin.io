import {
  CONTINUITY_WINDOW_MS,
  avoidanceRate,
  avoidedMetres,
  avoidedProvider,
  classifyContinuation,
  earliestTimestamp,
  pickCounted,
  type ContinuationInput,
} from './carbon-impact.util';

const T0 = Date.parse('2026-09-01T08:00:00.000Z');
const HOUR = 3_600_000;

/** A clean continuation: same carrier, same truck, loaded two hours later. */
function continuation(overrides: Partial<ContinuationInput> = {}): ContinuationInput {
  return {
    emptyPartnerId: 'PTR-A',
    nextPartnerId: 'PTR-A',
    emptyVehicleId: null,
    nextVehicleId: 'VEH-1',
    emptyCollectedAt: T0,
    nextCollectedAt: T0 + 2 * HOUR,
    nextDelivered: true,
    garageStopRecorded: false,
    ...overrides,
  };
}

describe('classifyContinuation', () => {
  it('realizes a same-transporter continuation collected inside the window', () => {
    const verdict = classifyContinuation(continuation());
    expect(verdict.status).toBe('realized');
    expect(verdict.realizedAt).toBe(T0 + 2 * HOUR);
    expect(verdict.continuationMinutes).toBe(120);
    expect(verdict.vehicleId).toBe('VEH-1');
    expect(verdict.note).toBeNull();
  });

  it('prices with the truck that made the continuation — the next load’s', () => {
    // Case from the spec — Vehicle 1 delivered, Vehicle 2 continued. Vehicle 2
    // is the truck on the next load; its factor prices the garage trip.
    const verdict = classifyContinuation(continuation({ emptyVehicleId: null, nextVehicleId: 'VEH-2' }));
    expect(verdict.status).toBe('realized');
    expect(verdict.vehicleId).toBe('VEH-2');
    expect(verdict.note).toBeNull();
  });

  it('notes a recorded return truck that is not the next load’s, and still prices with the latter', () => {
    const verdict = classifyContinuation(continuation({ emptyVehicleId: 'VEH-9', nextVehicleId: 'VEH-2' }));
    expect(verdict.status).toBe('realized');
    expect(verdict.vehicleId).toBe('VEH-2');
    expect(verdict.note).toMatch(/different truck/);
  });

  it('keeps the kilometres and leaves the carbon unpriced when the next load has no truck', () => {
    const verdict = classifyContinuation(continuation({ nextVehicleId: null }));
    expect(verdict.status).toBe('realized');
    expect(verdict.vehicleId).toBeNull();
    expect(verdict.note).toMatch(/not priced/);
  });

  it('calls one carrier a continuation and two carriers a handover, on the same evidence', () => {
    expect(classifyContinuation(continuation()).model).toBe('continuation');
    const handover = classifyContinuation(continuation({ nextPartnerId: 'PTR-B', nextVehicleId: 'VEH-B' }));
    expect(handover.status).toBe('realized');
    expect(handover.model).toBe('handover');
    expect(handover.vehicleId).toBe('VEH-B');
  });

  it('holds a handover to the same window as a continuation', () => {
    const verdict = classifyContinuation(
      continuation({ nextPartnerId: 'PTR-B', nextCollectedAt: T0 + CONTINUITY_WINDOW_MS + HOUR }),
    );
    expect(verdict.status).toBe('not_realized');
    expect(verdict.model).toBe('handover');
  });

  it('refuses a match whose truck went back to the garage anyway', () => {
    // Case 3: the route records a positioning leg through the garage.
    const verdict = classifyContinuation(continuation({ garageStopRecorded: true }));
    expect(verdict.status).toBe('not_realized');
  });

  it('does not let a next-day match claim the previous day’s repositioning', () => {
    // Case 4: the empty left at 15:00, the load was collected at 07:00 next day.
    const verdict = classifyContinuation(
      continuation({ emptyCollectedAt: T0, nextCollectedAt: T0 + CONTINUITY_WINDOW_MS + 4 * HOUR }),
    );
    expect(verdict.status).toBe('not_realized');
    expect(verdict.note).toMatch(/not the same trip/);
  });

  it('accepts a pickup exactly at the edge of the window', () => {
    const verdict = classifyContinuation(
      continuation({ emptyCollectedAt: T0, nextCollectedAt: T0 + CONTINUITY_WINDOW_MS }),
    );
    expect(verdict.status).toBe('realized');
  });

  it('refuses a load collected before the empty came free', () => {
    const verdict = classifyContinuation(continuation({ nextCollectedAt: T0 - HOUR }));
    expect(verdict.status).toBe('not_realized');
  });

  describe('an opportunity is not an impact', () => {
    it('stays matched while the next load has no transporter', () => {
      expect(classifyContinuation(continuation({ nextPartnerId: null })).status).toBe('matched');
    });

    it('stays matched until the empty has actually been collected', () => {
      expect(classifyContinuation(continuation({ emptyCollectedAt: null })).status).toBe('matched');
    });

    it('stays matched until the next load is delivered — the evidenced rung', () => {
      expect(classifyContinuation(continuation({ nextDelivered: false })).status).toBe('matched');
    });

    it('stays matched, never guessed, when the pickup time was not recorded', () => {
      const verdict = classifyContinuation(continuation({ nextCollectedAt: null }));
      expect(verdict.status).toBe('matched');
      expect(verdict.note).toMatch(/pickup time/);
    });
  });
});

describe('avoidedMetres', () => {
  it('is the garage round trip on a continuation', () => {
    expect(avoidedMetres({ model: 'continuation', toGarage: 9200, fromGarage: 19400, detour: null })).toBe(28600);
  });

  it('is the empty carrier’s two legs less the other carrier’s detour on a handover, never below zero', () => {
    expect(avoidedMetres({ model: 'handover', toGarage: 12000, fromGarage: 15000, detour: 4000 })).toBe(23000);
    // A free zone on the way to the port is a negative detour — a bonus.
    expect(avoidedMetres({ model: 'handover', toGarage: 12000, fromGarage: 15000, detour: -1500 })).toBe(28500);
    expect(avoidedMetres({ model: 'handover', toGarage: 2000, fromGarage: 1000, detour: 9000 })).toBe(0);
  });
});

describe('avoidedProvider', () => {
  it('is a road only when both halves were measured as one', () => {
    expect(avoidedProvider('google', 'google')).toBe('google');
    expect(avoidedProvider('google', 'haversine')).toBe('haversine');
    expect(avoidedProvider('haversine', 'google')).toBe('haversine');
  });
});

describe('pickCounted', () => {
  it('counts one continuation per load — the earliest pairing', () => {
    const a = { id: 'b', createdAt: new Date(T0 + HOUR) };
    const b = { id: 'a', createdAt: new Date(T0) };
    const c = { id: 'c', createdAt: new Date(T0) };
    expect(pickCounted([a, b, c])?.id).toBe('a');
    expect(pickCounted([])).toBeNull();
  });
});

describe('avoidanceRate', () => {
  it('is the avoided share of the counterfactual road, and nothing without a baseline', () => {
    expect(avoidanceRate(30, 70)).toBe(30);
    expect(avoidanceRate(0, 70)).toBeNull();
    expect(avoidanceRate(30, 0)).toBeNull();
  });
});

describe('earliestTimestamp', () => {
  it('takes the earliest of the named rungs and ignores the rest', () => {
    const steps = [
      { key: 'departure', timestamp: new Date(T0 + 3 * HOUR) },
      { key: 'gate_in', timestamp: new Date(T0 + HOUR) },
      { key: 'arrival', timestamp: new Date(T0 + 5 * HOUR) },
      { key: 'pickup', timestamp: null },
    ];
    expect(earliestTimestamp(steps, ['gate_in', 'pickup', 'departure'])).toBe(T0 + HOUR);
    expect(earliestTimestamp(steps, ['pickup'])).toBeNull();
  });
});
