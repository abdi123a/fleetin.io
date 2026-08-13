/**
 * A seeded pseudo-random source.
 *
 * The mock dataset has to be *stable*: the same shipper id must produce the
 * same shipments on every render, or a filter change would reshuffle the data
 * underneath the user and every chart would be untestable. `Math.random` cannot
 * do that, so this is a mulberry32 PRNG seeded from a string.
 */
export class Rng {
  private state: number;

  constructor(seed: string) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    this.state = hash >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [low, high). */
  float(low: number, high: number): number {
    return low + this.next() * (high - low);
  }

  /** Uniform integer in [low, high]. */
  int(low: number, high: number): number {
    return Math.floor(this.float(low, high + 1));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error('Rng.pick called with an empty list');
    return item;
  }

  /** Pick by relative weight. Weights need not sum to one. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    const last = entries.at(-1);
    if (!last) throw new Error('Rng.weighted called with no entries');
    return last[0];
  }

  /**
   * Roughly log-normal positive value.
   *
   * Durations and delays are not symmetric — most shipments cluster near a
   * typical value with a long right tail, and a uniform draw produces data that
   * makes the P90 charts look wrong because there is no tail to show.
   */
  logNormal(medianValue: number, sigma: number): number {
    const u1 = Math.max(this.next(), 1e-9);
    const u2 = this.next();
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return medianValue * Math.exp(sigma * normal);
  }
}
