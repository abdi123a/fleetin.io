/**
 * Deterministic randomness for the mock world.
 *
 * Seeded from a string (FNV-1a) and stepped with mulberry32, so the same
 * transporter id always generates the same book of work: reloads, tests and
 * screenshots all see one stable dataset. Mirrors `shipper-bi/mocks/random`.
 */
export class Rng {
  private state: number;

  constructor(seed: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    this.state = hash >>> 0;
  }

  /** Uniform [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Inclusive on both ends. */
  int(lo: number, hi: number): number {
    return Math.floor(this.float(lo, hi + 1));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const index = Math.min(items.length - 1, Math.floor(this.next() * items.length));
    return items[index] as T;
  }

  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    const last = entries[entries.length - 1];
    if (!last) throw new Error('weighted() requires at least one entry');
    return last[0];
  }

  /**
   * Log-normal around a median — the right shape for durations and lags,
   * where most values sit near the middle and a tail runs long.
   */
  logNormal(median: number, sigma: number): number {
    const u = Math.max(this.next(), 1e-9);
    const v = Math.max(this.next(), 1e-9);
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(sigma * z);
  }
}
