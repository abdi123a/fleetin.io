import { describe, expect, it } from 'vitest';
import {
  classifyDelivery,
  computeRiskScore,
  deriveDelay,
  deriveFacts,
  deriveStageDurations,
  splitFreeTimeOverrun,
} from './derive';
import { deltaPct, quantile, withCumulativeShare } from './stats';
import {
  overlapDays,
  periodLengthDays,
  previousPeriod,
  resolvePreset,
  toDayString,
} from './time';
import { EARLY_THRESHOLD_MINUTES, ON_TIME_GRACE_MINUTES } from './config';
import { generateDataset } from '@/features/shipper-bi/mocks/generateDataset';
import { biDatasetSchema } from '@/features/shipper-bi/contracts';
import type { Container, DelayAttribution, ShipmentEvent } from '@/features/shipper-bi/contracts';

/**
 * The derivation layer is the part of this feature the backend will inherit, so
 * it is the part worth pinning. These tests are about *definitions* — what "on
 * time" means, where demurrage stops and detention starts — not about coverage.
 */

const PLANNED = '2026-03-10T12:00:00.000Z';

describe('classifyDelivery', () => {
  it('treats delivery exactly at the planned instant as on time', () => {
    // The boundary case that decides whether a punctual carrier's scorecard is
    // 100% or 0%. Grace is inclusive.
    expect(classifyDelivery(PLANNED, PLANNED)).toEqual({
      outcome: 'on_time',
      varianceMinutes: 0,
    });
  });

  it('is late one minute past the grace window and not before', () => {
    const atGrace = new Date(
      Date.parse(PLANNED) + ON_TIME_GRACE_MINUTES * 60_000,
    ).toISOString();
    const pastGrace = new Date(
      Date.parse(PLANNED) + (ON_TIME_GRACE_MINUTES + 1) * 60_000,
    ).toISOString();

    expect(classifyDelivery(PLANNED, atGrace).outcome).toBe('on_time');
    expect(classifyDelivery(PLANNED, pastGrace).outcome).toBe('late');
  });

  it('separates arriving early from arriving on time', () => {
    // Early is not a synonym for good: a truck that far ahead is waiting at a
    // gate, which is what the waiting charges in the cost section are.
    const slightlyEarly = new Date(Date.parse(PLANNED) - 30 * 60_000).toISOString();
    const veryEarly = new Date(
      Date.parse(PLANNED) - (EARLY_THRESHOLD_MINUTES + 1) * 60_000,
    ).toISOString();

    expect(classifyDelivery(PLANNED, slightlyEarly).outcome).toBe('on_time');
    expect(classifyDelivery(PLANNED, veryEarly).outcome).toBe('early');
    expect(classifyDelivery(PLANNED, veryEarly).varianceMinutes).toBeLessThan(0);
  });
});

