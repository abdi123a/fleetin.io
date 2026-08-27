import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { permissionsForPath } from '@/config/permissions';
import { NoAccessPage } from '@/pages/errors/NoAccessPage';
import { useAuthStore } from '@/stores';
import { hasAnyPermission, toGrantList } from '@/utils';

/**
 * Refuses a route the session's grants do not reach.
 *
 * Filtering the sidebar hides the door; this closes it. A URL typed,
 * bookmarked or linked from an email arrives at the same page a hidden nav row
 * would have led to, and without this it renders — usually as a half-empty
 * screen full of 403s, which reads as a broken feature rather than a refusal.
 *
 * This is a usability boundary, not a security one. The server enforces the
 * same permissions on every request and is the only thing standing between an
 * account and data it may not have; what this adds is an honest answer instead
 * of a page that fails a dozen times in the background.
 */
export function RoutePermissionGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const permissions = useAuthStore((state) => state.user?.permissions);

  const required = permissionsForPath(pathname);
  if (required.length === 0) return <>{children}</>;

  return hasAnyPermission(toGrantList(permissions), required) ? (
    <>{children}</>
  ) : (
    <NoAccessPage required={required} />
  );
}
