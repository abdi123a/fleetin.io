import { useMemo } from 'react';

import { canOpenPath } from '@/config/permissions';
import { useAuthStore } from '@/stores';
import { hasAnyPermission, hasPermission, isSuperuser, toGrantList } from '@/utils';

/**
 * What the signed-in account may do.
 *
 * One hook so a screen never reaches into the auth store and re-derives grant
 * matching by hand — a page that compares `user.role === 'ADMIN'` gets the
 * answer wrong for every custom access profile, which is precisely how a
 * twelve-permission account ended up being shown an administrator's console.
 *
 * These are presentation gates. They decide what is worth *offering*; the
 * server decides what is allowed, on every request.
 */
export function usePermissions() {
  const permissions = useAuthStore((state) => state.user?.permissions);

  return useMemo(() => {
    const grants = toGrantList(permissions);
    return {
      grants,
      isSuperuser: isSuperuser(grants),
      /** Holds this exact permission (wildcards honoured). */
      can: (permission: string) => hasPermission(grants, permission),
      /** Holds at least one of them. */
      canAny: (required: readonly string[]) => hasAnyPermission(grants, required),
      /** May open this route — same table the sidebar and route guard read. */
      canOpen: (path: string) => canOpenPath(grants, path),
    };
  }, [permissions]);
}
