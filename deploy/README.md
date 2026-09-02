# Releasing FLEETIN

Two artifacts, released independently:

| what | script | effect |
|---|---|---|
| API (NestJS) | `fleetin-backend/deploy/deploy.sh` | uploads `dist/`, applies migrations, restarts the process |
| Web app (Vite) | `fleetin design system/deploy/deploy.sh` | uploads a static bundle |

Both are **dry-run by default**. They print every command and change nothing
until you pass `--yes`.

## First time

1. `cp deploy/deploy.env.example deploy/deploy.env` in each repo and fill it in.
   `deploy.env` is gitignored — it names a host and a path, never a password.
2. Make sure your SSH key reaches the server as the **CloudPanel site user**,
   not root: `ssh <user>@srv1141721.hstgr.cloud`.
3. The server keeps its own `.env`. It is never uploaded and never overwritten
   — `DATABASE_URL`, `JWT_SECRET` and the storage block live only there.

## Every release

```bash
cd fleetin-backend
deploy/deploy.sh            # read what it intends to do
deploy/deploy.sh --yes      # do it
```

The API script, in order: typecheck → build → **dump the live database** →
upload `dist/`, `package.json`, `pnpm-lock.yaml`, `prisma/` → `pnpm install
--prod --frozen-lockfile` → `prisma generate` → `prisma migrate deploy` →
restart → health check. A failed health check exits non-zero and prints the
restore command.

## What these scripts will not do

- **They never seed.** Seeds delete before they write, and `seed-volume.ts`'s
  `reset()` empties `ledgerEntry`, `creditFacility`, `drawdown`, `expenseEntry`
  and `bankMovement` with no `where` clause — every shipper, not just the one
  being rebuilt. Production data is not reproducible from a seed.
- **They never run `prisma migrate dev`**, which can drop and recreate the
  database. Only `migrate deploy`, which applies committed migrations forward.
- **They never `rsync --delete` the whole remote directory.** `uploads/`,
  `.env` and `node_modules/` live alongside `dist/`.

The seeds defend themselves too: `prisma/seed-target-guard.ts` aborts any seed
whose `DATABASE_URL` is not localhost, unless `SEED_ALLOW_REMOTE=1` and
`SEED_I_UNDERSTAND_THIS_DELETES_DATA=1` are both set.

## Google Maps: after the release that adds it

The `locations` release needs one environment variable and one command, and the
deploy script does neither — it never touches `.env` and never runs a script.

1. On the server, add to `.env`:

   ```
   GOOGLE_MAPS_API_KEY=…
   ```

   Enable **Places API (New)** and **Routes API** on the Google Cloud project,
   with billing on. Restrict the key by **server IP** — never by HTTP referrer.
   The key is read server-side only; the browser never sees it, so a referrer
   restriction would reject every call this app makes. Restart the API.

2. Measure the corridor once, so nobody waits on Google while filling a form:

   ```
   curl -X POST https://<api>/api/v1/locations/distances/build \
     -H "Authorization: Bearer <admin token>"
   ```

   Or press **Measure Distances** on the Locations page. A corridor of ~16
   places is a few hundred pairs, measured once and cached forever.

3. Replace the guessed distances on existing shipments:

   ```
   npx ts-node scripts/backfill-shipment-distances.ts          # report
   npx ts-node scripts/backfill-shipment-distances.ts --write  # apply
   ```

   It refuses to write anything but a real Google road measurement, so running
   it before step 1 is a harmless no-op.

The catalogue rows themselves need no action — `20260902190200_locations_corridor_rows`
carries them, because the deploy never seeds and `seed-locations.ts` refuses any
non-local database. Without that migration the release would ship a Locations
page with nothing in it.

## Rolling back

- **Code**: re-run the previous build and `deploy.sh --yes --skip-migrate`.
- **Database**: every release dumps first, to `~/fleetin-backups/fleetin-<stamp>.sql.gz`
  on the server (last 10 kept). Restore with
  `gunzip < ~/fleetin-backups/fleetin-<stamp>.sql.gz | mysql <db>`.
- Prisma migrations have no down-step. The dump *is* the rollback.

## Web app: the one thing to get right

`VITE_API_BASE_URL` is inlined at **build** time, so `BUILD_MODE` in
`deploy.env` decides which backend the shipped app talks to — nothing on the
server can change it afterwards. The script greps the built bundle and refuses
to upload one pointing at `localhost`.

## Known gap

The live API is an **older build** than local: `POST /auth/login` returns no
`shipperId`, the SHIPPER role lacks `bookings.view` and `empty-returns.view`,
and `/bi/shipper/:id/dataset` 404s. The shipper Analytics page and the
reporting system therefore only work against localhost until the API is
released. That is what the first run of this script is for.
