import { useLayoutEffect, useMemo, useState } from 'react';

import { useTheme } from '@/hooks';

/**
 * Resolves CSS custom properties to their computed values.
 *
 * The documentation must never restate token values by hand — a hardcoded
 * "#4F8A94" in a swatch caption is a second source of truth that silently rots
 * the first time the palette moves. Reading `getComputedStyle` instead means
 * the page reports whatever the stylesheet actually produces, and re-reports it
 * when the theme changes (dark mode resolves the same role to a different
 * colour).
 *
 * @param tokens CSS custom property names, including the leading `--`.
 */
export function useTokenValues(tokens: readonly string[]): Record<string, string> {
  const { resolvedTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  // Callers pass array literals, so identity changes every render; the joined
  // key is what actually determines whether a re-read is needed.
  const tokenKey = useMemo(() => tokens.join('|'), [tokens]);

  useLayoutEffect(() => {
    const computed = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};

    for (const token of tokenKey.split('|')) {
      if (token) next[token] = computed.getPropertyValue(token).trim();
    }

    setValues(next);
    // `resolvedTheme` is the signal that the same tokens now resolve differently.
  }, [tokenKey, resolvedTheme]);

  return values;
}

/** Single-token convenience wrapper. */
export function useTokenValue(token: string): string {
  const values = useTokenValues(useMemo(() => [token], [token]));
  return values[token] ?? '';
}
