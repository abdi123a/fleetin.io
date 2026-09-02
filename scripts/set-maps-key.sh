#!/usr/bin/env bash
#
# Put the Google Maps key into .env, without it passing through a chat window,
# a command line, or shell history.
#
# WHY THIS EXISTS: the obvious instruction — "edit .env and paste your key" —
# has three ways to go wrong that all end with the same unhelpful symptom, an
# app that says Google is not configured. The placeholder gets written
# literally by a copy-pasted command; the key arrives wrapped in quotes it does
# not want; or it picks up a trailing space or newline. Each produces "API key
# not valid" from Google, which sends people to the Cloud console when the
# problem is in a text file on their own machine.
#
# So: prompt for it, validate the shape before writing, and never echo it.
#
#   pnpm set:maps-key
#
# The key is typed, never displayed, and never stored anywhere but .env.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env in $(pwd). Copy .env.example first." >&2
  exit 1
fi

if [[ -t 0 ]]; then
  # Interactive: prompt with the input hidden.
  printf 'Paste your Google Maps API key (input hidden), then press Enter:\n> '
  IFS= read -rs KEY
  printf '\n'
else
  # Piped. The intended form is `pbpaste | pnpm set:maps-key`, which works from
  # a non-interactive runner and keeps the key out of the command line
  # entirely — it goes clipboard → stdin → .env and is never an argument.
  IFS= read -r KEY || true
  if [[ -z "${KEY:-}" ]]; then
    echo "Nothing on stdin, and this is not an interactive terminal." >&2
    echo "" >&2
    echo "Two ways to set it:" >&2
    echo "  1. Copy the key, then run:  pbpaste | pnpm set:maps-key" >&2
    echo "  2. In a Terminal window:    pnpm set:maps-key" >&2
    exit 1
  fi
  # Only warn about history when the key was plainly typed into the command
  # itself; a clipboard pipe leaves nothing behind and does not deserve a
  # scary note every time.
  echo "Read from stdin."
fi

# Strip the three things that get pasted in by accident and break it silently:
# surrounding quotes, stray whitespace, and a carriage return from a Windows
# clipboard.
KEY="${KEY//[$'\t\r\n ']/}"
KEY="${KEY%\"}"; KEY="${KEY#\"}"
KEY="${KEY%\'}"; KEY="${KEY#\'}"

if [[ ! "$KEY" =~ ^AIza[A-Za-z0-9_-]{35}$ ]]; then
  echo "" >&2
  echo "That does not look like a Google Maps key (${#KEY} characters)." >&2
  echo "A Google API key is 'AIza' followed by 35 more characters — 39 in total." >&2
  echo "Nothing was written." >&2
  exit 1
fi

# Rewrite in place via a temp file rather than 'sed -i', whose syntax differs
# between macOS and Linux and whose in-place edit would put the key on the
# command line on some shells.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

if grep -q '^GOOGLE_MAPS_API_KEY=' "$ENV_FILE"; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == GOOGLE_MAPS_API_KEY=* ]]; then
      printf 'GOOGLE_MAPS_API_KEY=%s\n' "$KEY" >> "$TMP"
    else
      printf '%s\n' "$line" >> "$TMP"
    fi
  done < "$ENV_FILE"
else
  cat "$ENV_FILE" > "$TMP"
  printf '\nGOOGLE_MAPS_API_KEY=%s\n' "$KEY" >> "$TMP"
fi

cat "$TMP" > "$ENV_FILE"

echo "✓ Written to .env (${#KEY} characters). The key was not displayed or logged."
echo ""
echo "Checking it against both Google APIs..."
echo ""
exec npx ts-node scripts/check-google-maps.ts
