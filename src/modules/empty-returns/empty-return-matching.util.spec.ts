import {
  emptiesFor,
  incompatibility,
  loadsFor,
  normalizeContainerSize,
  resolveContainerSize,
  type MatchEmpty,
  type MatchLoad,
} from './empty-return-matching.util';

const H = 3_600_000;
const NOW = 1_700_000_000_000;

const empty = (over: Partial<MatchEmpty> = {}): MatchEmpty => ({
  id: 'e1',
  line: 'Maersk',
  size: "40'",
  deadline: NOW + 72 * H,
  distanceKm: 0,
  stage: 'empty',
  ...over,
});

const load = (over: Partial<MatchLoad> = {}): MatchLoad => ({
  id: 'l1',
  line: 'Maersk',
  size: "40'",
  appointment: NOW + 12 * H,
  slots: 1,
  taken: 0,
  ...over,
});

describe('empty-return matching — the one hard gate', () => {
  it('accepts a same-line, same-size load inside the deadline', () => {
    expect(incompatibility(empty(), load(), NOW)).toEqual([]);
    expect(loadsFor(empty(), [load()], NOW)).toHaveLength(1);
  });

  it('ALLOWS a different shipping line — the gate v19 introduced, removed 2026-08-30', () => {
    expect(incompatibility(empty(), load({ line: 'CMA CGM' }), NOW)).toEqual([]);
    expect(loadsFor(empty(), [load({ line: 'CMA CGM' })], NOW)).toHaveLength(1);
  });

  it('allows a pairing when one side has no line recorded', () => {
    expect(incompatibility(empty({ line: null }), load(), NOW)).toEqual([]);
  });

  it('refuses a different container size', () => {
    expect(loadsFor(empty(), [load({ size: '40HC' })], NOW)).toHaveLength(0);
  });

  it('does NOT consider the transporter — it stopped being a gate in v19', () => {
    // Neither shape carries a transporter field at all; proving the engine
    // cannot accidentally regain the old rule.
    expect(Object.keys(empty())).not.toContain('transporter');
    expect(Object.keys(load())).not.toContain('transporter');
  });

  it('refuses a pickup past the deadline', () => {
    expect(loadsFor(empty(), [load({ appointment: NOW + 100 * H })], NOW)).toHaveLength(0);
  });

  /* The correction v19 needed to survive real data: an open booking routinely
     sits past its own slot because nobody has driven it yet, and refusing those
     emptied the pool completely on 2026-08-29. */
  it('KEEPS a load whose slot has already passed, re-based to now', () => {
    const stale = loadsFor(empty(), [load({ appointment: NOW - 12 * H })], NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0].reasons.join(' ')).toMatch(/already passed/);
    // Margin is measured from now, not from the stale slot, so it cannot
    // flatter itself with 12 extra hours it does not have.
    expect(stale[0].windowMs).toBe(72 * H);
  });

  it('still refuses a stale load once NOW itself is past the deadline', () => {
    expect(
      loadsFor(empty({ deadline: NOW - H }), [load({ appointment: NOW - 12 * H })], NOW),
    ).toHaveLength(0);
  });

  it('refuses a load whose slots are all spoken for, and allows the next one when capacity remains', () => {
    expect(loadsFor(empty(), [load({ slots: 1, taken: 1 })], NOW)).toHaveLength(0);
    // v19's qty: a 2-slot load still has room after one empty is assigned.
    expect(loadsFor(empty(), [load({ slots: 2, taken: 1 })], NOW)).toHaveLength(1);
  });

  it('only ever suggests for a container still awaiting a decision', () => {
    expect(loadsFor(empty({ stage: 'paired' }), [load()], NOW)).toHaveLength(0);
    expect(loadsFor(empty({ stage: 'closed' }), [load()], NOW)).toHaveLength(0);
  });
});

describe('ranking', () => {
  it('labels the best clean pairing RECOMMENDED and the rest ALTERNATIVE', () => {
    const near = load({ id: 'near', appointment: NOW + 6 * H });
    const far = load({ id: 'far', appointment: NOW + 48 * H });
    const out = loadsFor(empty(), [far, near], NOW);
    expect(out.map((s) => s.load.id)).toEqual(['near', 'far']);
    expect(out.map((s) => s.label)).toEqual(['RECOMMENDED', 'ALTERNATIVE']);
  });

  it('never lets a tight window be the recommendation, even alone', () => {
    // Deadline only 2h after the pickup — inside the 6h "risky" band.
    const tight = loadsFor(
      empty({ deadline: NOW + 14 * H }),
      [load({ appointment: NOW + 12 * H })],
      NOW,
    );
    expect(tight).toHaveLength(1);
    expect(tight[0].risky).toBe(true);
    expect(tight[0].label).toBe('LAST OPTION');
  });

  it('prices a repositioning leg — a distant box scores below one already at the hub', () => {
    const atHub = loadsFor(empty({ distanceKm: 0 }), [load()], NOW)[0];
    const away = loadsFor(empty({ distanceKm: 20 }), [load()], NOW)[0];
    expect(atHub.score).toBeGreaterThan(away.score);
  });
});

describe('the reverse direction', () => {
  it('bumps an urgent container so it outranks a relaxed one', () => {
    const urgent = empty({ id: 'urgent', deadline: NOW + 30 * H });
    const relaxed = empty({ id: 'relaxed', deadline: NOW + 200 * H });
    const out = emptiesFor(load(), [relaxed, urgent], NOW);
    expect(out[0].empty.id).toBe('urgent');
    expect(out[0].reasons.join(' ')).toMatch(/Urgent deadline/);
  });

  it('skips containers that are not awaiting a decision', () => {
    expect(emptiesFor(load(), [empty({ stage: 'return_planned' })], NOW)).toHaveLength(0);
  });
});

describe('size normalisation mirrors the frontend', () => {
  it.each([
    ['Container (40ft) High Cube', '40HC'],
    ['container_40', "40'"],
    ['Container (20ft)', "20'"],
    ['40 HC', '40HC'],
    ['', 'Unspecified'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeContainerSize(input)).toBe(expected);
  });

  it('prefers a category that names a size, else falls back to the cargo type', () => {
    expect(resolveContainerSize('container_40', 'Container (20ft)')).toBe("40'");
    expect(resolveContainerSize('containerized', 'Container (20ft)')).toBe("20'");
  });
});
