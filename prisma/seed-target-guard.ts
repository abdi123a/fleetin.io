/**
 * Refuse to seed anything that is not a local database.
 *
 * Every seed in this folder deletes before it writes, and `seed-volume.ts`'s
 * `reset()` empties five tables *unconditionally* — `drawdown`,
 * `creditFacility`, `expenseEntry`, `bankMovement` and `ledgerEntry` are
 * `deleteMany({})` with no `where`, so they go regardless of which shipper the
 * run is about. Against production that is not a reseed, it is the finance
 * ledger gone with no undo.
 *
 * Nothing about running a seed says out loud which database it is pointed at:
 * `DATABASE_URL` is read from `.env`, and a `.env` copied from the server for
 * one debugging session is all it takes. So the check lives here, at the top of
 * every seed, and it is on by default.
 *
 * To seed a remote database on purpose — restoring a staging box, say — set
 * both:
 *
 *     SEED_ALLOW_REMOTE=1 SEED_I_UNDERSTAND_THIS_DELETES_DATA=1 pnpm prisma:seed
 *
 * Two variables, deliberately: one is easy to leave exported in a shell.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/** Host of the configured database, or undefined when the URL is unparseable. */
export function databaseHost(url = process.env.DATABASE_URL): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function isLocalDatabase(url = process.env.DATABASE_URL): boolean {
  const host = databaseHost(url);
  return host !== undefined && LOCAL_HOSTS.has(host);
}

/**
 * Call first thing in every seed entry point. Exits non-zero rather than
 * throwing, so a stray `catch` in a seed cannot swallow it.
 */
export function assertSeedTargetIsSafe(scriptName: string): void {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error(`\n✖ ${scriptName}: DATABASE_URL is not set. Refusing to run.\n`);
    process.exit(1);
  }

  if (isLocalDatabase(url)) return;

  const host = databaseHost(url) ?? '<unparseable>';
  const acknowledged =
    process.env.SEED_ALLOW_REMOTE === '1' &&
    process.env.SEED_I_UNDERSTAND_THIS_DELETES_DATA === '1';

  if (acknowledged) {
    console.warn(
      `\n⚠  ${scriptName}: seeding the REMOTE database at "${host}" because both override\n` +
        `   variables are set. This deletes existing rows. Take a dump first.\n`,
    );
    return;
  }

  console.error(
    `\n✖ ${scriptName}: refusing to seed a non-local database.\n\n` +
      `  DATABASE_URL points at: ${host}\n\n` +
      `  Seeds delete before they write, and reset() empties the ledger, credit\n` +
      `  facilities, expenses and bank movements for every shipper — not just the\n` +
      `  one you are rebuilding.\n\n` +
      `  If this is genuinely what you want, back the database up and re-run with:\n` +
      `    SEED_ALLOW_REMOTE=1 SEED_I_UNDERSTAND_THIS_DELETES_DATA=1\n`,
  );
  process.exit(1);
}
