import { describe, expect, it } from 'vitest';
import {
  frictionsFor,
  incompatibilityReasons,
  suggestLoadsFor,
  zoneOf,
} from '@/features/empty-returns/matching';
import { shipmentStepsFor } from '@/lib/shipmentStatus';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';

const NOW = Date.UTC(2026, 7, 27, 9, 0);
const HOUR = 3_600_000;

/** list[i] under `noUncheckedIndexedAccess` — a missing entry fails the test, loudly. */
function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`no entry at index ${index} (length ${list.length})`);
  return item;
}

/* Only the fields the gates read. The rest of both records is irrelevant to
   compatibility, and spelling it out would date the moment either type grows. */
const record = (over: Partial<EmptyReturnRecord> = {}) =>
  ({
    size: "40'",
    line: 'MSC',
    transporter: 'Dikhil Heavy Haulage',
    returnDepot: 'SGTD Yard',
    locationId: 'Boulaos Whse',
    locationName: 'Boulaos Whse',
    deadline: NOW + 48 * HOUR,
    ...over,
  }) as EmptyReturnRecord;

const load = (over: Partial<FullLoadMission> = {}) =>
  ({
    size: "40'",
    line: 'MSC',
    transporter: 'Dikhil Heavy Haulage',
    pickupHub: 'SGTD',
    locationId: 'SGTD',
    pickupAt: NOW + 4 * HOUR,
    ...over,
  }) as FullLoadMission;

/* The gates as they stand: same size, pickup inside the deadline. Line was a
   gate for one day (v19, 2026-08-29) and the user removed it on 2026-08-30 —
   a pairing across two lines is still a pairing. Transporter has not gated
   since v19. These tests are the mirror of `empty-return-matching.util.spec.ts`
   in the backend, which serves the same engine — they must not be allowed to
   drift. */
describe('compatibility gates', () => {
  it('accepts a pairing that matches on line, size and beats the deadline', () => {
    expect(incompatibilityReasons(record(), load(), NOW)).toEqual([]);
  });

  it('allows a different shipping line — it is a note on the pairing, not a veto', () => {
    expect(incompatibilityReasons(record({ line: 'MSC' }), load({ line: 'CMA CGM' }), NOW)).toEqual(
      [],
    );
  });

  it('allows a pairing even when one side has no line recorded', () => {
    expect(incompatibilityReasons(record({ line: undefined }), load(), NOW)).toEqual([]);
  });

  it('no longer cares who the transporter is — dispatch can re-assign a truck', () => {
    expect(
      incompatibilityReasons(record(), load({ transporter: 'Nagad Transit SARL' }), NOW),
    ).toEqual([]);
    expect(incompatibilityReasons(record(), load({ transporter: null }), NOW)).toEqual([]);
  });

  it('refuses a pickup that lands after the return deadline', () => {
    const issues = incompatibilityReasons(record({ deadline: NOW + HOUR }), load(), NOW);
    expect(issues.join(' ')).toContain('after this container');
  });

  /* An open booking routinely sits past its own slot because nobody has driven
     it yet. v19's literal rule refused those and emptied the live pool
     completely on 2026-08-29, so a stale slot is re-based to now instead. */
  it('keeps a load whose slot has already passed', () => {
    expect(incompatibilityReasons(record(), load({ pickupAt: NOW - 12 * HOUR }), NOW)).toEqual([]);
  });

  it('refuses a different container size', () => {
    expect(incompatibilityReasons(record(), load({ size: "20'" }), NOW)).toContain(
      'Different container size',
    );
  });

  /* The regression that made the location handling worth a test: the depot and
     the hub are the same place under two names, and comparing the raw strings
     called them different ports. */
  it('reads a depot and a hub that name one zone differently as the same port', () => {
    expect(
      frictionsFor(
        record({ returnDepot: 'Doraleh Depot' }),
        load({ pickupHub: 'DCT Doraleh', locationId: 'DCT Doraleh' }),
        NOW,
      ),
    ).toEqual([]);
  });
});

/* The 2026-08-27 rule: only what a dispatcher *cannot* arrange may veto a
   pairing. These two used to be hard gates, and between them they refused all
   920 candidate pairs in the real book — including the 92 that already agreed
   on transporter and size. */
describe('arrangeable frictions', () => {
  it('allows a different port, and names the leg between the two', () => {
    const empty = record({ returnDepot: 'Damerjog Depot' });
    expect(incompatibilityReasons(empty, load(), NOW)).toEqual([]);

    const frictions = frictionsFor(empty, load(), NOW);
    expect(frictions.map((f) => f.kind)).toEqual(['reposition']);
    expect(at(frictions, 0).detail).toContain('Damerjog Depot');
    expect(at(frictions, 0).detail).toContain('SGTD');
  });

  /* Promoted from friction to GATE on 2026-08-29. v19 will not offer a pairing
     whose pickup lands after the deadline at all — the whole point of pairing
     is beating that clock, so a pair that cannot is not a cheaper option, it is
     not an option. The friction it used to produce is gone with it. */
  it('refuses a pickup after the deadline outright — no longer a friction', () => {
    const empty = record({ deadline: NOW + HOUR });
    expect(incompatibilityReasons(empty, load(), NOW)).not.toEqual([]);
    expect(suggestLoadsFor({ ...empty, stage: 'empty' } as EmptyReturnRecord, [load()], NOW)).toEqual([]);
  });

  it('allows a container with no deadline, flagged as unknown margin', () => {
    const empty = record({ deadline: null });
    expect(incompatibilityReasons(empty, load(), NOW)).toEqual([]);
    expect(frictionsFor(empty, load(), NOW).map((f) => f.kind)).toEqual(['no-deadline']);
  });

  it('still refuses the one thing nobody can arrange', () => {
    /* Size is physics — a 40HC box does not go on a 20' chassis, and no phone
       call changes that. It is the only gate left on equipment. */
    expect(incompatibilityReasons(record(), load({ size: "20'" }), NOW)).toEqual([
      'Different container size',
    ]);
  });
});

