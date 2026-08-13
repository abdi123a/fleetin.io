/**
 * TypeScript mirror of the CSS design tokens.
 *
 * CSS is the source of truth. This module exists for the contexts that cannot
 * read a Tailwind class — Recharts series colours, Framer Motion transitions,
 * canvas/PDF rendering — and deliberately stores `var(--token)` references
 * rather than literals so a theme swap still flows through at runtime.
 *
 * Rule: if you can express it as a Tailwind class, do that instead of importing
 * from here.
 */

/* ---------------------------------------------------------------------------
 * Semantic colours
 * ------------------------------------------------------------------------ */

export const colorTokens = {
  background: 'var(--background)',
  foreground: 'var(--foreground)',
  surface: 'var(--surface)',
  surfaceRaised: 'var(--surface-raised)',
  surfaceSunken: 'var(--surface-sunken)',
  primary: 'var(--primary)',
  primaryForeground: 'var(--primary-foreground)',
  primarySubtle: 'var(--primary-subtle)',
  secondary: 'var(--secondary)',
  secondaryForeground: 'var(--secondary-foreground)',
  accent: 'var(--accent)',
  accentForeground: 'var(--accent-foreground)',
  muted: 'var(--muted)',
  mutedForeground: 'var(--muted-foreground)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  border: 'var(--border)',
  ring: 'var(--ring)',
} as const;

/**
 * Categorical series palette — encodes *identity* (which series).
 *
 * Assign in order and never cycle: series one always takes slot one, so the
 * same position means the same colour across every report and a filter that
 * removes a series never repaints the survivors. Past seven categories, fold
 * the tail into `chartOtherToken` rather than inventing an eighth hue.
 *
 * Validated in both modes (lightness band, chroma floor, adjacent CVD
 * separation, 3:1 contrast). Re-order or re-step only with the validator.
 */
export const chartTokens = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
] as const;

/** The "everything else" bucket. Never a series in its own right. */
export const chartOtherToken = 'var(--chart-other)';

/**
 * Ordinal ramp — one hue, light to dark, for values with an inherent order
 * (pipeline stages, tiers, buckets). Use this, not `chartTokens`, whenever
 * re-ordering the categories would change the meaning.
 */
export const chartStepTokens = [
  'var(--chart-step-1)',
  'var(--chart-step-2)',
  'var(--chart-step-3)',
  'var(--chart-step-4)',
  'var(--chart-step-5)',
] as const;

/**
 * Status colours — reserved meaning, never reused as "series N".
 *
 * The collision rule: a series that *means* good or bad (on-time vs late,
 * returned vs overdue) wears these; a series that is merely identity wears
 * `chartTokens`. Never both in one chart. Always ship with an icon or label —
 * warning sits below 3:1 on a light surface by design.
 */
export const chartStatusTokens = {
  good: 'var(--success)',
  warning: 'var(--warning)',
  critical: 'var(--destructive)',
  neutral: 'var(--muted-foreground)',
} as const;

/** Urgency scale — triage lists. Prefer Tailwind `bg-urgency-*` in components. */
export const urgencyTokens = {
  overdue: {
    bg: 'var(--urgency-overdue-bg)',
    fg: 'var(--urgency-overdue-fg)',
    border: 'var(--urgency-overdue-border)',
    solid: 'var(--urgency-overdue-solid)',
  },
  atRisk: {
    bg: 'var(--urgency-at-risk-bg)',
    fg: 'var(--urgency-at-risk-fg)',
    border: 'var(--urgency-at-risk-border)',
    solid: 'var(--urgency-at-risk-solid)',
  },
  critical: {
    bg: 'var(--urgency-critical-bg)',
    fg: 'var(--urgency-critical-fg)',
    border: 'var(--urgency-critical-border)',
    solid: 'var(--urgency-critical-solid)',
  },
  watch: {
    bg: 'var(--urgency-watch-bg)',
    fg: 'var(--urgency-watch-fg)',
    border: 'var(--urgency-watch-border)',
    solid: 'var(--urgency-watch-solid)',
  },
  safe: {
    bg: 'var(--urgency-safe-bg)',
    fg: 'var(--urgency-safe-fg)',
    border: 'var(--urgency-safe-border)',
    solid: 'var(--urgency-safe-solid)',
  },
  protected: {
    bg: 'var(--urgency-protected-bg)',
    fg: 'var(--urgency-protected-fg)',
    border: 'var(--urgency-protected-border)',
    solid: 'var(--urgency-protected-solid)',
  },
} as const;

