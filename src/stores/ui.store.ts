import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/storage';

/**
 * Application shell UI state.
 *
 * Deliberately separate from the theme store: this is ephemeral chrome state
 * (what is open, what is collapsed) with no styling responsibility.
 *
 * The desktop rail and the mobile drawer are tracked independently — collapsing
 * the rail on a wide screen must not leave a drawer open behind it.
 */

interface UiState {
  /** Desktop: sidebar reduced to an icon rail. Persisted. */
  isSidebarCollapsed: boolean;
  /** Mobile/tablet: sidebar shown as an overlay drawer. Never persisted. */
  isMobileNavOpen: boolean;
  /** Nav group ids currently expanded in the sidebar. Persisted. */
  expandedNavGroups: string[];
}

interface UiActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
  toggleNavGroup: (groupId: string) => void;
  setNavGroupExpanded: (groupId: string, expanded: boolean) => void;
}

export type UiStore = UiState & UiActions;

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isMobileNavOpen: false,
      expandedNavGroups: ['shipments-group', 'empty-return', 'partners-group'],

      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

      openMobileNav: () => set({ isMobileNavOpen: true }),
      closeMobileNav: () => set({ isMobileNavOpen: false }),
      toggleMobileNav: () => set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),

      toggleNavGroup: (groupId) =>
        set((state) => ({
          expandedNavGroups: state.expandedNavGroups.includes(groupId)
            ? state.expandedNavGroups.filter((id) => id !== groupId)
            : [...state.expandedNavGroups, groupId],
        })),

      setNavGroupExpanded: (groupId, expanded) =>
        set((state) => {
          const isExpanded = state.expandedNavGroups.includes(groupId);
          if (isExpanded === expanded) return state;

          return {
            expandedNavGroups: expanded
              ? [...state.expandedNavGroups, groupId]
              : state.expandedNavGroups.filter((id) => id !== groupId),
          };
        }),
    }),
    {
      name: STORAGE_KEYS.sidebar,
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        expandedNavGroups: state.expandedNavGroups,
      }),
    },
  ),
);
