import { describe, expect, it } from 'vitest';

import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { EMPTY_RETURN_EXCEPTIONS } from '@/data/emptyReturnData';
import {
  MISSION_WINDOW_MULTIPLE,
  UNRATED,
  formatStars,
  fleetRatingTrend,
  ratingTrend,
  readMission,
  summariseFleet,
  summarisePerformance,
} from './rating';

const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** A delivered container mission, on time and back before its deadline. */
function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  const scheduled = '2026-08-01T06:00:00.000Z';
  return {
    id: 'b1',
    reference: '100001',
    shipmentId: 's1',
    status: 'Completed',
    cargoType: 'Container (40ft)',
    shipmentCategory: 'containerized',
    containerNumber: 'ABCU1234567',
    shippingLine: 'Maersk Line',
    partnerId: 'p1',
    vehicleId: 'v1',
    driverId: 'd1',
    containerReturnDepot: 'Doraleh Container Terminal',
    containerReturnDeadline: '2026-08-08T06:00:00.000Z',
    containerReturnFreeDays: 7,
    emptyReturnException: null,
    scheduledPickupTime: scheduled,
    completedAt: '2026-08-02T06:00:00.000Z',
    emptyReadyAt: '2026-08-02T02:00:00.000Z',
    transporterCostMinorUnits: '45000',
    transporterCostCurrency: 'DJF',
    transporterCostFxRate: 1,
    transporterCostBaseAmountMinorUnits: '45000',
    createdAt: scheduled,
    updatedAt: scheduled,
    deletedAt: null,
    shipment: {
      id: 's1',
      reference: '900001',
      shipperId: 'sh1',
      customerName: 'Amina Mohamed',
      customerCompany: 'Amina FZCO',
      partnerId: 'p1',
      pickupLocationName: 'Port of Djibouti',
      deliveryLocationName: 'UKAB Free Zone',
      estimatedDistanceKm: 25,
      /* 24h one way → a 48h mission window. */
      estimatedDurationHours: '24h 00m',
      cargoType: 'Container (40ft)',
      totalWeightKg: 25000,
      scheduledPickupTime: scheduled,
      paymentStatus: 'Paid',
      source: 'custom',
      dpcsReference: '',
      payoutReleasedAt: null,
    },
    ...overrides,
  } as BookingRecord;
}


/* ------------------------------------------------------------------ *
 * The measurements. These are facts about the record and they must
 * keep working — removing the system's *verdict* was never a licence
 * to stop measuring what actually happened.
 * ------------------------------------------------------------------ */

describe('readMission — delivery', () => {
  it('reads a delivered mission', () => {
    expect(readMission(booking(), NOW).delivered).toBe(true);
  });

  it('reads a cancelled or failed mission as closed but not delivered', () => {
    for (const status of ['Cancelled', 'Failed']) {
      const facts = readMission(booking({ status, completedAt: null }), NOW);
      expect(facts.delivered, status).toBe(false);
      expect(facts.closed, status).toBe(true);
    }
  });

  it('reads work in progress as neither delivered nor closed', () => {
    const facts = readMission(booking({ status: 'En Route', completedAt: null }), NOW);
    expect(facts.delivered).toBe(false);
    expect(facts.closed).toBe(false);
  });
});

describe('readMission — the mission window', () => {
  it('is on time inside the window', () => {
    /* 24h estimate → 48h window; closed 24h after the scheduled pickup. */
    expect(readMission(booking(), NOW).onTime).toBe(true);
  });

  it('sits exactly on the window boundary rather than just outside it', () => {
    const closed = new Date(Date.parse('2026-08-01T06:00:00.000Z') + 24 * MISSION_WINDOW_MULTIPLE * HOUR);
    expect(readMission(booking({ completedAt: closed.toISOString() }), NOW).onTime).toBe(true);
  });

  it('is late one millisecond past it', () => {
    const closed = new Date(
      Date.parse('2026-08-01T06:00:00.000Z') + 24 * MISSION_WINDOW_MULTIPLE * HOUR + 1,
    );
    expect(readMission(booking({ completedAt: closed.toISOString() }), NOW).onTime).toBe(false);
  });

  it('cannot time a mission whose shipment carries no routing estimate', () => {
    const shipment = booking().shipment;
    if (!shipment) throw new Error('fixture must carry a shipment');
    const facts = readMission(
      booking({ shipment: { ...shipment, estimatedDurationHours: null } }),
      NOW,
    );
    expect(facts.onTime).toBeNull();
    /* The span is still measured — only the verdict on it is missing. */
    expect(facts.turnaroundHours).toBe(24);
  });

  it('does not time an open mission — it is not late until it closes late', () => {
    expect(readMission(booking({ status: 'En Route', completedAt: null }), NOW).onTime).toBeNull();
  });
});

