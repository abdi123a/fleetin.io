import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/storage';
import { DEFAULT_SETTINGS } from '@/features/settings/model/defaults';
import type { SettingsSection, SystemSettings } from '@/features/settings/model/types';

/**
 * Workspace configuration.
 *
 * Persisted in the browser rather than on the server, because most of what it
 * holds has no endpoint yet: there is one settings row in the backend and it
 * carries a single float. The shape here is the shape the API should grow into,
 * so the migration is `fetch` replacing `localStorage` and nothing above this
 * file changing.
 *
 * Two consequences worth being explicit about while that is true:
 *
 *  - Settings are per-browser. Two operators on two machines can disagree, and
 *    a cleared cache is a reset. The UI says so.
 *  - `integrations.*.apiKey` is readable by anything running on the page. The
 *    field exists so the app is configurable end to end today; it is not where
 *    a production key belongs.
 *
 * Rehydration deep-merges over `DEFAULT_SETTINGS`, so a build that adds a
 * setting does not blank it out for anyone who already has a stored blob.
 */

/** Recursive partial — a patch may touch one leaf of one section. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown> ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges `patch` over `base`, recursing into objects and replacing arrays
 * wholesale. Arrays here are always sets of choices (`signatureBlocks.invoice`,
 * `allowedEmailDomains`) — merging them index-by-index would make removing an
 * entry impossible.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (!isPlainObject(base)) return patch as T;

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (base as Record<string, unknown>)[key];
    out[key] = isPlainObject(value) && isPlainObject(current) ? deepMerge(current, value) : value;
  }
  return out as T;
}

interface SettingsState {
  settings: SystemSettings;
  /** Bumped on every write — a cheap way for effects to react to any change. */
  revision: number;

  /** Merge a patch into one section. */
  update: <S extends SettingsSection>(section: S, patch: DeepPartial<SystemSettings[S]>) => void;
  /** Replace one section outright. Used by the JSON import. */
  replaceSection: <S extends SettingsSection>(section: S, value: SystemSettings[S]) => void;
  /** Back to shipped defaults, one section or everything. */
  reset: (section?: SettingsSection) => void;
  /** Merge a whole settings blob — the import path. Unknown keys are ignored. */
  importAll: (blob: DeepPartial<SystemSettings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      revision: 0,

      update: (section, patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            [section]: deepMerge(state.settings[section], patch),
          },
          revision: state.revision + 1,
        })),

      replaceSection: (section, value) =>
        set((state) => ({
          settings: { ...state.settings, [section]: value },
          revision: state.revision + 1,
        })),

      reset: (section) =>
        set((state) => ({
          settings: section
            ? { ...state.settings, [section]: DEFAULT_SETTINGS[section] }
            : DEFAULT_SETTINGS,
          revision: state.revision + 1,
        })),

      importAll: (blob) =>
        set((state) => ({
          settings: deepMerge(state.settings, blob),
          revision: state.revision + 1,
        })),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: 1,
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const stored = (persisted as { settings?: unknown } | undefined)?.settings;
        return { ...current, settings: deepMerge(DEFAULT_SETTINGS, stored) };
      },
    },
  ),
);

/**
 * Read settings outside React — formatters, mappers, service functions.
 *
 * Anything called during render should use the `useSystemSettings` hook
 * instead, so the component re-renders when a value changes.
 */
export function getSettings(): SystemSettings {
  return useSettingsStore.getState().settings;
}
