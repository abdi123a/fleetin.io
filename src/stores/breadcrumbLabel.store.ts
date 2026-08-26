import { create } from 'zustand';

/**
 * Per-path breadcrumb label overrides.
 *
 * `useBreadcrumbs()` falls back to title-casing the raw URL segment when a
 * route has no static nav-config label — fine for `/shippers/new`, but a
 * detail route's segment is now a real backend id (a UUID), which title-cases
 * into unreadable noise. A detail page that knows the entity's display name
 * (e.g. "CMA-CGM" or its "SHP-101" reference) calls `useBreadcrumbLabel()`
 * to override just its own trail segment, keyed by the exact pathname so it
 * only ever affects the page that set it.
 */
interface BreadcrumbLabelState {
  overrides: Record<string, string>;
  setOverride: (path: string, label: string) => void;
  clearOverride: (path: string) => void;
}

export const useBreadcrumbLabelStore = create<BreadcrumbLabelState>((set) => ({
  overrides: {},
  setOverride: (path, label) =>
    set((state) => ({ overrides: { ...state.overrides, [path]: label } })),
  clearOverride: (path) =>
    set((state) => {
      const { [path]: _removed, ...rest } = state.overrides;
      return { overrides: rest };
    }),
}));
