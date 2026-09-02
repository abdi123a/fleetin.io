import { describe, expect, it } from 'vitest';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import type { EmptyReturnCycleRecord } from '@/features/empty-returns/api/emptyReturnsService';
import type { ShipmentTimelineStepRecord } from '@/features/shipments/api/shipmentsService';
import { detentionRatePerContainerDay } from '@/lib/bi/config';
import { computeMissionReport } from './missionReport';
import { computeMonthlyReport } from './monthlyReport';
import { DAY, HOUR, MIN, formatDuration } from './reportFormat';

/**
 * The reporting definitions, pinned against the specification's own worked
 * examples.
 *
 * These are tests about *meaning*, not coverage: what "pickup waiting time" is
 * a subtraction of, when a return counts as delayed, how many detention days a
 * 1d 16h 30m overrun is, and who owns the delay when the empty was not even
 * ready by the deadline. Every number below is copied from the specification —
 * if one of them changes here, the report has changed what it claims.
 */

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const AUG = '2026-08';
const at = (day: number, time: string) => `${AUG}-${String(day).padStart(2, '0')}T${time}:00.000Z`;

function step(key: string, timestamp: string | null): ShipmentTimelineStepRecord {
  return {
    id: `TL-${key}`,
    key,
    title: key,
    description: '',
    timestamp,
    status: 'done',
    actor: null,
    location: null,
    podFileUrl: null,
    notes: null,
  };
}

/** The specification's §3 timeline, to the minute. */
const SPEC_TIMELINE: ShipmentTimelineStepRecord[] = [
  step('creation', at(12, '08:00')),
  step('vehicle_assignment', at(12, '08:35')),
  step('left_for_pickup', at(12, '09:02')),
  step('gate_in', at(12, '09:48')),
  step('loading_start', at(12, '10:15')),
  step('pickup', at(12, '11:32')),
  step('departure', at(12, '11:45')),
  step('arrival', at(12, '15:20')),
  step('unloading_start', at(12, '15:42')),
  step('pod_upload', at(12, '16:12')),
];

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'BKG-1',
    reference: 'BKG-00001',
    shipmentId: 'MSN-1',
    status: 'Completed',
    cargoType: "Container 40ft — Rice",
    shipmentCategory: 'container_40',
    containerNumber: 'MSCU-457120-9',
    shippingLine: 'MSC',
    partnerId: 'PTR-1',
    vehicleId: 'VEH-1',
    driverId: 'DRV-1',
    containerReturnDepot: 'Doraleh Depot',
    containerReturnDeadline: at(16, '18:00'),
    containerReturnFreeDays: 7,
    emptyReturnException: null,
    scheduledPickupTime: at(12, '09:00'),
    completedAt: null,
    transporterCostMinorUnits: '45000',
    transporterCostCurrency: 'DJF',
    transporterCostFxRate: 1,
    transporterCostBaseAmountMinorUnits: '45000',
    createdAt: at(12, '08:00'),
    updatedAt: at(18, '12:00'),
    deletedAt: null,
    timeline: SPEC_TIMELINE,
    ...overrides,
  };
}

function cycle(overrides: Partial<EmptyReturnCycleRecord> = {}): EmptyReturnCycleRecord {
  return {
    id: 'CYC-1',
    reference: 'CYC-00001',
    bookingId: 'BKG-1',
    booking: {} as EmptyReturnCycleRecord['booking'],
    nextBookingId: null,
    nextBooking: null,
    chainId: null,
    seq: null,
    status: 'completed',
    // §5's example: dépotage of 1d 19h 10m from a 16:12 delivery.
    emptyReadyAt: at(14, '11:22'),
    returnedAt: at(15, '11:45'),
    createdAt: at(12, '08:00'),
    updatedAt: at(15, '11:45'),
    ...overrides,
  };
}

const NOW = new Date(at(20, '12:00')).getTime();

/* ── §3 Timeline ───────────────────────────────────────────────────────── */

