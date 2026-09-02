import { describe, expect, it } from 'vitest';

import { EXPIRY_CRITICAL_DAYS, EXPIRY_SAFE_DAYS, daysOfCover, expiryBandOf } from './ExpiryLabel';

/* Mid-afternoon, so every case also proves the grading floors both sides to
   midnight rather than comparing wall clocks — a certificate expiring today
   must not read as expired because it is already 16:30. */
const TODAY = new Date(2026, 8, 1, 16, 30);

const inDays = (n: number) => {
  const d = new Date(2026, 8, 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('daysOfCover', () => {
  it('counts whole days from midnight, not from the clock', () => {
    expect(daysOfCover(inDays(0), TODAY)).toBe(0);
    expect(daysOfCover(inDays(1), TODAY)).toBe(1);
    expect(daysOfCover(inDays(-1), TODAY)).toBe(-1);
  });

  it('reads a full ISO datetime the same as a bare date', () => {
    expect(daysOfCover('2026-09-30T00:00:00.000Z', TODAY)).toBe(29);
    expect(daysOfCover('2026-09-30', TODAY)).toBe(29);
  });
});

describe('the four bands', () => {
  it('red once the cover has run out', () => {
    expect(expiryBandOf(inDays(-1), TODAY)).toBe('expired');
    expect(expiryBandOf(inDays(-400), TODAY)).toBe('expired');
  });

  /* The day itself is not yet expired — the truck can still legally load, and
     it is the loudest thing on the page that is not a breach. */
  it('treats the expiry day itself as urgent, not gone', () => {
    expect(expiryBandOf(inDays(0), TODAY)).toBe('critical');
  });

  it('urgent inside a fortnight', () => {
    expect(expiryBandOf(inDays(1), TODAY)).toBe('critical');
    expect(expiryBandOf(inDays(EXPIRY_CRITICAL_DAYS - 1), TODAY)).toBe('critical');
  });

  it('the run-up from a fortnight to two months', () => {
    expect(expiryBandOf(inDays(EXPIRY_CRITICAL_DAYS), TODAY)).toBe('soon');
    expect(expiryBandOf(inDays(EXPIRY_SAFE_DAYS), TODAY)).toBe('soon');
  });

  it('green past two months', () => {
    expect(expiryBandOf(inDays(EXPIRY_SAFE_DAYS + 1), TODAY)).toBe('valid');
    expect(expiryBandOf(inDays(365), TODAY)).toBe('valid');
  });

  /* Every boundary belongs to exactly one band — no date can be graded twice
     and none can fall through the gaps. */
  it('leaves no gap and no overlap across the whole range', () => {
    const seen = new Set<string>();
    for (let day = -30; day <= 120; day += 1) {
      const band = expiryBandOf(inDays(day), TODAY);
      expect(band).not.toBe('unknown');
      seen.add(band);
    }
    expect([...seen].sort()).toEqual(['critical', 'expired', 'soon', 'valid']);
  });

  it('says nothing when there is no date to grade', () => {
    expect(expiryBandOf(undefined, TODAY)).toBe('unknown');
    expect(expiryBandOf('', TODAY)).toBe('unknown');
    expect(expiryBandOf('not a date', TODAY)).toBe('unknown');
  });
});
