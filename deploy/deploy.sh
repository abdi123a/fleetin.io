#!/usr/bin/env bash
#
# Release the FLEETIN backend to the live server.
#
# Design rules, each one from something that has already gone wrong here:
#
#   1. DRY RUN BY DEFAULT. Nothing leaves this machine without `--yes`. A
#      deploy script whose default action is "deploy" gets run by accident.
#   2. NEVER SEEDS. Seeds delete before they write and empty the ledger,
#      credit facilities, expenses and bank movements for every shipper. This
#      script runs `prisma migrate deploy` and nothing else; the seeds also
#      refuse remote databases on their own (prisma/seed-target-guard.ts).
#   3. DUMPS THE DATABASE BEFORE MIGRATING, and prints the exact restore
#      command. Migrations are not reversible in Prisma.
#   4. BUILDS AND TYPECHECKS LOCALLY FIRST. A build that fails on the server
#      fails halfway through a release, with the old process already stopped.
#   5. VERIFIES AFTER RESTART. A deploy that is not health-checked is a deploy
#      you find out about from a user.
#
# Usage:
#   deploy/deploy.sh              # dry run — prints every step, changes nothing
#   deploy/deploy.sh --yes        # actually release
#   deploy/deploy.sh --yes --skip-migrate
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APPLY=false
SKIP_MIGRATE=false
for arg in "$@"; do
  case "$arg" in
    --yes) APPLY=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

CONFIG="$ROOT/deploy/deploy.env"
if [[ ! -f "$CONFIG" ]]; then
  echo "✖ $CONFIG not found. Copy deploy/deploy.env.example and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CONFIG"

for required in SSH_HOST SSH_USER REMOTE_DIR RESTART_CMD; do
  if [[ -z "${!required:-}" ]]; then
    echo "✖ $required is not set in deploy/deploy.env" >&2
    exit 1
  fi
done

SSH_PORT="${SSH_PORT:-22}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-~/fleetin-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SSH="ssh -p $SSH_PORT ${SSH_USER}@${SSH_HOST}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
run()  {
  if $APPLY; then eval "$@"; else printf '   \033[2m[dry-run]\033[0m %s\n' "$*"; fi
}

if ! $APPLY; then
  printf '\n\033[1;33m── DRY RUN ── nothing will be changed. Re-run with --yes to release.\033[0m\n'
fi

say "1/6  Typecheck and build locally"
run "pnpm run typecheck"
run "pnpm run build"
if $APPLY && [[ ! -d "$ROOT/dist" ]]; then
  echo "✖ build produced no dist/ — aborting before touching the server." >&2
  exit 1
fi

say "2/6  Back up the live database"
# mysqldump reads credentials from the server's own .env, so they never travel
# through this script or this machine's shell history.
run "$SSH 'set -a; . ${REMOTE_DIR}/.env; set +a; \
  mkdir -p ${REMOTE_BACKUP_DIR}; \
  mysqldump --single-transaction --quick --routines \
    \"\$(node -e \"const u=new URL(process.env.DATABASE_URL);console.log(\\\"-h\\\"+u.hostname+\\\" -P\\\"+(u.port||3306)+\\\" -u\\\"+u.username+(u.password?\\\" -p\\\"+decodeURIComponent(u.password):\\\"\\\")+\\\" \\\"+u.pathname.slice(1))\")\" \
    | gzip > ${REMOTE_BACKUP_DIR}/fleetin-${STAMP}.sql.gz'"
run "$SSH 'ls -1t ${REMOTE_BACKUP_DIR}/fleetin-*.sql.gz | tail -n +$((KEEP_BACKUPS+1)) | xargs -r rm --'"
printf '   restore with: \033[2mgunzip < %s/fleetin-%s.sql.gz | mysql <db>\033[0m\n' "$REMOTE_BACKUP_DIR" "$STAMP"

say "3/6  Upload build, dependencies manifest and migrations"
# --delete inside dist/ only. Never the whole REMOTE_DIR: uploads/, .env and
# node_modules live there too.
run "rsync -az --delete -e 'ssh -p $SSH_PORT' dist/ ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/dist/"
run "rsync -az -e 'ssh -p $SSH_PORT' package.json pnpm-lock.yaml pnpm-workspace.yaml ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"
run "rsync -az --delete -e 'ssh -p $SSH_PORT' prisma/migrations/ ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/prisma/migrations/"
run "rsync -az -e 'ssh -p $SSH_PORT' prisma/schema.prisma ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/prisma/"

say "4/6  Install production dependencies and regenerate the Prisma client"
run "$SSH 'cd ${REMOTE_DIR} && pnpm install --frozen-lockfile && pnpm exec prisma generate'"

if $SKIP_MIGRATE; then
  say "5/6  Migrations SKIPPED (--skip-migrate)"
else
  say "5/6  Apply migrations"
  # `migrate deploy` only applies committed migrations. Never `migrate dev`
  # (which can reset) and never `db seed`.
  run "$SSH 'cd ${REMOTE_DIR} && pnpm exec prisma migrate deploy'"
fi

say "6/6  Restart and verify"
run "$SSH '${RESTART_CMD}'"
if [[ -n "${HEALTH_URL:-}" ]]; then
  if $APPLY; then
    # Poll, don't guess. A single probe after a fixed five seconds called a
    # perfectly good release dead on 2026-09-03: the API had grown two modules
    # and took a beat longer to bind, so the check hit nginx before the app was
    # listening, printed 502 and told the operator to restore a database dump
    # over a release that had in fact applied cleanly. A health check that
    # cries wolf is worse than none, because the remedy it advises is
    # destructive.
    code=""
    for attempt in $(seq 1 20); do
      code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$HEALTH_URL" || true)"
      [[ "$code" =~ ^(200|204|401)$ ]] && break
      printf '   \033[2mwaiting for the API (%s) — attempt %s/20\033[0m\r' "${code:-no answer}" "$attempt"
      sleep 3
    done
    printf '\033[K'
    if [[ "$code" =~ ^(200|204|401)$ ]]; then
      printf '   \033[1;32m✓ %s → %s\033[0m\n' "$HEALTH_URL" "$code"
    else
      printf '   \033[1;31m✖ %s → %s — the API is not answering. Roll back:\033[0m\n' "$HEALTH_URL" "$code"
      printf '     gunzip < %s/fleetin-%s.sql.gz | mysql <db>   # if migrations ran\n' "$REMOTE_BACKUP_DIR" "$STAMP"
      exit 1
    fi
  else
    run "curl -s -o /dev/null -w '%{http_code}' $HEALTH_URL"
  fi
fi

if $APPLY; then
  printf '\n\033[1;32m✓ Released.\033[0m Backup: %s/fleetin-%s.sql.gz\n\n' "$REMOTE_BACKUP_DIR" "$STAMP"
else
  printf '\n\033[1;33mDry run complete — nothing changed. Re-run with --yes.\033[0m\n\n'
fi
