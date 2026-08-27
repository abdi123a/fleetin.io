import { useEffect } from 'react';
import { create } from 'zustand';

import { usePartners } from '@/features/partners/api/queries';
import { useShippers } from '@/features/shippers/api/queries';

/**
 * One place that knows what a company's mark is.
 *
 * Every board in Fleetin names companies, and each of them used to resolve the
 * logo its own way: the transporter console looked in a mock `CUSTOMER_LOGOS`
 * table, Empty Container looked in a *different* mock table built from
 * `MOCK_SHIPPERS`/`INITIAL_PARTNERS`, and only the Shipments list read the real
 * one off the API. So the same shipper appeared with its logo on one page and
 * as grey initials on the next, and a logo uploaded through
 * `POST /shippers/:id/logo` showed up on exactly one screen.
 *
 * This registry is the fix: filled once from the real `/shippers` and
 * `/partners` responses, read synchronously by every mark on every page. The
 * mock tables stay as a fallback for names the API does not carry — the demo
 * fixtures, and roles like Port or Customs that are not accounts at all.
 *
 * Keyed by **id and by lowercased legal name**, because callers have one or the
 * other and rarely both: a booking carries `partner.companyLegalName`, a
 * shipment carries `customer.id`, and a report carries only a string it was
 * handed.
 */

interface CompanyLogoState {
  /** id → url and lowercased name → url, in one map. */
  logos: Record<string, string>;
  register: (entries: { id?: string | null; name?: string | null; logoUrl?: string | null }[]) => void;
}

const useCompanyLogoStore = create<CompanyLogoState>((set) => ({
  logos: {},
  register: (entries) =>
    set((state) => {
      let changed = false;
      const next = { ...state.logos };
      for (const entry of entries) {
        if (!entry.logoUrl) continue;
        if (entry.id && next[entry.id] !== entry.logoUrl) {
          next[entry.id] = entry.logoUrl;
          changed = true;
        }
        const key = entry.name?.trim().toLowerCase();
        if (key && next[key] !== entry.logoUrl) {
          next[key] = entry.logoUrl;
          changed = true;
        }
      }
      // Returning the same object when nothing moved keeps every subscribed
      // mark — there are hundreds on a busy page — from re-rendering on each
      // refetch of an unchanged company list.
      return changed ? { logos: next } : state;
    }),
}));

/**
 * Fill the registry. Mount once, high in the tree.
 *
 * Both queries are ordinary React Query reads, so mounting this beside other
 * consumers costs one shared request rather than one per component — and the
 * leaves below read the resolved map instead of each holding a subscription of
 * their own.
 */
export function useCompanyLogoRegistry(): void {
  const { data: shippers } = useShippers();
  const { data: partners } = usePartners();
  const register = useCompanyLogoStore((state) => state.register);

  useEffect(() => {
    const entries = [
      ...(shippers?.items ?? []).map((row) => ({
        id: row.id,
        name: row.companyLegalName,
        logoUrl: row.logoUrl,
      })),
      ...(partners?.items ?? []).map((row) => ({
        id: row.id,
        name: row.companyLegalName,
        logoUrl: row.logoUrl,
      })),
    ];
    if (entries.length > 0) register(entries);
  }, [shippers, partners, register]);
}

/**
 * The registered mark for a company, by id or by name.
 *
 * Takes several keys and returns the first that resolves, because a caller
 * usually has an id *or* a name and should not have to know which one the
 * registry happened to be filled under.
 *
 * A hook so a mark re-renders when the registry fills — the lists arrive after
 * the first paint, and a plain function read would leave every avatar showing
 * initials until something else happened to re-render it.
 */
export function useCompanyLogo(
  ...keys: (string | null | undefined)[]
): string | undefined {
  return useCompanyLogoStore((state) => {
    for (const key of keys) {
      if (!key) continue;
      const hit = state.logos[key] ?? state.logos[key.trim().toLowerCase()];
      if (hit) return hit;
    }
    return undefined;
  });
}

/**
 * Publish marks into the registry from outside the query-driven fill.
 *
 * `useCompanyLogoRegistry` covers everything the API returns. This is for the
 * marks the API has no table for — a shipping line, which is a name on a box
 * rather than an account — so those still resolve everywhere a company mark is
 * drawn instead of only in the field they were uploaded from.
 */
export function registerCompanyLogos(
  entries: { id?: string | null; name?: string | null; logoUrl?: string | null }[],
): void {
  useCompanyLogoStore.getState().register(entries);
}

/** Non-reactive read, for the rare caller outside a component. */
export function getRegisteredCompanyLogo(idOrName: string | null | undefined): string | undefined {
  if (!idOrName) return undefined;
  const { logos } = useCompanyLogoStore.getState();
  return logos[idOrName] ?? logos[idOrName.trim().toLowerCase()];
}
