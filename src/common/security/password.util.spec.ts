import { hashPassword, verifyPassword, needsRehash } from './password.util';

describe('password hashing', () => {
  const password = 'CorrectHorseBattery@2026';

  it('produces an argon2id hash', async () => {
    const hash = await hashPassword(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
    expect(a).not.toBe(b);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword(password);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword(password);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false rather than throwing on a non-argon2 hash', async () => {
    /* A legacy bcrypt hash left over from before the migration. */
    const bcryptHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    await expect(verifyPassword(bcryptHash, password)).resolves.toBe(false);
  });

  it('returns false for an empty stored hash', async () => {
    await expect(verifyPassword('', password)).resolves.toBe(false);
  });

  describe('needsRehash', () => {
    it('is false for a hash at current parameters', async () => {
      const hash = await hashPassword(password);
      expect(needsRehash(hash)).toBe(false);
    });

    it('is true for an unparseable hash', () => {
      expect(needsRehash('not-a-hash')).toBe(true);
    });
  });
});
