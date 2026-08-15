import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  type PermissionMode,
} from '../decorators/permissions.decorator';
import { hasPermission } from '../constants/permissions';

/**
 * Enforces the permissions a route declares via `@RequirePermissions()`.
 *
 * Registered globally, so it runs on every request. Routes that declare no
 * permission are allowed through — authentication is still enforced separately
 * by the global `JwtAuthGuard`, so "no declared permission" means "any
 * authenticated user", not "public".
 *
 * The permissions are read from `request.user`, which `JwtStrategy.validate`
 * populated from the *database* on this request — not from the JWT body. A
 * role edited a minute ago therefore takes effect immediately, instead of
 * waiting for every outstanding access token to expire.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    /* Reaching a permission-gated route with no user means the auth guard was
     * bypassed — most likely the route was marked @Public() by mistake. Fail
     * as unauthenticated rather than silently allowing it. */
    if (!user) {
      throw new UnauthorizedException(
        'Authentication is required for this resource',
      );
    }

    const granted: string[] = Array.isArray(user.permissions) ? user.permissions : [];

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'any';

    const satisfied =
      mode === 'all'
        ? required.every((permission) => hasPermission(granted, permission))
        : required.some((permission) => hasPermission(granted, permission));

    if (!satisfied) {
      /* Name the missing permission. This is an authenticated caller being
       * told what they lack, which is a usability win and leaks nothing they
       * could not learn by trying every endpoint. */
      const joiner = mode === 'all' ? 'all of' : 'one of';
      throw new ForbiddenException(
        `Insufficient permissions. Requires ${joiner}: [${required.join(', ')}]`,
      );
    }

    return true;
  }
}
