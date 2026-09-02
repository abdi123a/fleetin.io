import { ROUTES } from '@/config/routes';

/**
 * The module's views, and where each one lives.
 *
 * Straight off the product architecture: Control Tower decides, Cycles
 * explains, Dashboard measures, Matching works one container deeply.
 *
 * There is deliberately **no tab strip** on the page. The sidebar already lists
 * all five under Empty Container, and a second row of the same five links
 * directly under the page title is the same navigation twice — it costs a strip
 * of vertical space on every view and makes the reader check which of the two
 * controls is the live one. What the module chrome prints as the page subtitle
 * is the `label`: three screens share one H1, so something has to name the open
 * one. Each view used to carry a *question* here that the chrome printed
 * instead — a sentence of explanation on every screen, dropped 2026-08-29.
 */
export interface EmptyReturnView {
  key: string;
  label: string;
  path: string;
}

export const EMPTY_RETURN_VIEWS: readonly EmptyReturnView[] = [
  {
    key: 'tower',
    label: 'Control Tower',
    path: ROUTES.emptyReturns,
  },
  {
    key: 'matching',
    label: 'Matching',
    path: ROUTES.emptyReturnsMatching,
  },
  {
    key: 'cycles',
    /* Kept in step with the sidebar's label on purpose — this list drives the
       page header, and a nav item and the page it opens must not disagree
       about what the page is called. */
    label: 'Cycles / Chains',
    path: ROUTES.emptyReturnsCycles,
  },
  /* Still registered even though the sidebar has no link to it: this list
     drives the PAGE HEADER, not the navigation. `/empty-returns/performance`
     remains a real route, and somebody arriving by URL should read its own
     name rather than inheriting the Control Tower's. */
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: ROUTES.emptyReturnsPerformance,
  },
];

/** The Control Tower — the module root, and the fallback for an unmatched path. */
const CONTROL_TOWER = EMPTY_RETURN_VIEWS[0] as EmptyReturnView;

/** The view whose route is currently open. */
export function viewForPath(pathname: string): EmptyReturnView {
  const exact = EMPTY_RETURN_VIEWS.find((view) => view.path === pathname);
  if (exact) return exact;
  const nested = EMPTY_RETURN_VIEWS.filter((view) => view.path !== ROUTES.emptyReturns).find(
    (view) => pathname.startsWith(view.path),
  );
  return nested ?? CONTROL_TOWER;
}
