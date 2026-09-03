import {
  CONTINUITY_WINDOW_MS,
  avoidanceRate,
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
    emptyVehicleId: 'VEH-1',
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

  it('is transporter-level: two different trucks still realize, but the truck is not established', () => {
    // Case from the spec — Vehicle 1 delivered, Vehicle 2 continued. The
    // distance is a fact about the transporter; the factor needs a truck.
    const verdict = classifyContinuation(continuation({ emptyVehicleId: 'VEH-1', nextVehicleId: 'VEH-2' }));
    expect(verdict.status).toBe('realized');
    expect(verdict.vehicleId).toBeNull();
    expect(verdict.note).toMatch(/carbon not priced/);
  });

  it('never links two bookings merely because a load exists — different transporters are not a continuation', () => {
    const verdict = classifyContinuation(continuation({ nextPartnerId: 'PTR-B' }));
    expect(verdict.status).toBe('not_realized');
    expect(verdict.note).toMatch(/Different transporters/);
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
    expect(verdict.note).toMatch(/no direct continuation/);
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
