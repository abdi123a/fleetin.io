import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { NAV_ITEMS_BY_PATH } from '@/config/navigation';
import { ROUTES } from '@/config/routes';
import { parseId } from '@/lib/ids';
import type { BreadcrumbItem } from '@/types';
import { toTitleCase } from '@/utils';
import { useBreadcrumbLabelStore } from '@/stores/breadcrumbLabel.store';

/**
 * A backend primary key, as opposed to a slug someone chose.
 *
 * A UUID must never reach `toTitleCase`, which splits it on its dashes and
 * capitalises each chunk — `/hr/employees/4044e182-179d-…` came out as
 * "4044e182 179d 4861 89b5 C80e7aeb6d80", which is worse than the raw id and
 * is not what a breadcrumb is for. A reference like `EMP-00001` is the
 * readable form of itself and is handled by `parseId` instead.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What to call a record whose page has not named it yet.
 *
 * The parent segment already says what kind of thing this is — `employees`,
 * `shippers`, `invoices` — so the singular of its label is both accurate and
 * stable, and it is what the trail settles on if the record fails to load at
 * all. A page that knows better overrides it through `useBreadcrumbLabel`.
 */
function unnamedRecordLabel(parentLabel: string | undefined): string {
  if (!parentLabel) return 'Record';
  return parentLabel.endsWith('s') ? parentLabel.slice(0, -1) : parentLabel;
}

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

      const parentPath = `/${segments.slice(0, index).join('/')}`;
      const parentNav = NAV_ITEMS_BY_PATH.get(parentPath);

      const fallback = UUID.test(decoded)
        ? unnamedRecordLabel(parentNav?.breadcrumbLabel ?? parentNav?.label)
        : parseId(decoded)
          ? decoded
          : toTitleCase(decoded);

      return {
        label:
          navItem?.breadcrumbLabel ??
          navItem?.label ??
          labelOverrides[path] ??
          fallback,
        // The current page renders as plain text; intermediate segments link.
        path: isCurrent ? undefined : path,
        isCurrent,
      } satisfies BreadcrumbItem;
    });

    return [root, ...trail];
  }, [pathname, labelOverrides]);
}