describe('splitFreeTimeOverrun', () => {
  const base: Container = {
    id: 'CNT-1',
    containerNo: 'MSKU1234567',
    type: '40HC',
    shippingLine: 'Maersk',
    shipmentId: 'SHP-1',
    status: 'returned',
    freeTimeExpiresAt: '2026-03-10T00:00:00.000Z',
  };

  it('bills time inside the terminal as demurrage and time outside as detention', () => {
    // Two days late gating out, then three more days before the box comes back.
    const result = splitFreeTimeOverrun(
      {
        ...base,
        gateOutAt: '2026-03-12T00:00:00.000Z',
        returnedAt: '2026-03-15T00:00:00.000Z',
      },
      '2026-03-20T00:00:00.000Z',
    );

    expect(result.demurrageDays).toBeCloseTo(2, 5);
    expect(result.detentionDays).toBeCloseTo(3, 5);
    expect(result.overdueDays).toBeCloseTo(5, 5);
  });

  it('charges no detention while the container is still inside the terminal', () => {
    // Never gated out: the overrun is entirely the shipping line's demurrage.
    const result = splitFreeTimeOverrun(
      { ...base, gateOutAt: undefined, returnedAt: undefined },
      '2026-03-14T00:00:00.000Z',
    );

    expect(result.demurrageDays).toBeCloseTo(4, 5);
    expect(result.detentionDays).toBe(0);
  });

  it('charges nothing when the container is back inside free time', () => {
    const result = splitFreeTimeOverrun(
      {
        ...base,
        gateOutAt: '2026-03-06T00:00:00.000Z',
        returnedAt: '2026-03-08T00:00:00.000Z',
      },
      '2026-03-20T00:00:00.000Z',
    );

    expect(result.demurrageDays).toBe(0);
    expect(result.detentionDays).toBe(0);
    expect(result.overdueDays).toBe(0);
  });

  it('keeps accruing against an open container', () => {
    // A box that has not come back is still costing money; the number has to
    // move as of now, not sit frozen at the last event.
    const result = splitFreeTimeOverrun(
      { ...base, gateOutAt: '2026-03-09T00:00:00.000Z', returnedAt: undefined },
      '2026-03-16T00:00:00.000Z',
    );

    expect(result.detentionDays).toBeCloseTo(6, 5);
  });
});

describe('deriveDelay', () => {
  const attribution = (
    owner: DelayAttribution['owner'],
    stage: DelayAttribution['stage'],
    minutes: number,
  ): DelayAttribution => ({
    id: `${owner}-${stage}`,
    shipmentId: 'SHP-1',
    stage,
    delayMinutes: minutes,
    owner,
    reasonCode: 'TEST',
    attributedAt: PLANNED,
  });

  it('sums every attribution into the total, by owner, party and stage', () => {
    const result = deriveDelay([
      attribution('shipper_documentation', 'documentation', 120),
      attribution('transporter', 'in_transit', 300),
      attribution('customs', 'gate_in', 60),
    ]);

    // The invariant that makes a delay report defensible: the parts add up.
    expect(result.totalDelayMinutes).toBe(480);
    expect(
      Object.values(result.delayByOwner).reduce((total, value) => total + value, 0),
    ).toBe(result.totalDelayMinutes);
    expect(
      Object.values(result.delayByParty).reduce((total, value) => total + value, 0),
    ).toBe(result.totalDelayMinutes);

    expect(result.delayByParty.shipper).toBe(120);
    expect(result.delayByParty.transporter).toBe(300);
    expect(result.delayByParty.fleetin).toBe(60);
    expect(result.primaryDelayOwner).toBe('transporter');
  });

  it('reports no primary owner when nothing was attributed', () => {
    const result = deriveDelay([]);
    expect(result.totalDelayMinutes).toBe(0);
    expect(result.primaryDelayOwner).toBeUndefined();
  });
});

