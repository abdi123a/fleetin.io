import { beforeEach, describe, expect, it } from 'vitest';

import { loadLocations, resetLocations, saveLocations } from './locationCatalog';

const PORTS = ['Port of Djibouti', 'Port of Tadjourah'];

/**
 * Seeding and migration, which is where a catalogue like this goes wrong.
 *
 * The list used to be two frozen constants plus an append-only "custom" key.
 * Turning it into one editable array is only safe if a first read still
 * produces the corridor's own ports AND keeps whatever the old key collected —
 * a silent drop there would delete a warehouse somebody typed months ago, and
 * the only symptom is a picker that is quietly one option short.
 */
/* Node's own `localStorage` needs a `--localstorage-file` to be usable, and
   this suite is about the catalogue's rules rather than the browser's storage
   engine. A map with the four methods it calls is the whole dependency. */
function stubStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe('locationCatalog', () => {
  beforeEach(stubStorage);

  it('starts a fresh account on the built-in list', () => {
    expect(loadLocations('pickup', PORTS)).toEqual(PORTS);
  });

  it('carries over locations added under the old append-only key', () => {
    globalThis.localStorage.setItem(
      'fleetin.customPickupLocations',
      JSON.stringify(['PK12 Warehouse']),
    );
    expect(loadLocations('pickup', PORTS)).toEqual([...PORTS, 'PK12 Warehouse']);
  });

  it('does not migrate a name the built-in list already has', () => {
    globalThis.localStorage.setItem(
      'fleetin.customPickupLocations',
      JSON.stringify(['port of djibouti']),
    );
    expect(loadLocations('pickup', PORTS)).toEqual(PORTS);
  });

  it('keeps an edited list, including one a built-in was deleted from', () => {
    saveLocations('pickup', ['Port of Tadjourah']);
    expect(loadLocations('pickup', PORTS)).toEqual(['Port of Tadjourah']);
  });

  it('remembers an emptied list rather than re-seeding it', () => {
    /* `[]` is a decision, not an absence — re-seeding here would put every
       deleted port back the next time the wizard opened. */
    saveLocations('pickup', []);
    expect(loadLocations('pickup', PORTS)).toEqual([]);
  });

  it('puts the built-in list back on reset', () => {
    saveLocations('dropoff', ['Somewhere else']);
    expect(resetLocations('dropoff', PORTS)).toEqual(PORTS);
    expect(loadLocations('dropoff', PORTS)).toEqual(PORTS);
  });

  it('keeps the two sides apart', () => {
    saveLocations('pickup', ['A']);
    expect(loadLocations('dropoff', PORTS)).toEqual(PORTS);
  });
});
