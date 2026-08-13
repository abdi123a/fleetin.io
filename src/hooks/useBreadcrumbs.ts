import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { NAV_ITEMS_BY_PATH } from '@/config/navigation';
import { ROUTES } from '@/config/routes';
import { parseId } from '@/lib/ids';
import type { BreadcrumbItem } from '@/types';
import { toTitleCase } from '@/utils';
import { useBreadcrumbLabelStore } from '@/stores/breadcrumbLabel.store';

/**
 * Derives the breadcrumb trail from the current URL.
 *
 * Segments are labelled from the navigation config where a match exists, and
 * fall back to a title-cased segment otherwise — so routes added in Phase 2
 * produce a sensible trail before they are registered in navigation.
 *
 * A REFERENCE is the exception: `BKG-00013` must not become "Bkg 00013".
 * Title-casing exists to make a URL slug readable, and a reference is already
 * the most readable form of itself — mangling it breaks the one thing someone
 * reads a breadcrumb for, which is checking they are on the record they meant.
 *
 * The trail is always rooted at Dashboard, and the final segment is marked as
 * current (rendered as text, not a link).
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
  const { pathname } = useLocation();
  const labelOverrides = useBreadcrumbLabelStore((state) => state.overrides);

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);

    const root: BreadcrumbItem = {
      label: 'Dashboard',
      path: ROUTES.dashboard,
      isCurrent: pathname === ROUTES.dashboard || pathname === ROUTES.root,
    };

    if (root.isCurrent) return [{ ...root, path: undefined }];

    const trail = segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      const isCurrent = index === segments.length - 1;
      const navItem = NAV_ITEMS_BY_PATH.get(path);
      const decoded = decodeURIComponent(segment);

      return {
        label:
          navItem?.breadcrumbLabel ??
          navItem?.label ??
          labelOverrides[path] ??
          (parseId(decoded) ? decoded : toTitleCase(decoded)),
        // The current page renders as plain text; intermediate segments link.
        path: isCurrent ? undefined : path,
        isCurrent,
      } satisfies BreadcrumbItem;
    });

    return [root, ...trail];
  }, [pathname, labelOverrides]);
}
