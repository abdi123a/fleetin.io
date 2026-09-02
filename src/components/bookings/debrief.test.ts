import { describe, expect, it } from 'vitest';

import { debriefSubjectsFor } from './BookingDebriefDialog';

/**
 * Who gets asked, and when.
 *
 * The rule is worth pinning down because it is invisible in the UI until the
 * exact moment it matters: a container closing with a second driver on it owes
 * two answers, and the way that used to fail was silent — the driver who
 * fetched the empty was not asked, so their trip carried whatever stars the
 * delivery driver had been given days earlier.
 */
describe('debriefSubjectsFor', () => {
  it('asks nothing until the box is home', () => {
    /* Delivery used to be debriefed at `Arrived`, which split one booking's
       verdicts across two days — and asked how the carrier did while the empty
       leg they still owed had not happened. */
    expect(debriefSubjectsFor('Arrived')).toEqual([]);
    expect(debriefSubjectsFor('Empty Ready')).toEqual([]);
    expect(debriefSubjectsFor('Empty Picked Up')).toEqual([]);
  });

  it('asks about both drivers when the box comes home', () => {
    expect(debriefSubjectsFor('Completed', { separateReturnDriver: true })).toEqual([
      'driver',
      'returnDriver',
    ]);
  });

  /* Only drivers are rated. The shipper was a third question here until
     2026-09-01: stars measure how somebody drove, and a shipper does not
     drive. */
  it('never asks about the shipper', () => {
    for (const options of [{}, { separateReturnDriver: true }, { separateReturnDriver: false }]) {
      expect(debriefSubjectsFor('Completed', options)).not.toContain('shipper');
    }
  });

  it('asks about one driver when the same crew took the empty back', () => {
    /* One person, one answer — and it belongs on the delivery columns, where
       that driver's other trips are already counted. */
    expect(debriefSubjectsFor('Completed')).toEqual(['driver']);
    expect(debriefSubjectsFor('Completed', { separateReturnDriver: false })).toEqual(['driver']);
  });

  it('keeps the driver first, so the round trip is answered in the order it happened', () => {
    const [first, second] = debriefSubjectsFor('Completed', { separateReturnDriver: true });
    expect(first).toBe('driver');
    expect(second).toBe('returnDriver');
  });
});
