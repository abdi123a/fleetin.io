import * as argon2 from 'argon2';

/**
 * Argon2id parameters, from the OWASP Password Storage Cheat Sheet.
 *
 * Argon2id is the hybrid variant: it resists GPU cracking like Argon2d and
 * side-channel attacks like Argon2i. The cost settings below are the OWASP
 * baseline (m=19 MiB, t=2, p=1) — raising `memoryCost` is the most effective
 * lever if these ever need to be strengthened, since memory is what makes
 * parallel cracking hardware expensive.
 *
 * These are exported as a single frozen object so hashing can never drift
 * between the auth service, the users service and the database seed. Argon2
 * encodes its parameters into the hash string itself, so raising the cost
 * later does not invalidate existing hashes: `verifyPassword` reads the
 * parameters from the stored hash, and `needsRehash` reports which ones are
 * stale.
 */
export const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
});

/** Hash a plaintext password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2 hash.
 *
 * Returns false rather than throwing when the stored value is not a valid
 * Argon2 hash — a legacy bcrypt hash, an empty column, or corruption. That
 * turns "unreadable hash" into a failed login instead of a 500, and denies
 * access in every case where the answer is not a definite match.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash was produced with weaker parameters than the current
 * `ARGON2_OPTIONS` — the signal to transparently re-hash on next successful
 * login. Also returns true for any hash Argon2 cannot parse at all.
 */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}