describe('mission timeline (§3)', () => {
  it('spends the specification’s own time between the specification’s own stages', () => {
    const report = computeMissionReport({ booking: booking(), cycle: cycle(), now: NOW });
    const spent = new Map(report.timeline.map((row) => [row.key, row.durationMs]));

    expect(spent.get('assigned')).toBeNull();
    expect(spent.get('left_for_loading')).toBe(27 * MIN);
    expect(spent.get('arrived_pickup')).toBe(46 * MIN);
    expect(spent.get('loading_started')).toBe(27 * MIN);
    expect(spent.get('loading_completed')).toBe(77 * MIN);
    expect(spent.get('left_for_dropoff')).toBe(13 * MIN);
    expect(spent.get('arrived_dropoff')).toBe(3 * HOUR + 35 * MIN);
    expect(spent.get('unloading_started')).toBe(22 * MIN);
    expect(spent.get('container_delivered')).toBe(30 * MIN);
  });

  it('names the dépotage interval on the rung it ends at, and calls it the bottleneck', () => {
    const report = computeMissionReport({ booking: booking(), cycle: cycle(), now: NOW });
    const emptyReady = report.timeline.find((row) => row.key === 'empty_ready');

    expect(emptyReady?.intervalLabel).toBe('Unstuffing');
    expect(emptyReady?.isLongest).toBe(true);
    expect(formatDuration(emptyReady?.durationMs)).toBe('1d 19h 10m');
  });

  it('lists what has not happened as pending rather than as zero', () => {
    const partial = booking({
      status: 'En Route',
      timeline: SPEC_TIMELINE.slice(0, 7),
      completedAt: null,
    });
    const report = computeMissionReport({ booking: partial, cycle: undefined, now: NOW });

    expect(report.isClosed).toBe(false);
    expect(report.timeline.filter((row) => row.at === null).map((row) => row.key)).toEqual([
      'arrived_dropoff',
      'unloading_started',
      'container_delivered',
      'empty_ready',
      'empty_picked_up',
      'empty_returned',
    ]);
  });
});

/* ── §4 Transport KPIs ─────────────────────────────────────────────────── */

describe('transport performance (§4, §14)', () => {
  it('computes every KPI as the subtraction the specification defines', () => {
    const report = computeMissionReport({
      booking: booking({ completedAt: at(15, '12:10') }),
      cycle: cycle(),
      now: NOW,
    });
    const { kpis } = report;

    expect(kpis.transitMs).toBe(3 * HOUR + 35 * MIN);
    expect(kpis.waitPickupMs).toBe(27 * MIN);
    expect(kpis.loadingMs).toBe(77 * MIN);
    expect(kpis.waitDropMs).toBe(22 * MIN);
    expect(kpis.unloadingMs).toBe(30 * MIN);
    expect(kpis.waitTotalMs).toBe(49 * MIN);
    expect(kpis.depotageMs).toBe(DAY + 19 * HOUR + 10 * MIN);

    /* Empty Returned − Mission Assigned. The mission ends when the box is back
       at the depot (2026-08-26), not at the separate `mission_closed` stamp
       25 minutes later — a booking is finished when its container is home. */
    expect(formatDuration(kpis.totalMs)).toBe('3d 3h 10m');
    // Active operations vs waiting, over assignment → delivery.
    expect(kpis.activePct).toBe(89);
  });
});

/* ── §6 Empty return deadline ──────────────────────────────────────────── */

