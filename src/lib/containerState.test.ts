import { describe, expect, it } from 'vitest';

import { BOOKING_LADDER } from '@/features/bookings/api/bookingsService';
import { displayShipmentStatus, shipmentProgress } from './shipmentStatus';
import {
  allContainersReturned,
  carriesContainer,
  containerStateLabel,
  containerStateOf,
} from './containerState';

describe('containerStateOf', () => {
  it('reads full for every rung before the box is stripped', () => {
    for (const rung of ['Pending', 'Assigned', 'Loaded', 'En Route', 'Arrived', 'Unloading']) {
      expect(containerStateOf(rung)).toBe('full');
    }
  });

  it('is still full at POD Submitted — the paperwork is in, the cargo is not out', () => {
    expect(containerStateOf('POD Submitted')).toBe('full');
  });

  it('flips to empty on Empty Ready and stays empty while the box is out', () => {
    expect(containerStateOf('Empty Ready')).toBe('empty');
    expect(containerStateOf('Empty Picked Up')).toBe('empty');
  });

  it('goes to returned once the box is home', () => {
    expect(containerStateOf('Completed')).toBe('returned');
  });

  it('moves exactly twice down the ladder, on the two rungs that mean something', () => {
    const states = BOOKING_LADDER.map((rung) => containerStateOf(rung));
    const moves = states.filter((state, index) => index > 0 && state !== states[index - 1]);
    expect(moves).toEqual(['empty', 'returned']);
    expect(states[BOOKING_LADDER.indexOf('Empty Ready') - 1]).toBe('full');
    expect(states[BOOKING_LADDER.indexOf('Completed') - 1]).toBe('empty');
  });

  it('has no state for a load with no box — a bulk Completed is delivered, not returned', () => {
    expect(containerStateOf('Completed', false)).toBeNull();
    expect(containerStateOf('En Route', false)).toBeNull();
  });

  it('has no state off the ladder', () => {
    expect(containerStateOf('Cancelled')).toBeNull();
    expect(containerStateOf('Failed')).toBeNull();
  });
});

describe('containerStateLabel', () => {
  it('keeps one colour but says what the empty is doing', () => {
    expect(containerStateLabel('full', 'En Route')).toBe('Full');
    expect(containerStateLabel('empty', 'Empty Ready')).toBe('Empty');
    expect(containerStateLabel('empty', 'Empty Picked Up')).toBe('Empty · in transit');
    expect(containerStateLabel('returned', 'Completed')).toBe('Returned');
  });
});

describe('allContainersReturned', () => {
  it('is true only when every box on the shipment is home', () => {
    expect(allContainersReturned(['returned', 'returned'])).toBe(true);
    expect(allContainersReturned(['returned', 'empty'])).toBe(false);
    expect(allContainersReturned(['returned', 'full'])).toBe(false);
  });

  it('ignores the loads that have no box, but is false when there are none at all', () => {
    expect(allContainersReturned(['returned', null, 'returned'])).toBe(true);
    // A shipment of pure bulk is delivered, never "all containers home".
    expect(allContainersReturned([null, null])).toBe(false);
    expect(allContainersReturned([])).toBe(false);
  });
});

describe('carriesContainer', () => {
  it('trusts the category over a stray container number', () => {
    expect(carriesContainer({ shipmentCategory: 'container_40' })).toBe(true);
    expect(carriesContainer({ shipmentCategory: 'containerized' })).toBe(true);
    expect(carriesContainer({ shipmentCategory: 'bulk', containerNumber: 'MSKU7070707' })).toBe(false);
    expect(carriesContainer({ shipmentCategory: 'machinery' })).toBe(false);
  });

  it('falls back to the number when no category is on file', () => {
    expect(carriesContainer({ containerNumber: 'MSKU7070707' })).toBe(true);
    expect(carriesContainer({})).toBe(false);
    expect(carriesContainer({ containerNumber: null, shipmentCategory: null })).toBe(false);
  });
});

describe('shipmentProgress', () => {
  it('runs 0 to 100 across the seven steps a container walks', () => {
    expect(shipmentProgress('Pending', true)?.percent).toBe(0);
    expect(shipmentProgress('Completed', true)?.percent).toBe(100);
    expect(shipmentProgress('Empty Ready', true)).toEqual({ percent: 67, step: 5, of: 7 });
  });

  it('agrees with the word on the chip — a "Picked Up" shipment is never 0%', () => {
    for (const rung of ['Driver Assigned', 'Heading to Pickup', 'At Pickup', 'Loading', 'Loaded']) {
      expect(displayShipmentStatus(rung)).toBe('Picked Up');
      expect(shipmentProgress(rung, true)).toEqual({ percent: 17, step: 2, of: 7 });
    }
  });

  it('gives every rung of a step the same figure, since they read as the same step', () => {
    const percentOf = (rung: string) => shipmentProgress(rung, true)?.percent;
    expect(percentOf('Unloading')).toBe(percentOf('POD Submitted'));
    expect(percentOf('En Route')).toBe(percentOf('Arrived'));
  });

  it('never goes backwards down the ladder', () => {
    const percents = BOOKING_LADDER.map((rung) => shipmentProgress(rung, true)?.percent ?? -1);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents.every((p) => p >= 0)).toBe(true);
  });

  it('counts a bulk load over its own three steps — delivered is done', () => {
    expect(shipmentProgress('Pending', false)).toEqual({ percent: 0, step: 1, of: 3 });
    expect(shipmentProgress('Loaded', false)).toEqual({ percent: 50, step: 2, of: 3 });
    expect(shipmentProgress('Completed', false)?.percent).toBe(100);
  });

  it('has no progress at all off the ladder — a stopped job is not part-done', () => {
    expect(shipmentProgress('Cancelled', true)).toBeNull();
    expect(shipmentProgress('Failed', true)).toBeNull();
  });
});
