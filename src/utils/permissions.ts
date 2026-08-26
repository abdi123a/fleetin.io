/**
 * Grant matching, client side.
 *
 * A deliberate mirror of the backend's `grantSatisfies` (see
 * `fleetin-backend/src/common/constants/permissions.ts`). The server remains
 * the authority — every gate here is also enforced there, and none of this
 * stops a determined caller. What it does stop is the app *advertising* work
 * an account cannot do: a sidebar full of modules that answer 403 is a broken
 * product, not a security boundary, and it is the reason this exists.
 *
 * The two implementations must agree on wildcards, so this file stays as close
 * to a transcription as TypeScript allows.
 */

/** Superuser. Held by ADMIN alone; the API refuses to grant it to anything else. */
export const SUPERUSER_GRANT = '*';

/**
 * Normalises whatever the session is carrying into a grant list.
 *
 * `UserProfile.permissions` is typed loosely (`string[] | Record<…>`) because
 * it is whatever the login response handed over, and older stored sessions in
 * `localStorage` predate the array form. An unreadable value yields no grants
 * rather than a crash — failing closed, so a malformed session sees the
 * dashboard rather than everything.
 */
export function toGrantList(permissions: unknown): string[] {
  if (Array.isArray(permissions)) {
    return permissions.filter((entry): entry is string => typeof entry === 'string');
  }

  if (permissions && typeof permissions === 'object') {
    /* The legacy object shape: `{ 'shipments.view': true }`, or a resource
     * mapped to its actions. Both collapse to the same flat list. */
    return Object.entries(permissions as Record<string, unknown>).flatMap(([key, value]) => {
      if (value === true) return [key];
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string').map((action) => `${key}.${action}`);
      }
      return [];
    });
  }

  return [];
}

/** Does one grant satisfy one requirement? Handles `*` and `resource.*`. */
export function grantSatisfies(granted: string, required: string): boolean {
  if (granted === SUPERUSER_GRANT) return true;
  if (granted === required) return true;

  if (granted.endsWith('.*')) {
    const resource = granted.slice(0, -2);
    return required.startsWith(`${resource}.`);
  }

  return false;
}

/** Does any held grant satisfy the requirement? */
export function hasPermission(grants: string[], required: string): boolean {
  return grants.some((grant) => grantSatisfies(grant, required));
}

/**
 * Any-of, not all-of.
 *
 * A screen is reachable when the account can do *something* on it. HR's
 * employee list, for instance, is worth opening with `hr.view` alone even
 * though salaries on it need `hr.view-salary` — the page hides what it must,
 * and the field-level gates stay where they already are.
 */
export function hasAnyPermission(grants: string[], required: readonly string[]): boolean {
  if (required.length === 0) return true;
  return required.some((permission) => hasPermission(grants, permission));
}

/** True for a session that holds `*`. */
export function isSuperuser(grants: string[]): boolean {
  return grants.includes(SUPERUSER_GRANT);
}
