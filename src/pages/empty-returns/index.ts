/**
 * Empty Returns — the empty-container return cycle module.
 *
 * Three sibling views rather than one tabbed page: each is a real URL, so an
 * operator can bookmark the screen they live in. The router registers all
 * three from this barrel by export name; `default` is the Dashboard, the
 * module's landing view.
 *
 * Cycles and Chains are the exception: Chains is a *view of* the cycles list
 * (every chain is made of cycles already in it), not an independent dataset,
 * so it's a tab inside `EmptyReturnCyclesPage` (`?tab=chains`) rather than a
 * fourth route — see `components/ChainsTabPanel.tsx` and
 * `components/EmptyReturnCyclesTabNav.tsx`. The old `/empty-returns/chains`
 * path still resolves, via a redirect in the router.
 *
 * There is no standalone Matching route any more. Every "create a match"
 * entry point across the module — the dashboard header, Cycles' "New Cycle",
 * a cycle's own detail dialog — opens the same
 * `DualTransactionsRecommendationsModal` popup in place, so there is exactly
 * one matching workbench instead of a page duplicating a dialog.
 */

export { EmptyReturnModuleChrome } from './EmptyReturnModuleChrome';
export { EmptyReturnDashboardPage } from './EmptyReturnDashboardPage';
export { EmptyReturnCyclesPage } from './EmptyReturnCyclesPage';
export { EmptyReturnTransportersPage } from './EmptyReturnTransportersPage';
export { default } from './EmptyReturnDashboardPage';
