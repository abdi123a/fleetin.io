/** Theme preference as chosen by the user. `system` follows the OS setting. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The theme actually applied to the document — `system` is always resolved first. */
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export interface ThemeState {
  /** The user's stored preference. */
  mode: ThemeMode;
  /** The concrete theme on the `<html>` element right now. */
  resolvedTheme: ResolvedTheme;
}

export interface ThemeActions {
  setMode: (mode: ThemeMode) => void;
  /** Cycles light -> dark -> light, resolving `system` first. */
  toggleTheme: () => void;
}

export type ThemeStore = ThemeState & ThemeActions;
