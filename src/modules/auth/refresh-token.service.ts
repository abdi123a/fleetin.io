import { Injectable, Logger } from '@nestjs/common';
import { randomUUID, createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Storage and lifecycle for refresh tokens.
 *
 * ## Why SHA-256 here and Argon2 for passwords
 *
 * Passwords are low-entropy and human-chosen, so they need a deliberately slow
 * hash. A refresh token is 256 bits of CSPRNG output — brute-forcing the
 * preimage is not on the table, so the slow-hash tax buys nothing. What we do
 * need is a *deterministic* digest, because the token has to be found by
 * lookup. Argon2 salts randomly and cannot be indexed; SHA-256 can. This is
 * the standard construction for opaque bearer tokens.
 *
 * ## Reuse detection
 *
 * Rotation alone does not stop a stolen token: the thief simply uses it first
 * and the victim's next refresh fails, silently, with no signal. Families fix
 * that. Every token minted from one login shares a `familyId`. Presenting a
 * token that was already rotated away (`isRevoked`) is proof that two parties
 * hold tokens from the same family — one of them stole it. Since we cannot
 * tell which, the safe move is to revoke the entire family and force a fresh
 * login.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministic digest used as the storage key.
   *
   * Not a secret-keyed MAC: the input is already unguessable, and keying it
   * would add a second secret to rotate for no attacker-facing gain.
   */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Start a new session family. One per successful login. */
  newFamilyId(): string {
    return randomUUID();
  }

  /** Persist an issued token as its hash. */
  async store(params: {
    token: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(params.token),
        userId: params.userId,
        familyId: params.familyId,
        expiresAt: params.expiresAt,
      },
    });
  }

  /** Look a token up by its hash, with the owning user and role attached. */
  async findByToken(token: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: { include: { role: true } } },
    });
  }

  /**
   * Mark one token as rotated, pointing at its successor.
   *
   * Kept separate from `store` so the caller can order the two writes inside a
   * single logical rotation.
   */
  async markRotated(tokenId: string, replacedById: string | null): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { isRevoked: true, revokedAt: new Date(), replacedById },
    });
  }

  /**
   * Revoke every live token in a family.
   *
   * Called on logout (deliberate end of session) and on reuse detection
   * (suspected theft). Already-revoked rows are left alone so the original
   * `revokedAt` timestamps survive for audit.
   */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    return result.count;
  }

  /** Revoke every live token for a user, across all their sessions. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Handle a token that was presented after it had already been rotated.
   *
   * Treated as theft: the whole family dies. Logged at `warn` because this is
   * one of the few auth events that genuinely warrants investigation.
   */
  async handleReuse(familyId: string, userId: string): Promise<void> {
    const revoked = await this.revokeFamily(familyId);
    this.logger.warn(
      `Refresh token reuse detected for user ${userId} (family ${familyId}). ` +
        `Revoked ${revoked} token(s) — the session must re-authenticate.`,
    );
  }

  /**
   * Constant-time comparison for hex digests of equal length.
   *
   * Not used on the primary lookup path (that is an indexed equality query in
   * the database), but available wherever two digests are compared in-process
   * so timing never leaks a prefix match.
   */
  safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Delete expired and revoked rows.
   *
   * Not scheduled yet — no business jobs in this phase. It exists so the
   * cleanup queue added later has something to call.
   */
  async pruneExpired(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { isRevoked: true }] },
    });
    return result.count;
  }
}
