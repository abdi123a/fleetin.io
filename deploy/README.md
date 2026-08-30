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
