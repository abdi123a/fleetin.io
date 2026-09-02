import { beforeEach, describe, expect, it } from 'vitest';

import { isShipmentNew, markShipmentSeen, readSeenShipments } from './seenShipments';

const KEY = 'fleetin.shipments.seen';

/* The suite runs on `environment: 'node'`, where `localStorage` is behind a
   flag. A map is the whole contract this module uses, so it is stubbed rather
   than pulling jsdom in for one Storage object. */
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
});

beforeEach(() => {
  store.clear();
});

const isNew = (id: string) => isShipmentNew(id, readSeenShipments());

describe('the NEW mark', () => {
  it('flags a shipment nobody has opened', () => {
    expect(isNew('605747')).toBe(true);
  });

  it('clears the moment it is opened', () => {
    markShipmentSeen('605747');
    expect(isNew('605747')).toBe(false);
  });

  it('leaves every other shipment alone', () => {
    markShipmentSeen('605747');
    expect(isNew('853220')).toBe(true);
  });

  /**
   * The regression this file exists for.
   *
   * `markShipmentSeen` used to rebuild the map keeping only entries younger
   * than a ten-minute grace window, so a shipment read half an hour ago was
   * erased by the next shipment anybody opened — and an erased entry reads as
   * *never opened*. Every row you had already dealt with went back to shouting
   * NEW, forever, and no amount of opening it again would stick.
   */
  it('does not forget an old shipment when a new one is opened', () => {
    const halfHourAgo = Date.now() - 30 * 60 * 1000;
    markShipmentSeen('605747', halfHourAgo);
    markShipmentSeen('853220');

    expect(isNew('605747')).toBe(false);
    expect(isNew('853220')).toBe(false);
  });

  it('still knows a shipment opened long ago', () => {
    markShipmentSeen('605747', Date.now() - 400 * 24 * 60 * 60 * 1000);
    expect(isNew('605747')).toBe(false);
  });

  it('re-opening one keeps the rest', () => {
    markShipmentSeen('605747');
    markShipmentSeen('853220');
    markShipmentSeen('605747');

    expect(Object.keys(readSeenShipments()).sort()).toEqual(['605747', '853220']);
  });
});

describe('bounds and bad input', () => {
  /* Capped by count, so the map cannot grow without limit — and the cap drops
     the reader's OLDEST history, never the shipment they just opened. */
  it('keeps the 500 most recently opened and drops the oldest', () => {
    const start = Date.now() - 600 * 1000;
    for (let index = 0; index < 520; index += 1) {
      markShipmentSeen(`ship-${index}`, start + index * 1000);
    }

    const seen = readSeenShipments();
    expect(Object.keys(seen)).toHaveLength(500);
    expect(isShipmentNew('ship-519', seen)).toBe(false);
    expect(isShipmentNew('ship-0', seen)).toBe(true);
  });

  it('treats junk in storage as nothing recorded', () => {
    globalThis.localStorage.setItem(KEY, 'not json');
    expect(isNew('605747')).toBe(true);

    globalThis.localStorage.setItem(KEY, '["605747"]');
    expect(isNew('605747')).toBe(true);
  });

  /* A non-numeric value is not a timestamp, so it cannot say when — and
     "opened at some unknown time" is not something this map can honour. */
  it('ignores an entry that is not a timestamp', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify({ '605747': 'yesterday' }));
    expect(isNew('605747')).toBe(true);
  });
});
