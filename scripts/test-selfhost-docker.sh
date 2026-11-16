#!/bin/sh
# Check a committed checkout on a Docker host with disposable projects and no provider keys.
set -eu
umask 077
root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
source_project="openseo-smoke-$(basename "$tmp" | tr '[:upper:].' '[:lower:]-')"
restore_project="${source_project}-restore"
mkdir "$tmp/app"
git -C "$root" archive HEAD | tar -x -C "$tmp/app"
cd "$tmp/app"
unset COMPOSE_FILE COMPOSE_ENV_FILES COMPOSE_PROFILES
export COMPOSE_PROJECT_NAME="$source_project" WRANGLER_SEND_METRICS=false
# The disposable checkout contains no operator env file. Never inherit integrations.
unset DATAFORSEO_API_KEY OPENROUTER_API_KEY OPENROUTER_MODEL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET BETTER_AUTH_SECRET ALLOWED_HOST OPENSEO_TELEMETRY_ENABLED
export OPENSEO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 PORT=3001
cleanup() {
  for project in "$source_project" "$restore_project"; do
    docker compose -p "$project" down -v --rmi local || true
  done
  cd /
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
mkdir -p src/.smoke-context
printf '%s\n' 'WRANGLER_SEND_METRICS=false' > .env
touch .dev.vars src/.smoke-context/.dev.vars.test src/.smoke-context/.env.private
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec -T open-seo sh -ec '
  test ! -e /app/.dev.vars
  test ! -e /app/src/.smoke-context/.dev.vars.test
  test ! -e /app/src/.smoke-context/.env.private
  node scripts/selfhost-health.mjs
'
# Use the real browser against this container. Opening the invented example
# writes native Maps rows that will be checked again after restoration.
(cd "$root" && OPENSEO_DOCKER_BROWSER=1 pnpm exec playwright test e2e/search-workbench.spec.ts --grep 'failed, excluded and unobserved points')
curl -fsS http://127.0.0.1:3001/licenses/leaflet.txt > "$tmp/leaflet.txt"
cmp public/licenses/leaflet.txt "$tmp/leaflet.txt"
docker compose stop open-seo
sql() {
  docker compose run --rm -T --no-deps --entrypoint pnpm open-seo exec wrangler d1 execute DB --local --json --command "$1"
}
query="SELECT id, name FROM maps_campaigns ORDER BY id"
sql "$query" > "$tmp/before.json"
sh scripts/selfhost-state.sh backup "$tmp/state.tar.gz"
export COMPOSE_PROJECT_NAME="$restore_project"
docker compose build
sh scripts/selfhost-state.sh restore "$tmp/state.tar.gz"
if sh scripts/selfhost-state.sh restore "$tmp/state.tar.gz"; then
  echo 'Restore unexpectedly accepted a populated volume.' >&2
  exit 1
fi
docker compose up -d --wait
sql "$query" > "$tmp/after.json"
node --input-type=module - "$tmp/before.json" "$tmp/after.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const rows = path => JSON.parse(readFileSync(path, 'utf8')).flatMap(entry => entry.results);
const saved = rows(process.argv[2]);
assert.equal(saved.length, 1);
assert.ok(saved[0].id && saved[0].name);
assert.deepEqual(rows(process.argv[3]), saved);
JS
echo 'Source-built app, health, Maps route, private-file exclusions and cold state recovery passed.'
