import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './auth.service';

/** What `@CurrentUser()` resolves to on an authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  roleId: string;
  role: { id: string; name: string; permissions: unknown };
  /** Session family from the token — required to log this session out. */
  familyId: string;
  /** Flattened permission strings, normalised to `resource.action`. */
  permissions: string[];
  /** Portal scoping (BR-10.5) — set only for SHIPPER-role accounts. */
  shipperId: string | null;
  /** Portal scoping (BR-10.5) — set only for TRANSPORTER-role accounts. */
  partnerId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      /* getOrThrow, not get-with-default: there is no such thing as a
       * development fallback for a signing key. The environment schema
       * guarantees this is present, and this call proves it at boot. */
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Re-read the user on every request.
   *
   * The token carries a role name, but roles and account status change while
   * a token is still valid. Trusting the token's copy would leave a
   * deactivated or demoted user with up to a full token lifetime of stale
   * access, so authorization always resolves against current database state.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is disabled or unauthenticated');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roleId: user.roleId,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions,
      },
      familyId: payload.familyId,
      permissions: normalisePermissions(user.role.permissions),
      shipperId: user.shipperId,
      partnerId: user.partnerId,
    };
  }
}

/**
 * Coerce the `permissions` JSON column into a string array.
 *
 * The column is `Json`, so it can hold anything the database was given. Rather
 * than trusting its shape, anything that is not a string is dropped — a
 * malformed row costs its holder access instead of crashing the guard.
 */
function normalisePermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string');
}
