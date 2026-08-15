import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { hashPassword, verifyPassword, needsRehash } from '../../common/security/password.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

/** Shape of the JWT body. `jti` ties an access token to its session family. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  familyId: string;
}

/** A user loaded with its role — what token generation needs. */
type UserWithRole = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  status: string;
  role: { name: string; permissions: unknown };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Read a required secret.
   *
   * `ConfigService.get` is called without a default on purpose: the
   * environment schema has already proven these exist, and supplying a
   * fallback here would silently reintroduce the baked-in secret this phase
   * removed. If one is somehow absent the request fails loudly instead.
   */
  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(
        `Server misconfiguration: ${key} is not set`,
      );
    }
    return value;
  }

  /**
   * Read a JWT lifetime from config.
   *
   * `@types/jsonwebtoken` types `expiresIn` as a template-literal union
   * (`"15m"`, `"7d"`, …) which no value read from the environment can satisfy
   * statically. The cast is confined to this one helper rather than repeated
   * at each call site; an invalid string is rejected by jsonwebtoken at signing
   * time with a clear error.
   */
  private lifetime(key: string, fallback: string): JwtSignOptions['expiresIn'] {
    return this.configService.get<string>(key, fallback) as JwtSignOptions['expiresIn'];
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    /* Self-registration is always the least-privileged role. A caller must
     * never be able to choose their own role from the request body. */
    const clientRole = await this.prisma.role.upsert({
      where: { name: 'CLIENT' },
      update: {},
      create: {
        name: 'CLIENT',
        description: 'Default client user',
        permissions: ['bookings.view', 'bookings.create', 'shipments.track'],
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        roleId: clientRole.id,
      },
      include: { role: true },
    });

    return this.issueSession(user as unknown as UserWithRole);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    /* Both "no such user" and "wrong password" return the same message, so the
     * endpoint cannot be used to enumerate which emails have accounts. */
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    /* Transparent upgrade: a hash written under weaker Argon2 parameters is
     * rewritten now that we hold the plaintext and know it is correct. */
    if (needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(dto.password) },
      });
    }

    return this.issueSession(user as unknown as UserWithRole);
  }

  /**
   * Rotate a refresh token.
   *
   * The old token is revoked and a new one issued in the same family. If the
   * presented token was *already* revoked, that is reuse — someone is holding
   * a copy — and the entire family is torn down.
   */
  async refreshToken(dto: RefreshTokenDto) {
    const stored = await this.refreshTokens.findByToken(dto.refreshToken);

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.isRevoked) {
      await this.refreshTokens.handleReuse(stored.familyId, stored.userId);
      throw new UnauthorizedException(
        'Refresh token has already been used. This session has been revoked.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    /* Continue the existing family so the chain stays linked. */
    const session = await this.issueSession(
      stored.user as unknown as UserWithRole,
      stored.familyId,
    );

    const successor = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.refreshTokens.hash(session.refreshToken) },
      select: { id: true },
    });
    await this.refreshTokens.markRotated(stored.id, successor?.id ?? null);

    return session;
  }

  /**
   * End the caller's session.
   *
   * Takes the authenticated user's own family id — never a token from the
   * request body — so one user can never revoke another's session by
   * presenting a token string they happened to obtain.
   */
  async logout(userId: string, familyId: string) {
    const revoked = await this.refreshTokens.revokeFamily(familyId);
    return {
      message: 'Logged out successfully',
      revokedTokens: revoked,
      userId,
    };
  }

  /** Revoke every session for a user, on every device. */
  async logoutAll(userId: string) {
    const revoked = await this.refreshTokens.revokeAllForUser(userId);
    return { message: 'All sessions revoked', revokedTokens: revoked };
  }

  /**
   * Mint an access/refresh pair and persist the refresh token's hash.
   *
   * `familyId` is supplied when continuing an existing session and generated
   * when starting a new one.
   */
  private async issueSession(user: UserWithRole, familyId?: string) {
    const family = familyId ?? randomUUID();

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      familyId: family,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.requireConfig('JWT_SECRET'),
      expiresIn: this.lifetime('JWT_EXPIRES_IN', '15m'),
    });

    const refreshExpiresIn = this.lifetime('JWT_REFRESH_EXPIRES_IN', '7d');

    const refreshToken = this.jwtService.sign(
      /* A nonce guarantees two tokens minted in the same second still differ,
       * so the unique constraint on the hash can never collide. */
      { ...payload, nonce: randomUUID() },
      {
        secret: this.requireConfig('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      },
    );

    /* Derive the stored expiry from the token itself rather than recomputing
     * it, so the row and the JWT can never disagree. */
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokens.store({
      token: refreshToken,
      userId: user.id,
      familyId: family,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        permissions: user.role.permissions,
      },
    };
  }
}
