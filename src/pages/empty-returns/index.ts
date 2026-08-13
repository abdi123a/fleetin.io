/**
 * Empty Returns — the empty-container return cycle module.
 *
 * Four sibling views rather than one tabbed page: each is a real URL, so the
 * sidebar can deep-link straight into Matching and an operator can bookmark
 * the screen they live in. The router registers all four from this barrel by
 * export name; `default` is the Dashboard, the module's landing view.
 *
 * Cycles and Chains are the exception: Chains is a *view of* the cycles list
 * (every chain is made of cycles already in it), not an independent dataset,
 * so it's a tab inside `EmptyReturnCyclesPage` (`?tab=chains`) rather than a
 * fifth route — see `components/ChainsTabPanel.tsx` and
 * `components/EmptyReturnCyclesTabNav.tsx`. The old `/empty-returns/chains`
 * path still resolves, via a redirect in the router.
 */

export { EmptyReturnModuleChrome } from './EmptyReturnModuleChrome';
export { EmptyReturnDashboardPage } from './EmptyReturnDashboardPage';
export { EmptyReturnCyclesPage } from './EmptyReturnCyclesPage';
export {
  EmptyReturnMatchingPage,
  type EmptyReturnMatchingPageProps,
} from './EmptyReturnMatchingPage';
export { EmptyReturnTransportersPage } from './EmptyReturnTransportersPage';
export { default } from './EmptyReturnDashboardPage';
