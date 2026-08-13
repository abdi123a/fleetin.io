/**
 * Application-level constants and environment configuration.
 *
 * Reading `import.meta.env` anywhere else is discouraged — funnel it through
 * here so every environment dependency is visible in one file.
 */
export const APP_CONFIG = {
  name: 'FLEETIN',
  shortName: 'FLEETIN',
  description: 'Internal Management System',
  /** Appended to every page title: "Dashboard · FLEETIN". */
  titleSeparator: '·',
  version: '0.1.0',
} as const;

export const ENV = {
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  mode: import.meta.env.MODE,

  /**
   * Gates the demo-login fallback (`auth.store.ts`) and the "Try a demo
   * account" picker on the login page.
   *
   * Two independent conditions, both required:
   *  1. `import.meta.env.DEV` — a compile-time constant Vite inlines and
   *     dead-code-eliminates. A production build (`vite build --mode
   *     production`) cannot ship the demo branch at all, regardless of what
   *     env vars happen to be set on the machine that built it — this is a
   *     bundler guarantee, not a runtime toggle.
   *  2. `VITE_ENABLE_DEMO_AUTH === 'true'` — an explicit opt-in for local
   *     development. Demo mode is off by default even in dev, so `npm run
   *     dev` without this var reproduces production auth behaviour: a
   *     backend outage or bad credentials is a login error, never a silent
   *     grant of access.
   *
   * See README.md "Environment" for how to enable it.
   */
  isDemoModeEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_AUTH === 'true',
} as const;