describe('deriveStageDurations', () => {
  const event = (seq: number, stage: ShipmentEvent['stage'], at: string): ShipmentEvent => ({
    id: `E${seq}`,
    shipmentId: 'SHP-1',
    seq,
    stage,
    occurredAt: at,
    recordedAt: at,
    actorType: 'ops',
  });

  it('measures dwell between consecutive events and leaves the open stage out', () => {
    const result = deriveStageDurations([
      event(0, 'created', '2026-03-01T00:00:00.000Z'),
      event(1, 'documentation', '2026-03-01T06:00:00.000Z'),
      event(2, 'dispatched', '2026-03-02T06:00:00.000Z'),
    ]);

    expect(result.stageDurationHours.created).toBeCloseTo(6, 5);
    expect(result.stageDurationHours.documentation).toBeCloseTo(24, 5);
    // Still sitting in `dispatched`, so it has no completed duration yet.
    expect(result.stageDurationHours.dispatched).toBeUndefined();
    expect(result.stagesReached).toEqual(['created', 'documentation', 'dispatched']);
  });

  it('orders by sequence, so a backdated report cannot produce negative dwell', () => {
    const result = deriveStageDurations([
      event(1, 'documentation', '2026-03-01T06:00:00.000Z'),
      event(0, 'created', '2026-03-01T00:00:00.000Z'),
      event(2, 'dispatched', '2026-03-02T06:00:00.000Z'),
    ]);

    expect(result.stageDurationHours.created).toBeCloseTo(6, 5);
    for (const hours of Object.values(result.stageDurationHours)) {
      expect(hours).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeRiskScore', () => {
  it('is zero for a shipment on plan with headroom to spare', () => {
    expect(
      computeRiskScore({
        etaDriftMinutes: 0,
        stageDwellHours: 0,
        stageP90Hours: 10,
        freeTimeHoursRemaining: 96,
      }),
    ).toBe(0);
  });

  it('flags a punctual shipment whose free time expires tonight', () => {
    // The case a lateness-only ranking misses entirely.
    const score = computeRiskScore({
      etaDriftMinutes: 0,
      stageDwellHours: 1,
      stageP90Hours: 10,
      freeTimeHoursRemaining: -2,
    });
    expect(score).toBeGreaterThan(15);
  });

  it('stays within 0–100 however extreme the inputs', () => {
    const score = computeRiskScore({
      etaDriftMinutes: 100_000,
      stageDwellHours: 5_000,
      stageP90Hours: 1,
      freeTimeHoursRemaining: -500,
    });
    expect(score).toBe(100);
  });
});

describe('period maths', () => {
  it('derives a comparison window of equal length immediately before', () => {
    // March is 31 days, so the comparison runs the 31 days ending the day
    // before it — through a short February, which is why the start is in January.
    const period = { from: '2026-03-01', to: '2026-03-31' };
    expect(previousPeriod(period)).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    expect(periodLengthDays(previousPeriod(period))).toBe(periodLengthDays(period));
  });

  it('measures a period in UTC, not in the viewer timezone', () => {
    // A dashboard that reports different totals in Djibouti than in London is
    // broken; day boundaries are anchored to UTC on both sides of every compare.
    expect(toDayString('2026-03-31T22:30:00.000Z')).toBe('2026-03-31');
    expect(toDayString('2026-04-01T01:30:00.000Z')).toBe('2026-04-01');
  });

  it('resolves presets against an injected clock, not the wall clock', () => {
    const now = new Date('2026-03-15T09:00:00.000Z');
    expect(resolvePreset('last_7_days', now)).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(resolvePreset('this_month', now)).toEqual({ from: '2026-03-01', to: '2026-03-15' });
    expect(resolvePreset('last_month', now)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('splits a charge that straddles a month boundary across both periods', () => {
    // A detention charge running 27 Feb to 4 Mar belongs partly to each month.
    // Attributing all of it to either end invents a spike that never happened.
    const february = { from: '2026-02-01', to: '2026-02-28' };
    const march = { from: '2026-03-01', to: '2026-03-31' };
    const from = '2026-02-27T00:00:00.000Z';
    const to = '2026-03-04T00:00:00.000Z';

    const inFebruary = overlapDays(february, from, to);
    const inMarch = overlapDays(march, from, to);

    expect(inFebruary).toBeCloseTo(2, 5);
    expect(inMarch).toBeCloseTo(3, 5);
    expect(inFebruary + inMarch).toBeCloseTo(5, 5);
  });
});

describe('statistics', () => {
  it('returns no delta rather than infinity when the prior period was empty', () => {
    // Going from zero delayed shipments to one is news, but it is not an
    // infinite increase, and a card must not render "+∞%".
    expect(deltaPct(5, 0)).toBeUndefined();
    expect(deltaPct(5, undefined)).toBeUndefined();
    expect(deltaPct(0, 0)).toBeUndefined();
    expect(deltaPct(12, 10)).toBeCloseTo(0.2, 5);
    expect(deltaPct(8, 10)).toBeCloseTo(-0.2, 5);
  });

  it('interpolates quantiles so small samples do not jump', () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 5);
  });

  it('ranks Pareto items and closes the cumulative line at one', () => {
    const result = withCumulativeShare([
      { key: 'a', value: 10 },
      { key: 'b', value: 50 },
      { key: 'c', value: 40 },
    ]);

    expect(result.map((item) => item.key)).toEqual(['b', 'c', 'a']);
    expect(result.at(0)?.cumulativeShare).toBeCloseTo(0.5, 5);
    expect(result.at(-1)?.cumulativeShare).toBeCloseTo(1, 5);
  });

  it('does not divide by zero on an all-zero Pareto', () => {
    const result = withCumulativeShare([{ key: 'a', value: 0 }]);
    expect(result.at(0)?.cumulativeShare).toBe(0);
  });
});

describe('deriveFacts over the generated dataset', () => {
  const asOf = new Date('2026-08-01T00:00:00.000Z');
  const dataset = generateDataset({ shipperId: 'SHP-102', asOf, shipmentCount: 120 });

  it('generates data that satisfies the published contract', () => {
    // The mock earns its keep only if it is contract-valid: the whole point is
    // that swapping in the real API changes nothing downstream.
    expect(() => biDatasetSchema.parse(dataset)).not.toThrow();
  });

  it('is deterministic for a given shipper', () => {
    const again = generateDataset({ shipperId: 'SHP-102', asOf, shipmentCount: 120 });
    expect(again.shipments.map((s) => s.id)).toEqual(dataset.shipments.map((s) => s.id));
    expect(again.charges.length).toBe(dataset.charges.length);
  });

  const facts = deriveFacts(dataset);

  it('derives one fact per shipment', () => {
    expect(facts).toHaveLength(dataset.shipments.length);
  });

  it('keeps every delay breakdown consistent with its total', () => {
    for (const fact of facts) {
      const byOwner = Object.values(fact.delayByOwner).reduce((a, b) => a + b, 0);
      const byParty = Object.values(fact.delayByParty).reduce((a, b) => a + b, 0);
      expect(byOwner).toBeCloseTo(fact.totalDelayMinutes, 5);
      expect(byParty).toBeCloseTo(fact.totalDelayMinutes, 5);
    }
  });

  it('keeps every cost breakdown consistent with its total', () => {
    for (const fact of facts) {
      const byType = Object.values(fact.costByType).reduce((a, b) => a + b, 0);
      expect(byType).toBeCloseTo(fact.costTotal, 5);
      expect(fact.accessorialCost).toBeCloseTo(
        fact.costTotal - fact.costByType.base_freight,
        5,
      );
    }
  });

  it('scores risk only on open shipments', () => {
    for (const fact of facts) {
      if (!fact.isOpen) expect(fact.riskScore).toBe(0);
      expect(fact.riskScore).toBeGreaterThanOrEqual(0);
      expect(fact.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('treats a shipment as open until the container is back, not once delivered', () => {
    // Delivery is not the end of the job — the empty return is. A shipment that
    // is delivered but still holding a box has to stay on the open list.
    const deliveredButNotReturned = facts.filter(
      (fact) => fact.isDelivered && fact.currentStage !== 'empty_returned',
    );
    expect(deliveredButNotReturned.length).toBeGreaterThan(0);
    for (const fact of deliveredButNotReturned) expect(fact.isOpen).toBe(true);
  });

  it('produces a realistic spread of delivery outcomes', () => {
    const outcomes = new Set(
      facts.map((fact) => fact.deliveryOutcome).filter(Boolean),
    );
    expect(outcomes.has('on_time')).toBe(true);
    expect(outcomes.has('late')).toBe(true);
  });

  it('never reports a negative cycle time', () => {
    for (const fact of facts) {
      if (fact.emptyReturnCycleDays !== undefined) {
        expect(fact.emptyReturnCycleDays).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
