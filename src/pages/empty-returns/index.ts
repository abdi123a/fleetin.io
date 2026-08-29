/**
 * Empty Container Management — the views, one route each.
 *
 * The product architecture:
 *
 * | View          | The question it answers                                  |
 * |---------------|----------------------------------------------------------|
 * | Control Tower | What needs my attention now? — the only view that asks   |
 * | Calendar      | What happens next? — a tab on the Control Tower          |
 * | Cycles        | What happened? — chains drawn, not tabulated             |
 * | Dashboard     | How are we performing? — measurement, no queue           |
 *
 * Matching is deliberately **not** a view: it is the popup the Control Tower's
 * "Find full load" button leads to (the Matching page), and the one
 * place a pairing is made. The module root is the Control Tower rather than a
 * dashboard: an operator opening Empty Return wants the queue, and measurement
 * is a place you go deliberately. `EmptyReturnModuleChrome` is the layout route
 * that owns the clock, the title, the toast and the one container dialog every
 * view opens.
 *
 * `default` is the Control Tower, so a bare `import` of this barrel lands on the
 * screen the module is actually about.
 */

export { EmptyReturnModuleChrome } from './EmptyReturnModuleChrome';
export { ControlTowerPage } from './ControlTowerPage';
export { EmptyReturnCalendarPage } from './EmptyReturnCalendarPage';
export { MatchingPage } from './MatchingPage';
export { EmptyReturnCyclesPage } from './EmptyReturnCyclesPage';
export { EmptyReturnPerformancePage } from './EmptyReturnPerformancePage';
export { EMPTY_RETURN_VIEWS, viewForPath, type EmptyReturnView } from './components/views';
export { default } from './ControlTowerPage';