describe('readMission — loading to delivery', () => {
  it('keeps the span between the scheduled pickup and the close', () => {
    expect(readMission(booking(), NOW).turnaroundHours).toBe(24);
  });

  it('measures it off the empty-ready stamp when the box is not home yet', () => {
    const facts = readMission(
      booking({ status: 'Empty Ready', completedAt: null, emptyReadyAt: '2026-08-02T02:00:00.000Z' }),
      NOW,
    );
    expect(facts.turnaroundHours).toBe(20);
    expect(facts.onTime).toBe(true);
  });

  it('has no span for a mission that never closed', () => {
    expect(
      readMission(booking({ status: 'En Route', completedAt: null, emptyReadyAt: null }), NOW)
        .turnaroundHours,
    ).toBeNull();
  });
});

describe('readMission — the container coming home', () => {
  it('reads a box home before its deadline', () => {
    expect(readMission(booking(), NOW).returnLate).toBe(false);
  });

  it('reads a box returned after the deadline', () => {
    expect(readMission(booking({ completedAt: '2026-08-09T06:00:00.000Z' }), NOW).returnLate).toBe(true);
  });

  it('reads a box still out with its deadline already gone', () => {
    const facts = readMission(booking({ status: 'En Route', completedAt: null, emptyReadyAt: null }), NOW);
    expect(facts.returnLate).toBe(true);
    expect(facts.delivered).toBe(false);
  });

  it('leaves an open mission inside its deadline alone', () => {
    const facts = readMission(
      booking({
        status: 'Empty Ready',
        completedAt: null,
        containerReturnDeadline: '2026-09-30T06:00:00.000Z',
      }),
      NOW,
    );
    expect(facts.returnLate).toBeNull();
  });

  it('has nothing to say about a load with no return deadline', () => {
    expect(readMission(booking({ containerReturnDeadline: null }), NOW).returnLate).toBeNull();
  });

  it('still notes a box that needed a trip of its own', () => {
    expect(
      readMission(
        booking({ emptyReturnException: EMPTY_RETURN_EXCEPTIONS.standaloneRequired }),
        NOW,
      ).standaloneReturn,
    ).toBe(true);
  });
});