describe('empty return against its deadline (§6)', () => {
  it('ON TIME — returned before the deadline, no detention', () => {
    const report = computeMissionReport({ booking: booking(), cycle: cycle(), now: NOW });
    const ret = report.containerReturn;

    expect(ret.status).toBe('ontime');
    expect(formatDuration(Math.abs(ret.deltaMs ?? 0))).toBe('1d 6h 15m');
    expect(ret.detention).toBe(false);
    expect(ret.detentionDays).toBe(0);
    expect(ret.detentionFees).toBe(0);
    expect(report.attribution).toBeNull();
  });

  it('DELAYED — 1d 16h 30m past the deadline is two detention days', () => {
    const report = computeMissionReport({
      booking: booking(),
      cycle: cycle({ returnedAt: at(18, '10:30') }),
      now: NOW,
    });
    const ret = report.containerReturn;

    expect(ret.status).toBe('delayed');
    expect(formatDuration(ret.deltaMs)).toBe('1d 16h 30m');
    expect(ret.detention).toBe(true);
    expect(ret.detentionDays).toBe(2);
    expect(ret.detentionFees).toBe(2 * detentionRatePerContainerDay());
    expect(report.status).toBe('delayed');
  });

  it('reads the deadline against the clock while the box is still out', () => {
    const report = computeMissionReport({
      booking: booking({ status: 'Completed' }),
      cycle: cycle({ returnedAt: null, status: 'pending' }),
      now: NOW,
    });

    expect(report.containerReturn.status).toBe('delayed');
    // 16 Aug 18:00 → 20 Aug 12:00 is 3d 18h, which rounds up to four days.
    expect(report.containerReturn.detentionDays).toBe(4);
  });

  it('has nothing to be late against when the mission carries no container', () => {
    const report = computeMissionReport({
      booking: booking({
        containerNumber: null,
        shipmentCategory: 'bulk',
        containerReturnDeadline: null,
      }),
      cycle: undefined,
      now: NOW,
    });

    expect(report.containerReturn.hasContainer).toBe(false);
    expect(report.containerReturn.status).toBe('not_applicable');
    expect(report.timeline.some((row) => row.key === 'empty_ready')).toBe(false);
  });
});

/* ── §7/§8 Responsibility ──────────────────────────────────────────────── */

describe('delay responsibility (§7, §8)', () => {
  it('charges a late return to the client when the empty was not ready in time', () => {
    const report = computeMissionReport({
      booking: booking(),
      cycle: cycle({ emptyReadyAt: at(17, '09:00'), returnedAt: at(18, '10:30') }),
      now: NOW,
    });

    expect(report.attribution).toEqual({
      party: 'client_shipper',
      reason: 'late_depotage',
      comment: expect.stringContaining('after the return deadline'),
      source: 'derived',
    });
  });

  it('charges it to the transporter when the empty was ready inside free time', () => {
    const report = computeMissionReport({
      booking: booking(),
      cycle: cycle({ returnedAt: at(18, '10:30') }),
      now: NOW,
    });

    expect(report.attribution?.party).toBe('transporter');
    expect(report.attribution?.reason).toBe('operational_issue');
  });
});

/* ── §9 Mission performance status ─────────────────────────────────────── */

describe('mission performance status (§9)', () => {
  it('ON TIME when nothing was flagged', () => {
    const report = computeMissionReport({ booking: booking(), cycle: cycle(), now: NOW });
    expect(report.exceptions).toEqual([]);
    expect(report.status).toBe('ontime');
  });

  it('ATTENTION when an indicator wants a look but no deadline was missed', () => {
    // The same run, but the truck waits seven hours at the pickup gate.
    const slow: ShipmentTimelineStepRecord[] = [
      step('creation', at(12, '08:00')),
      step('vehicle_assignment', at(12, '08:35')),
      step('left_for_pickup', at(12, '09:02')),
      step('gate_in', at(12, '09:48')),
      step('loading_start', at(12, '17:00')),
      step('pickup', at(12, '18:17')),
      step('departure', at(12, '18:30')),
      step('arrival', at(12, '22:05')),
      step('unloading_start', at(12, '22:27')),
      step('pod_upload', at(12, '22:57')),
    ];
    const report = computeMissionReport({
      booking: booking({ timeline: slow }),
      cycle: cycle(),
      now: NOW,
    });

    expect(report.kpis.waitPickupMs).toBe(7 * HOUR + 12 * MIN);
    expect(report.containerReturn.status).toBe('ontime');
    expect(report.exceptions.map((exception) => exception.code)).toContain('excessive_waiting');
    expect(report.status).toBe('attention');
  });

  it('DELAYED once detention is triggered', () => {
    const report = computeMissionReport({
      booking: booking(),
      cycle: cycle({ returnedAt: at(18, '10:30') }),
      now: NOW,
    });

    expect(report.status).toBe('delayed');
    expect(report.exceptions.map((exception) => exception.code)).toEqual(
      expect.arrayContaining(['return_deadline_exceeded', 'detention_triggered']),
    );
  });
});

