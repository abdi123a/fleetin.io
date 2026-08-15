/**
 * Every browser-storage key used by the application, in one place.
 *
 * Namespacing prevents collisions with anything else served from the same
 * origin, and the single registry makes a storage migration a one-file change.
 */
export const STORAGE_KEYS = {
  theme: 'fleetin.theme',
  sidebar: 'fleetin.sidebar',
  /** Workspace configuration — branding, documents, policy, integrations. */
  settings: 'fleetin.settings',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