describe('summarisePerformance — the figures', () => {
  it('counts missions, on-time closes and late returns off the record', () => {
    /* Past the 48h window and past the 2026-08-08 return deadline both. */
    const late = new Date(Date.parse('2026-08-01T06:00:00.000Z') + 200 * HOUR).toISOString();
    const summary = summarisePerformance(
      [
        booking({ id: 'a' }),
        booking({ id: 'b' }),
        booking({ id: 'c', completedAt: late }),
        booking({ id: 'd', status: 'Failed', completedAt: null }),
      ],
      NOW,
    );
    expect(summary.missions).toBe(3);
    expect(summary.closed).toBe(4);
    expect(summary.onTime).toBe(2);
    expect(summary.timed).toBe(3);
    expect(summary.onTimePct).toBe(67);
    expect(summary.lateReturns).toBe(1);
    /* The failed mission never had a return to judge. */
    expect(summary.returnsTracked).toBe(3);
  });

  it('averages the loading-to-delivery span', () => {
    const summary = summarisePerformance(
      [booking({ id: 'a' }), booking({ id: 'b', completedAt: '2026-08-03T06:00:00.000Z' })],
      NOW,
    );
    expect(summary.turnaroundHours).toBe(36);
  });

  it('counts missions from the Delivered rung, not from the box coming home', () => {
    /* The bug this pins: the profile showed 0 missions for a driver just moved
       to "Delivered", because that step writes `Arrived` and only `Completed`
       carries `completedAt`. */
    for (const status of ['Arrived', 'Unloading', 'POD Submitted', 'Empty Ready', 'Empty Picked Up']) {
      const summary = summarisePerformance(
        [booking({ status, completedAt: null, emptyReadyAt: null })],
        NOW,
      );
      expect(summary.missions, status).toBe(1);
    }
  });

  it('counts nothing on the rungs before it', () => {
    for (const status of ['Pending', 'Assigned', 'Driver Assigned', 'Loading', 'Loaded', 'En Route']) {
      const summary = summarisePerformance(
        [booking({ status, completedAt: null, emptyReadyAt: null })],
        NOW,
      );
      expect(summary.missions, status).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The star. Every one of them is somebody's answer; the system has
 * no opinion of its own and must never acquire one.
 * ------------------------------------------------------------------ */

describe('summarisePerformance — the star is human, and only human', () => {
  it('does not rate a spotless record nobody has marked', () => {
    /* Delivered, on time, box home early — a perfect mission by every
       measurement, and still not a rating. Nobody was asked. */
    const summary = summarisePerformance([booking({ id: 'a' }), booking({ id: 'b' })], NOW);
    expect(summary.missions).toBe(2);
    expect(summary.onTimePct).toBe(100);
    expect(summary.rated).toBe(false);
    expect(summary.overall).toBeNull();
    expect(formatStars(summary.overall)).toBe('—');
  });

  it('does not mark down a carrier who only ever failed', () => {
    /* The facts say every mission failed and the screens will print exactly
       that. What the facts may not do is turn themselves into one star. */
    const summary = summarisePerformance(
      [booking({ status: 'Failed', completedAt: null, containerReturnDeadline: null })],
      NOW,
    );
    expect(summary.closed).toBe(1);
    expect(summary.missions).toBe(0);
    expect(summary.rated).toBe(false);
    expect(summary.overall).toBeNull();
  });

  it('does not mark down an overdue box', () => {
    const summary = summarisePerformance(
      [booking({ status: 'En Route', completedAt: null, emptyReadyAt: null })],
      NOW,
    );
    expect(summary.lateReturns).toBe(1);
    expect(summary.professionalism).toBeNull();
    expect(summary.rated).toBe(false);
  });

  it('takes the stars a person gave, unaltered', () => {
    const summary = summarisePerformance(
      [
        booking({
          driverRatingReliability: 4,
          driverRatingPunctuality: 2,
          driverRatingProfessionalism: 3,
        }),
      ],
      NOW,
    );
    expect(summary.reliability).toBe(4);
    expect(summary.punctuality).toBe(2);
    expect(summary.professionalism).toBe(3);
    expect(summary.overall).toBe(3);
    expect(summary.ratedMissions).toBe(1);
  });

  it('never lets a measurement fill in an axis nobody answered', () => {
    /* A spotless mission marked 2 on punctuality alone. The other two axes
       stay empty — the record is not allowed to answer for the person. */
    const summary = summarisePerformance([booking({ driverRatingPunctuality: 2 })], NOW);
    expect(summary.punctuality).toBe(2);
    expect(summary.reliability).toBeNull();
    expect(summary.professionalism).toBeNull();
    expect(summary.overall).toBe(2);
  });

  it('ignores a zero — an axis left blank in the debrief is unanswered, not nought', () => {
    const summary = summarisePerformance([booking({ driverRatingReliability: 0 })], NOW);
    expect(summary.reliability).toBeNull();
    expect(summary.rated).toBe(false);
    expect(summary.ratedMissions).toBe(0);
  });

  it('counts a debrief saved as one overall with no axes broken out', () => {
    const summary = summarisePerformance([booking({ driverRating: 4 })], NOW);
    expect(summary.ratedMissions).toBe(1);
  });

  it('averages across the missions people marked, and ignores the rest', () => {
    const summary = summarisePerformance(
      [
        booking({ id: 'a', driverRatingReliability: 5 }),
        booking({ id: 'b', driverRatingReliability: 3 }),
        booking({ id: 'c' }),
      ],
      NOW,
    );
    expect(summary.reliability).toBe(4);
    expect(summary.ratedMissions).toBe(2);
    expect(summary.missions).toBe(3);
  });

  it('is unrated where nothing was ever asked', () => {
    expect(UNRATED.rated).toBe(false);
    expect(UNRATED.overall).toBeNull();
    expect(UNRATED.ratedMissions).toBe(0);
  });
});

describe('summariseFleet — a transporter is its drivers', () => {
  it('builds the star out of the marks its drivers were given', () => {
    const summary = summariseFleet(
      [
        booking({ id: 'a', driverId: 'd1', driverRatingReliability: 5 }),
        booking({ id: 'b', driverId: 'd2', driverRatingReliability: 3 }),
      ],
      NOW,
    );
    expect(summary.reliability).toBe(4);
    expect(summary.ratedMissions).toBe(2);
  });

  it('weighs the star per mission, so a busy driver moves it further', () => {
    /* d1 ran three missions at 5, d2 ran one at 1. Per driver that is 3.0;
       per mission it is 4.0, which is what the shipper actually met. */
    const summary = summariseFleet(
      [
        booking({ id: 'a', driverId: 'd1', driverRatingReliability: 5 }),
        booking({ id: 'b', driverId: 'd1', driverRatingReliability: 5 }),
        booking({ id: 'c', driverId: 'd1', driverRatingReliability: 5 }),
        booking({ id: 'd', driverId: 'd2', driverRatingReliability: 1 }),
      ],
      NOW,
    );
    expect(summary.reliability).toBe(4);
  });

  it('cannot be rated by a mission with no driver on it', () => {
    /* There is no driver for that mark to have been about, so it contributes
       its figures and no star. */
    const summary = summariseFleet(
      [booking({ id: 'a', driverId: null, driverRatingReliability: 5 })],
      NOW,
    );
    expect(summary.rated).toBe(false);
    expect(summary.ratedMissions).toBe(0);
    expect(summary.missions).toBe(1);
  });

  it('still counts every mission the carrier ran, driver or not', () => {
    const summary = summariseFleet(
      [
        booking({ id: 'a', driverId: 'd1', driverRatingReliability: 4 }),
        booking({ id: 'b', driverId: null }),
      ],
      NOW,
    );
    expect(summary.missions).toBe(2);
    expect(summary.onTimePct).toBe(100);
    expect(summary.overall).toBe(4);
  });
});

describe('ratingTrend', () => {
  it('returns one point per month, oldest first', () => {
    const points = ratingTrend([], 6, NOW);
    expect(points).toHaveLength(6);
    expect(points.map((p) => p.month)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('buckets a mission by the month it closed, not the month it was booked', () => {
    const points = ratingTrend(
      [booking({ scheduledPickupTime: '2026-06-28T06:00:00.000Z', completedAt: '2026-07-01T06:00:00.000Z' })],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === '2026-07')?.missions).toBe(1);
    expect(points.find((p) => p.month === '2026-06')?.missions).toBe(0);
  });

  it('plots the stars people gave, and leaves an unrated month null', () => {
    const points = ratingTrend([booking({ driverRatingReliability: 4 })], 6, NOW);
    expect(points.find((p) => p.month === '2026-08')?.rating).toBe(4);
    expect(points.find((p) => p.month === '2026-05')?.rating).toBeNull();
  });

  it('leaves a month of unmarked missions null rather than inventing a level', () => {
    const points = ratingTrend([booking()], 6, NOW);
    expect(points.find((p) => p.month === '2026-08')?.missions).toBe(1);
    expect(points.find((p) => p.month === '2026-08')?.rating).toBeNull();
  });

  it('draws a carrier line from its drivers only', () => {
    const points = fleetRatingTrend(
      [
        booking({ id: 'a', driverId: 'd1', driverRatingReliability: 4 }),
        booking({ id: 'b', driverId: null, driverRatingReliability: 1 }),
      ],
      6,
      NOW,
    );
    expect(points.find((p) => p.month === '2026-08')?.rating).toBe(4);
  });
});
