#!/usr/bin/env bash
#
# Release the FLEETIN web app.
#
# The app is a static bundle, so this is an upload — no process to restart and
# no database to migrate. The two things that still bite:
#
#   1. VITE_API_BASE_URL IS BAKED IN AT BUILD TIME. Which backend the shipped
#      app talks to is decided here, by BUILD_MODE, not by anything on the
#      server. Building with the wrong mode ships an app pointed at localhost.
#   2. index.html MUST NOT BE CACHED while the hashed assets must be. The
#      upload order below writes assets first and index.html last, so a browser
#      can never fetch a new index that references assets not yet uploaded.
#
# Usage:
#   deploy/deploy.sh          # dry run
#   deploy/deploy.sh --yes    # actually release
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --yes) APPLY=true ;;
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

for required in SSH_HOST SSH_USER REMOTE_DIR; do
  [[ -n "${!required:-}" ]] || { echo "✖ $required is not set in deploy/deploy.env" >&2; exit 1; }
done

SSH_PORT="${SSH_PORT:-22}"
BUILD_MODE="${BUILD_MODE:-cloud}"

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
run() { if $APPLY; then eval "$@"; else printf '   \033[2m[dry-run]\033[0m %s\n' "$*"; fi; }

$APPLY || printf '\n\033[1;33m── DRY RUN ── nothing will be changed. Re-run with --yes.\033[0m\n'

say "1/4  Verify"
run "npm run typecheck"
run "npm run test"

say "2/4  Build (mode: ${BUILD_MODE})"
run "npx vite build --mode ${BUILD_MODE}"
if $APPLY; then
  api="$(grep -ho 'https\?://[^\"]*/api/v1' dist/assets/*.js 2>/dev/null | sort -u | head -1 || true)"
  printf '   bundle points at: \033[1m%s\033[0m\n' "${api:-<not found — check BUILD_MODE>}"
  case "$api" in
    *localhost*|*127.0.0.1*)
      echo "✖ built bundle points at localhost — wrong BUILD_MODE. Aborting." >&2; exit 1 ;;
  esac
fi

say "3/4  Upload — hashed assets first, index.html last"
run "rsync -az -e 'ssh -p $SSH_PORT' dist/assets/ ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/assets/"
run "rsync -az --exclude assets/ --exclude index.html -e 'ssh -p $SSH_PORT' dist/ ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"
run "rsync -az -e 'ssh -p $SSH_PORT' dist/index.html ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/index.html"
run "ssh -p $SSH_PORT ${SSH_USER}@${SSH_HOST} 'chown -R hammi-fleetin:hammi-fleetin ${REMOTE_DIR}'"

say "4/4  Verify"
if [[ -n "${HEALTH_URL:-}" ]]; then
  if $APPLY; then
    code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$HEALTH_URL" || true)"
    if [[ "$code" =~ ^(200|204)$ ]]; then
      printf '   \033[1;32m✓ %s → %s\033[0m\n' "$HEALTH_URL" "$code"
    else
      printf '   \033[1;31m✖ %s → %s\033[0m\n' "$HEALTH_URL" "$code"; exit 1
    fi
  else
    run "curl -s -o /dev/null -w '%{http_code}' $HEALTH_URL"
  fi
fi

$APPLY && printf '\n\033[1;32m✓ Released.\033[0m\n\n' || printf '\n\033[1;33mDry run complete — nothing changed.\033[0m\n\n'
