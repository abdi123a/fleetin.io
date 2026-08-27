import { ROUTES } from '@/config/routes';

/**
 * The five views, and the question each one answers.
 *
 * Straight off the product architecture: Control Tower decides, Calendar
 * monitors, Matching optimises, Cycles explains, Dashboard measures.
 *
 * There is deliberately **no tab strip** on the page. The sidebar already lists
 * all five under Empty Container, and a second row of the same five links
 * directly under the page title is the same navigation twice — it costs a strip
 * of vertical space on every view and makes the reader check which of the two
 * controls is the live one. What survives here is the *question*, which the
 * module chrome prints as the page subtitle so each screen still states its job.
 */
export interface EmptyReturnView {
  key: string;
  label: string;
  question: string;
  path: string;
}

export const EMPTY_RETURN_VIEWS: readonly EmptyReturnView[] = [
  {
    key: 'tower',
    label: 'Control Tower',
    question: 'What needs my attention now?',
    path: ROUTES.emptyReturns,
  },
  {
    key: 'calendar',
    label: 'Calendar',
    question: 'What happens next?',
    path: ROUTES.emptyReturnsCalendar,
  },
  {
    key: 'matching',
    label: 'Matching',
    question: 'Which empty containers are available — and where can they be used?',
    path: ROUTES.emptyReturnsMatching,
  },
  {
    key: 'cycles',
    label: 'Cycles',
    question: 'What happened operationally?',
    path: ROUTES.emptyReturnsCycles,
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    question: 'How are we performing?',
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
