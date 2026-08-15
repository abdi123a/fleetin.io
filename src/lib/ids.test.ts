import { beforeEach, describe, expect, it } from 'vitest';

import {
  ID_DIGITS,
  ID_MAX,
  derivedId,
  formatId,
  hashedId,
  idKindOf,
  nextId,
  parseId,
  registerIds,
  resetIdSequences,
} from './ids';

/**
 * Split out of the old `finance.test.ts` when Finance moved off local mock
 * ids onto real backend references — this coverage is for `@/lib/ids`
 * itself, unrelated to Finance and still load-bearing app-wide.
 */

beforeEach(() => {
  resetIdSequences();
});

describe('the id scheme', () => {
  it('is always three letters and five digits', () => {
    expect(formatId('shipment', 412)).toBe('SHI-00412');
    expect(formatId('booking', 1)).toBe('BKG-00001');
    expect(formatId('invoice', 99_999)).toBe('INV-99999');
    expect(formatId('payment', 7)).toBe('PAY-00007');
    expect(formatId('project', 3)).toBe('PRJ-00003');
  });

  it('throws past the ceiling rather than wrapping onto a live record', () => {
    expect(() => formatId('payment', ID_MAX + 1)).toThrow();
    expect(() => formatId('payment', 0)).toThrow();
    expect(ID_DIGITS).toBe(5);
  });

  it('never hands out a reference already in the data', () => {
    registerIds(['INV-00004', 'INV-00009', 'INV-00002']);
    expect(nextId('invoice')).toBe('INV-00010');
    expect(nextId('invoice')).toBe('INV-00011');
    // Counters are per kind — a busy invoice sequence does not skip payments.
    expect(nextId('payment')).toBe('PAY-00001');
  });

  it('names the kind behind a reference, including ones it does not mint', () => {
    expect(idKindOf('SHI-00412')).toBe('Shipment');
    expect(idKindOf('BKG-00412')).toBe('Booking');
    expect(idKindOf('PAY-00001')).toBe('Payment');
    // SHP is a shipper and SHI is a shipment — the near-collision must resolve.
    expect(idKindOf('SHP-101')).toBe('Shipper');
    expect(idKindOf('PTR-001')).toBe('Transporter');
    expect(idKindOf('MSCU-889')).toBeNull();
  });

  it('parses only the scheme, and treats third-party numbers as foreign', () => {
    expect(parseId('SHI-00412')).toEqual({ prefix: 'SHI', kind: 'shipment', sequence: 412 });
    // Not ours to renumber: container numbers, licences, contract references.
    expect(parseId('MSCU-889-2314')).toBeNull();
    expect(parseId('DL-DJ-44821')).toBeNull();
    expect(parseId('CT-2026-AMN-04')).toBeNull();
  });

  it('migrates a legacy reference to the same new one every time', () => {
    expect(derivedId('mission', 'MSN-2026-8801')).toBe('MSN-08801');
    expect(derivedId('mission', 'MSN-2026-8801')).toBe('MSN-08801');
    expect(derivedId('vehicle', 'VEH-101')).toBe('VEH-00101');
    expect(derivedId('driver', 'DRV-08807')).toBe('DRV-08807');
  });

  it('hashes text-only references above the hand-numbered band', () => {
    const first = hashedId('location', 'Obock Transit Yard');
    expect(first).toBe(hashedId('location', 'Obock Transit Yard'));
    expect(first).not.toBe(hashedId('location', 'Tadjoura Yard'));
    // Never collides with a seeded LOC-00001..LOC-00005.
    expect(parseId(first)?.sequence).toBeGreaterThanOrEqual(10_000);
  });
});