/* ── §10–§13 Monthly report ────────────────────────────────────────────── */

describe('monthly performance report (§10–§13)', () => {
  const monthStart = new Date(2026, 7, 1);
  const monthEnd = new Date(2026, 8, 1);

  const onTime = computeMissionReport({
    booking: booking({ completedAt: at(15, '12:10') }),
    cycle: cycle(),
    now: NOW,
  });
  const late = computeMissionReport({
    booking: booking({ id: 'BKG-2', reference: 'BKG-00002', completedAt: at(18, '12:00') }),
    cycle: cycle({ emptyReadyAt: at(17, '09:00'), returnedAt: at(18, '10:30') }),
    now: NOW,
  });
  const running = computeMissionReport({
    booking: booking({
      id: 'BKG-3',
      reference: 'BKG-00003',
      status: 'En Route',
      timeline: SPEC_TIMELINE.slice(0, 7),
    }),
    cycle: undefined,
    now: NOW,
  });

  const report = computeMonthlyReport([onTime, late, running], monthStart, monthEnd);

  it('counts missions, completion and punctuality the way §14 defines them', () => {
    expect(report.missions.total).toBe(3);
    expect(report.missions.completed).toBe(2);
    expect(report.missions.inProgress).toBe(1);
    expect(report.missions.completionPct).toBe(67);
    expect(report.missions.onTime).toBe(1);
    expect(report.missions.onTimePct).toBe(50);
  });

  it('reports the container cycle, not only the delivery', () => {
    expect(report.containers.total).toBe(3);
    // The third mission is still on the road: delivered counts events, not rows.
    expect(report.containers.delivered).toBe(2);
    expect(report.containers.returned).toBe(2);
    expect(report.containers.lateReturns).toBe(1);
    expect(report.containers.onTimeReturnPct).toBe(50);
    expect(report.containers.avgDepotageMs).not.toBeNull();
  });

  it('aggregates detention and attributes every day of it', () => {
    /*
     * Two cases, not one: the mission returned 1d 16h late owes two days, and
     * the mission still running is four days past its own deadline with the box
     * not back. Detention accrues while a container is out, which is the whole
     * reason the report follows the cycle past delivery.
     */
    expect(report.detention.cases).toBe(2);
    expect(report.detention.days).toBe(6);
    expect(report.detention.fees).toBe(6 * detentionRatePerContainerDay());
    expect(report.detention.avgDaysPerCase).toBe(3);
    expect(report.detention.responsibility).toHaveLength(1);
    expect(report.detention.responsibility[0]).toMatchObject({
      party: 'client_shipper',
      label: 'Client / Shipper',
      pct: 100,
      incidents: 2,
      days: 6,
    });
  });

  it('shows where the month’s time went, longest stage marked', () => {
    const byKey = new Map(report.stages.map((stage) => [stage.key, stage]));
    expect(byKey.get('wait_pickup')?.avgMs).toBe(27 * MIN);
    expect(byKey.get('transit')?.avgMs).toBe(3 * HOUR + 35 * MIN);
    expect(byKey.get('depotage')?.isLongest).toBe(true);
  });

  it('reports a month with no work as zeros rather than as invented history', () => {
    const empty = computeMonthlyReport([], monthStart, monthEnd);
    expect(empty.missions.total).toBe(0);
    expect(empty.missions.completionPct).toBe(0);
    expect(empty.containers.onTimeReturnPct).toBe(0);
    expect(empty.detention.fees).toBe(0);
    expect(empty.stages).toEqual([]);
    expect(empty.exceptions).toEqual([]);
  });
});
