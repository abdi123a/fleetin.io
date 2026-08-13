import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/storage';
import type { ResolvedTheme, ThemeMode, ThemeStore } from '@/types';

/**
 * Theme store.
 *
 * Owns the user's preference and keeps the `<html>` class in sync. The DOM is
 * updated from inside the store (rather than from a `useEffect` in a provider)
 * so the class can never drift out of step with the persisted value.
 */

const DARK_CLASS = 'dark';
const LIGHT_CLASS = 'light';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

/**
 * Writes the resolved theme onto `<html>`, suppressing transitions for a frame
 * so the swap reads as instant rather than as a slow colour crossfade.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  root.classList.add('fl-theme-transition-suppressed');
  root.classList.remove(DARK_CLASS, LIGHT_CLASS);
  root.classList.add(resolved === 'dark' ? DARK_CLASS : LIGHT_CLASS);
  root.style.colorScheme = resolved;

  window.requestAnimationFrame(() => {
    root.classList.remove('fl-theme-transition-suppressed');
  });
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolvedTheme: resolveTheme('system'),

      setMode: (mode) => {
        const resolvedTheme = resolveTheme(mode);
        applyTheme(resolvedTheme);
        set({ mode, resolvedTheme });
      },

      toggleTheme: () => {
        get().setMode(get().resolvedTheme === 'dark' ? 'light' : 'dark');
      },
    }),
    {
      name: STORAGE_KEYS.theme,
      // Only the preference is persisted; `resolvedTheme` is derived on boot so
      // a stored `system` still follows an OS change made while away.
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolvedTheme = resolveTheme(state.mode);
        applyTheme(resolvedTheme);
        state.resolvedTheme = resolvedTheme;
      },
    },
  ),
);

/**
 * Keeps `mode: 'system'` reactive to OS changes.
 * Returns an unsubscribe function.
 */
export function subscribeToSystemTheme(): () => void {
  if (typeof window === 'undefined') return () => {};

  const query = window.matchMedia('(prefers-color-scheme: dark)');

  const handleChange = () => {
    const { mode, setMode } = useThemeStore.getState();
    if (mode === 'system') setMode('system');
  };

  query.addEventListener('change', handleChange);
  return () => query.removeEventListener('change', handleChange);
}