describe('ranking with frictions', () => {
  it('puts the pairing at the same port first, and never headlines a tight one', () => {
    const clean = load({ pickupHub: 'SGTD', locationId: 'SGTD', pickupAt: NOW + 4 * HOUR });
    /* Same line and size so it is legal, but the box has to be trucked between
       two ports first — a real cost, priced, and never the headline. */
    const needsLeg = load({
      pickupHub: 'Damerjog Depot',
      locationId: 'Damerjog Depot',
      pickupAt: NOW + 6 * HOUR,
    });
    /* Deliberately offered worst-first, so a passing test means the sort ran. */
    const ranked = suggestLoadsFor(
      record({ stage: 'empty' } as Partial<EmptyReturnRecord>),
      [needsLeg, clean],
      NOW,
    );

    expect(ranked).toHaveLength(2);
    expect(at(ranked, 0).load).toBe(clean);
    expect(at(ranked, 0).frictions).toEqual([]);
    expect(at(ranked, 0).label).toBe('RECOMMENDED');
    expect(at(ranked, 1).frictions.map((f) => f.kind)).toContain('reposition');
  });

  /* Margin can no longer go negative: a pickup past the deadline is refused by
     the gate before it is ever scored. What survives is the TIGHT band — a
     positive but small margin, which is a real option somebody may have to
     take and so is offered, labelled the last resort. */
  it('marks a small positive margin tight and never recommends it', () => {
    const tight = load({ pickupHub: 'SGTD', locationId: 'SGTD', pickupAt: NOW + 45 * HOUR });
    const only = at(
      suggestLoadsFor(record({ stage: 'empty' } as Partial<EmptyReturnRecord>), [tight], NOW),
      0,
    );
    expect(only.marginMs).toBeGreaterThan(0);
    expect(only.tight).toBe(true);
    expect(only.label).toBe('LAST OPTION');
  });
});

describe('zoneOf', () => {
  it('folds the depot and the hub of one place onto the same zone', () => {
    expect(zoneOf('SGTD')).toBe(zoneOf('SGTD Yard'));
    expect(zoneOf('DCT Doraleh')).toBe(zoneOf('Doraleh Depot'));
    expect(zoneOf('PK12 Park')).toBe(zoneOf('PK12 Depot'));
  });

  it('keeps genuinely different zones apart', () => {
    expect(zoneOf('Port de Djibouti')).not.toBe(zoneOf('DCT Doraleh'));
    expect(zoneOf('Damerjog Depot')).not.toBe(zoneOf('Horizon Terminal'));
    expect(zoneOf('Boulaos Whse')).not.toBe(zoneOf('Gabode Whse'));
  });

  it('prefers the more specific zone when a name carries two', () => {
    expect(zoneOf('Djibouti Multipurpose Port (DMP) — Doraleh Port, Djibouti')).toBe('doraleh');
  });

  it('falls back to the place itself, so an unknown name matches only itself', () => {
    expect(zoneOf('Somewhere New')).toBe('somewhere new');
    expect(zoneOf('Somewhere New')).not.toBe(zoneOf('Somewhere Else'));
    expect(zoneOf(null)).toBe('');
  });
});

/* The user's rule, 2026-08-27: bulk cargo is tipped, not stripped. */
describe('the ladder a load walks', () => {
  it('gives a containerized load the full seven steps, ending at the empty', () => {
    const steps = shipmentStepsFor(true);
    expect(steps.map((s) => s.label)).toEqual([
      'Created',
      'Picked Up',
      'Delivered',
      'Unstuffing',
      'Empty Ready',
      'Empty Picked Up',
      'Empty Returned',
    ]);
  });

  it('gives a bulk load three steps, ending at delivery', () => {
    const steps = shipmentStepsFor(false);
    expect(steps.map((s) => s.label)).toEqual(['Created', 'Picked Up', 'Delivered']);
  });

  it('makes a bulk "Delivered" write Completed — delivery IS the end of the job', () => {
    const steps = shipmentStepsFor(false);
    expect(steps[steps.length - 1]).toEqual({ rung: 'Completed', label: 'Delivered' });
  });

  it('offers a bulk load no dépotage and no empty-return rung', () => {
    const rungs = shipmentStepsFor(false).map((s) => s.rung);
    expect(rungs).not.toContain('POD Submitted');
    expect(rungs).not.toContain('Empty Ready');
    expect(rungs).not.toContain('Empty Picked Up');
  });
});
