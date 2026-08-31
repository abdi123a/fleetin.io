import { WorkspaceRecurrenceFrequency as F } from '@prisma/client';
import { nextOccurrence, resolveDueOccurrence, toDay } from './recurrence.util';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('nextOccurrence', () => {
  it('steps a daily rule by its interval', () => {
    expect(iso(nextOccurrence({ frequency: F.DAILY, interval: 1 }, day('2026-09-01')))).toBe('2026-09-02');
    expect(iso(nextOccurrence({ frequency: F.DAILY, interval: 3 }, day('2026-09-01')))).toBe('2026-09-04');
  });

  it('lands a weekly rule on its named weekday', () => {
    /* 2026-09-01 is a Tuesday; weekday 1 is Monday. */
    expect(iso(nextOccurrence({ frequency: F.WEEKLY, interval: 1, weekday: 1 }, day('2026-09-01'))))
      .toBe('2026-09-07');
  });

  it('treats "every 2 weeks" as a fortnight, not "the next Monday 14 days out"', () => {
    expect(iso(nextOccurrence({ frequency: F.WEEKLY, interval: 2, weekday: 1 }, day('2026-09-07'))))
      .toBe('2026-09-21');
  });

  it('keeps the existing weekday when a weekly rule names none', () => {
    expect(iso(nextOccurrence({ frequency: F.WEEKLY, interval: 1 }, day('2026-09-02'))))
      .toBe('2026-09-09');
  });

  it('steps a monthly rule by its interval', () => {
    expect(iso(nextOccurrence({ frequency: F.MONTHLY, interval: 1, dayOfMonth: 15 }, day('2026-09-15'))))
      .toBe('2026-10-15');
  });

  it('CLAMPS a 31st rule into a short month instead of skipping it', () => {
    /* The bug this guards: skipping would silently drop February and April. */
    expect(iso(nextOccurrence({ frequency: F.MONTHLY, interval: 1, dayOfMonth: 31 }, day('2026-01-31'))))
      .toBe('2026-02-28');
    expect(iso(nextOccurrence({ frequency: F.MONTHLY, interval: 1, dayOfMonth: 31 }, day('2026-03-31'))))
      .toBe('2026-04-30');
  });

  it('rolls a monthly rule across a year boundary', () => {
    expect(iso(nextOccurrence({ frequency: F.MONTHLY, interval: 2, dayOfMonth: 1 }, day('2026-11-01'))))
      .toBe('2027-01-01');
  });

  it('never returns the day it was given', () => {
    const from = day('2026-09-01');
    for (const rule of [
      { frequency: F.DAILY, interval: 1 },
      { frequency: F.WEEKLY, interval: 1, weekday: from.getUTCDay() },
      { frequency: F.MONTHLY, interval: 1, dayOfMonth: 1 },
    ]) {
      expect(nextOccurrence(rule, from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});

describe('resolveDueOccurrence', () => {
  const weekly = { frequency: F.WEEKLY, interval: 1, weekday: 1 };

  it('returns nothing when the rule is not due yet', () => {
    expect(resolveDueOccurrence(weekly, day('2026-09-14'), day('2026-09-07'))).toBeNull();
  });

  it('generates the occurrence due today', () => {
    const result = resolveDueOccurrence(weekly, day('2026-09-07'), day('2026-09-07'));
    expect(iso(result!.occurrenceOn)).toBe('2026-09-07');
    expect(iso(result!.nextRunOn)).toBe('2026-09-14');
  });

  it('catches up a stale rule with ONE task, not one per missed week', () => {
    /* Idle for a month. The person needs "this is outstanding", not four
       identical tasks burying each other. */
    const result = resolveDueOccurrence(weekly, day('2026-09-07'), day('2026-10-05'));
    expect(iso(result!.occurrenceOn)).toBe('2026-10-05');
    expect(iso(result!.nextRunOn)).toBe('2026-10-12');
  });

  it('normalises any time of day to the calendar day', () => {
    expect(iso(toDay(new Date('2026-09-07T23:59:59.999Z')))).toBe('2026-09-07');
  });
});
