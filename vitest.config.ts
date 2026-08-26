import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Test config, kept separate from `vite.config.ts` on purpose.
 *
 * Vitest ships its own pinned copy of Vite, which is a major version behind the
 * one the app builds with. Merging the two configs makes `tsc` resolve two
 * incompatible `Plugin` types for the same plugin array; keeping them apart
 * means neither has an opinion about the other. Nothing is duplicated except
 * the path alias, because the suite is deliberately narrow:
 *
 * `src/lib/bi` is pure TypeScript with no DOM and no React. It is also the code
 * `fleetin-backend` will inherit when the BI endpoints are built, so it is the
 * part that has to be pinned by tests rather than by inspection. Component
 * tests would need jsdom and a different setup, and are not configured here.
 *
 * `src/stores` is included too, for the same reason `src/lib/bi` is: Zustand
 * stores are plain TypeScript state machines with no DOM dependency (the one
 * exception, `persist`'s use of `localStorage`, is satisfied by Node's own
 * global `localStorage` — no jsdom needed). Security-critical store logic
 * (auth's demo-mode gating) belongs under test same as business logic does.
 *
 * `src/components/reports` is included for its arithmetic, not its components:
 * `missionReport.ts` and `monthlyReport.ts` are the definitions the shipper's
 * mission and monthly reports are made of ("what is pickup waiting time a
 * subtraction of", "how many detention days is a 40-hour overrun"), and they
 * are pure TypeScript for exactly that reason. The `*View` components in the
 * same folder are not tested here — that would need jsdom, which stays
 * unconfigured.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: [
      'src/lib/**/*.test.ts',
      'src/stores/**/*.test.ts',
      'src/components/reports/**/*.test.ts',
    ],
    environment: 'node',
  },
});
