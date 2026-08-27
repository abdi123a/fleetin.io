import { describe, expect, it } from 'vitest';
import { incompatibilityReasons, zoneOf } from '@/features/empty-returns/matching';
import { shipmentStepsFor } from '@/lib/shipmentStatus';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';

const NOW = Date.UTC(2026, 7, 27, 9, 0);
const HOUR = 3_600_000;

/* Only the fields the gates read. The rest of both records is irrelevant to
   compatibility, and spelling it out would date the moment either type grows. */
const record = (over: Partial<EmptyReturnRecord> = {}) =>
  ({
    size: "40'",
    line: 'MSC',
    transporter: 'Dikhil Heavy Haulage',
    returnDepot: 'SGTD Yard',
    locationId: 'Boulaos Whse',
    locationName: 'Boulaos Whse',
    deadline: NOW + 48 * HOUR,
    ...over,
  }) as EmptyReturnRecord;

const load = (over: Partial<FullLoadMission> = {}) =>
  ({
    size: "40'",
    line: 'MSC',
    transporter: 'Dikhil Heavy Haulage',
    pickupHub: 'SGTD',
    locationId: 'SGTD',
    pickupAt: NOW + 4 * HOUR,
    ...over,
  }) as FullLoadMission;

describe('compatibility gates', () => {
  it('accepts a pairing that matches on transporter, size and zone', () => {
    expect(incompatibilityReasons(record(), load(), NOW)).toEqual([]);
  });

  /* The user's rule, 2026-08-27: what the box is booked under is the shipper's
     problem, not the carrier's. */
  it('does not care that the shipping lines differ', () => {
    const issues = incompatibilityReasons(record({ line: 'MSC' }), load({ line: 'CMA CGM' }), NOW);
    expect(issues).toEqual([]);
  });

  it('refuses a different transporter — two carriers cannot share one trip', () => {
    const issues = incompatibilityReasons(record(), load({ transporter: 'Nagad Transit SARL' }), NOW);
    expect(issues).toContain('Different transporter');
  });

  it('refuses a load with no transporter yet', () => {
    const issues = incompatibilityReasons(record(), load({ transporter: null }), NOW);
    expect(issues).toContain('Load has no transporter assigned yet');
  });

  it('refuses a different container size', () => {
    expect(incompatibilityReasons(record(), load({ size: "20'" }), NOW)).toContain(
      'Different container size',
    );
  });

  it('refuses a different zone', () => {
    expect(
      incompatibilityReasons(record({ returnDepot: 'Damerjog Depot' }), load(), NOW),
    ).toContain('Different port / free zone');
  });

  /* The regression that made the location gate worth writing a test for: the
     depot and the hub are the same place under two names, and comparing the
     raw strings rejected every pair in the book. */
  it('accepts a depot and a hub that name one zone differently', () => {
    expect(
      incompatibilityReasons(record({ returnDepot: 'Doraleh Depot' }), load({ pickupHub: 'DCT Doraleh', locationId: 'DCT Doraleh' }), NOW),
    ).toEqual([]);
  });

  it('refuses a pickup after the deadline', () => {
    const issues = incompatibilityReasons(record({ deadline: NOW + HOUR }), load(), NOW);
    expect(issues).toContain('Pickup falls after the return deadline');
  });
});

describe('zoneOf', () => {
  it('folds the depot and the hub of one place onto the same zone', () => {
    expect(zoneOf('SGTD')).toBe(zoneOf('SGTD Yard'));
    expect(zoneOf('DCT Doraleh')).toBe(zoneOf('Doraleh Depot'));
    expect(zoneOf('PK12 Park')).toBe(zoneOf('PK12 Depot'));
  });

  it('keeps genuinely different zones apart', () => {
    expect(zoneOf('Port de Djibouti')).not.toBe(zoneOf('DCT Doraleh'));
    expect(zoneOf('Damerjog Depot')).not.toBe(zoneOf('Horizon Terminal'));
    expect(zoneOf('Boulaos Whse')).not.toBe(zoneOf('Gabode Whse'));
  });

  it('prefers the more specific zone when a name carries two', () => {
    expect(zoneOf('Djibouti Multipurpose Port (DMP) — Doraleh Port, Djibouti')).toBe('doraleh');
  });

  it('falls back to the place itself, so an unknown name matches only itself', () => {
    expect(zoneOf('Somewhere New')).toBe('somewhere new');
    expect(zoneOf('Somewhere New')).not.toBe(zoneOf('Somewhere Else'));
    expect(zoneOf(null)).toBe('');
  });
});

/* The user's rule, 2026-08-27: bulk cargo is tipped, not stripped. */
describe('the ladder a load walks', () => {
  it('gives a containerized load the full seven steps, ending at the empty', () => {
    const steps = shipmentStepsFor(true);
    expect(steps.map((s) => s.label)).toEqual([
      'Created',
      'Picked Up',
      'Delivered',
      'Depotage',
      'Empty Ready',
      'Empty Picked Up',
      'Empty Returned',
    ]);
  });

  it('gives a bulk load three steps, ending at delivery', () => {
    const steps = shipmentStepsFor(false);
    expect(steps.map((s) => s.label)).toEqual(['Created', 'Picked Up', 'Delivered']);
  });

  it('makes a bulk "Delivered" write Completed — delivery IS the end of the job', () => {
    const steps = shipmentStepsFor(false);
    expect(steps[steps.length - 1]).toEqual({ rung: 'Completed', label: 'Delivered' });
  });

  it('offers a bulk load no dépotage and no empty-return rung', () => {
    const rungs = shipmentStepsFor(false).map((s) => s.rung);
    expect(rungs).not.toContain('POD Submitted');
    expect(rungs).not.toContain('Empty Ready');
    expect(rungs).not.toContain('Empty Picked Up');
  });
});