/** Recessive chart furniture — grid lines, axes, reference lines. */
export const chartAxisTokens = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
} as const;

/* ---------------------------------------------------------------------------
 * Scale tokens
 * ------------------------------------------------------------------------ */

export const radiusTokens = {
  none: 'var(--fl-radius-none)',
  xs: 'var(--fl-radius-xs)',
  sm: 'var(--fl-radius-sm)',
  md: 'var(--fl-radius-md)',
  lg: 'var(--fl-radius-lg)',
  xl: 'var(--fl-radius-xl)',
  '2xl': 'var(--fl-radius-2xl)',
  full: 'var(--fl-radius-full)',
} as const;

export const shadowTokens = {
  none: 'var(--fl-shadow-none)',
  xs: 'var(--elevation-xs)',
  sm: 'var(--elevation-sm)',
  md: 'var(--elevation-md)',
  lg: 'var(--elevation-lg)',
  xl: 'var(--elevation-xl)',
} as const;

export const zIndexTokens = {
  hide: -1,
  base: 0,
  raised: 10,
  sticky: 100,
  sidebar: 200,
  header: 300,
  overlay: 400,
  drawer: 500,
  modal: 600,
  popover: 700,
  toast: 800,
  tooltip: 900,
  max: 9999,
} as const;

/* ---------------------------------------------------------------------------
 * Motion — numeric so Framer Motion can consume them directly (seconds).
 * ------------------------------------------------------------------------ */

export const durationTokens = {
  instant: 0.075,
  fast: 0.12,
  normal: 0.2,
  slow: 0.32,
  slower: 0.48,
} as const;

export const easingTokens = {
  linear: [0, 0, 1, 1],
  in: [0.4, 0, 1, 1],
  out: [0, 0, 0.2, 1],
  inOut: [0.4, 0, 0.2, 1],
  emphasized: [0.2, 0, 0, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;

/** Ready-made Framer Motion transitions built from the motion tokens. */
export const transitionTokens = {
  fast: { duration: durationTokens.fast, ease: easingTokens.out },
  normal: { duration: durationTokens.normal, ease: easingTokens.emphasized },
  slow: { duration: durationTokens.slow, ease: easingTokens.emphasized },
} as const;

/* ---------------------------------------------------------------------------
 * Layout metrics
 * ------------------------------------------------------------------------ */

export const layoutTokens = {
  sidebarWidth: 'var(--fl-sidebar-width)',
  sidebarWidthCollapsed: 'var(--fl-sidebar-width-collapsed)',
  headerHeight: 'var(--fl-header-height)',
  contentMaxWidth: 'var(--fl-content-max-width)',
} as const;

/** Breakpoints, kept in sync with Tailwind's defaults. Used by `useMediaQuery`. */
export const breakpointTokens = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

export type ColorToken = keyof typeof colorTokens;
export type RadiusToken = keyof typeof radiusTokens;
export type ShadowToken = keyof typeof shadowTokens;
export type ZIndexToken = keyof typeof zIndexTokens;
export type DurationToken = keyof typeof durationTokens;
export type EasingToken = keyof typeof easingTokens;
export type Breakpoint = keyof typeof breakpointTokens;

export const tokens = {
  color: colorTokens,
  chart: chartTokens,
  chartOther: chartOtherToken,
  chartStep: chartStepTokens,
  chartStatus: chartStatusTokens,
  chartAxis: chartAxisTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  zIndex: zIndexTokens,
  duration: durationTokens,
  easing: easingTokens,
  transition: transitionTokens,
  layout: layoutTokens,
  breakpoint: breakpointTokens,
} as const;
