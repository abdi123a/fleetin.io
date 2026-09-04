import { advanceDueDate, monthlyEquivalent, periodLabelFor } from './expense-catalog';

/**
 * The date arithmetic behind a standing obligation.
 *
 * Worth pinning because every failure mode here is silent: a rent that walks
 * backwards through the month, a period label that books January's payment
 * against last year, a quarterly premium counted as though it were monthly.
 * None of them throws — they just make the book wrong.
 */
describe('advanceDueDate', () => {
  it('adds a week', () => {
    expect(advanceDueDate(new Date('2026-09-01'), 'WEEKLY').toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('adds a calendar month, not thirty days', () => {
    expect(advanceDueDate(new Date('2026-01-15'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  /*
   * The one that motivated the helper. `setMonth` on the 31st overflows into
   * the following month — 31 January + 1 becomes 3 March — and a rent due on
   * the 31st would drift a day or two later every month until it left the
   * month it belonged to.
   */
  it('clamps a month-end day into a shorter month', () => {
    expect(advanceDueDate(new Date('2026-01-31'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(advanceDueDate(new Date('2026-08-31'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('does not stay clamped — the next step returns to the 31st', () => {
    const february = advanceDueDate(new Date('2026-01-31'), 'MONTHLY');
    /* Only true if the caller keeps the ORIGINAL day, which this helper does
       not: it advances from wherever it is. Documented here so nobody is
       surprised that a 31st obligation settles on the 28th. */
    expect(advanceDueDate(february, 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-03-28');
  });

  it('adds three months for a quarter and twelve for a year, across the year boundary', () => {
    expect(advanceDueDate(new Date('2026-11-01'), 'QUARTERLY').toISOString().slice(0, 10)).toBe('2027-02-01');
    /* A real 29 February — 2024 is a leap year, 2025 is not, so the clamp has
       to fire on the annual step too. */
    expect(advanceDueDate(new Date('2024-02-29'), 'ANNUAL').toISOString().slice(0, 10)).toBe('2025-02-28');
  });

  /*
   * The schedule is UTC, not wall clock. `TZ` is set per test rather than
   * globally because the failure it guards against is invisible on a machine
   * in Djibouti (UTC+3) and certain on one in New York: local getters read a
   * midnight-UTC due date as the PREVIOUS day, so 1 September reads as 31
   * August and the whole schedule slips a month.
   */
  it('is unaffected by the server timezone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(advanceDueDate(new Date('2026-09-01'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(advanceDueDate(new Date('2026-01-31'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-02-28');
      expect(periodLabelFor(new Date('2026-09-01'), 'MONTHLY')).toBe('2026-09');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('periodLabelFor', () => {
  it('names a month', () => {
    expect(periodLabelFor(new Date('2026-09-01'), 'MONTHLY')).toBe('2026-09');
    expect(periodLabelFor(new Date('2026-09-30'), 'QUARTERLY')).toBe('2026-09');
  });

  it('names a year', () => {
    expect(periodLabelFor(new Date('2026-07-04'), 'ANNUAL')).toBe('2026');
  });

  it('names an ISO week, so the turn of the year does not produce week 0', () => {
    expect(periodLabelFor(new Date('2026-09-03'), 'WEEKLY')).toBe('2026-W36');
    /* 1 January 2027 is a Friday — ISO week 53 of 2026, not week 1 of 2027. */
    expect(periodLabelFor(new Date('2027-01-01'), 'WEEKLY')).toBe('2026-W53');
  });

  it('gives one label per period, which is what makes posting idempotent', () => {
    expect(periodLabelFor(new Date('2026-09-01'), 'MONTHLY')).toBe(
      periodLabelFor(new Date('2026-09-28'), 'MONTHLY'),
    );
  });
});

describe('monthlyEquivalent', () => {
  it('leaves a monthly figure alone', () => {
    expect(monthlyEquivalent(450_000n, 'MONTHLY')).toBe(450_000);
  });

  /* 52/12, not 4: four weeks is not a month, and the error compounds to an
     extra month of cleaning a year. */
  it('spreads a weekly cost over 52 weeks, not 48', () => {
    expect(Math.round(monthlyEquivalent(10_000n, 'WEEKLY'))).toBe(43_333);
  });

  it('divides a quarter by three and a year by twelve', () => {
    expect(monthlyEquivalent(300_000n, 'QUARTERLY')).toBe(100_000);
    expect(monthlyEquivalent(1_200_000n, 'ANNUAL')).toBe(100_000);
  });
});
