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
 * `src/features/empty-returns` is included for its matching engine, on the same
 * terms: `matching.ts` decides which empty container can be welded to which
 * full load, it is pure TypeScript, and its rules are the kind that get
 * loosened in a hurry — the shipping-line gate was dropped on 2026-08-27 and
 * the location gate had to be rewritten in the same pass, because comparing a
 * warehouse name to a port name is a rule that rejects everything.
 *
 * `src/features/bookings` is included for one thing only: the rule that folds a
 * status write into the query cache. It has no DOM either — a `QueryClient` is
 * plain TypeScript — and it earns a test because the bug it fixes is invisible
 * to inspection. Writing "Empty Returned" walks three rungs, one request each,
 * and the reads those used to trigger raced the writes; the card settled on
 * whichever answer came home last and only a reload showed the truth. Ordering
 * bugs do not stay fixed on their own.
 *
 * `src/lib/rating` falls under the same `src/lib/**` glob and belongs there for
 * the same reason: it is the arithmetic behind a star printed next to a real
 * person's name, it is pure TypeScript over booking records, and every one of
 * its rules ("an open mission is not a failure", "a box already past its
 * deadline counts against professionalism") is the kind that is easy to get
 * subtly wrong and impossible to spot by reading the screen.
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
      'src/features/empty-returns/**/*.test.ts',
      'src/features/transporters/**/*.test.ts',
      'src/features/bookings/**/*.test.ts',
    ],
    environment: 'node',
  },
});
