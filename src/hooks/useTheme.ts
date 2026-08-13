import { useThemeStore } from '@/stores/theme.store';
import type { ThemeMode, ResolvedTheme } from '@/types';

interface UseThemeResult {
  /** The user's stored preference, including `system`. */
  mode: ThemeMode;
  /** The theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

/**
 * Read/write access to the active theme.
 *
 * Thin wrapper over the theme store so components never import the store
 * directly — the persistence mechanism stays swappable.
 */
export function useTheme(): UseThemeResult {
  const mode = useThemeStore((state) => state.mode);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setMode = useThemeStore((state) => state.setMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return {
    mode,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setMode,
    toggleTheme,
  };
}
