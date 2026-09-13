#!/usr/bin/env bash
# M18: repeatable fresh-database migration verification.
# Rebuilds PostgreSQL from 0001 -> latest with zero manual edits and
# runs the pgTAP battery. Requires: docker, built pgtap image OR
# network access to build it (see Dockerfile.pgtap).
#
# Usage:
#   ./scripts/verify-migrations.sh [--image postgres:16-alpine] [--keep] [--tests "m2 m16"]
#   --keep   leave the container running for inspection (default: removed)
#   --tests  space-separated test names (without .sql) to run; default: all
set -euo pipefail

IMAGE="${1:-postgres:16-alpine}"
KEEP=0
TESTS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --tests) TESTS="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="tap-migcheck-$$"
PORT="54399"

cleanup() {
  if [[ "$KEEP" -eq 0 ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  else
    echo "Container kept: $NAME (port $PORT)"
  fi
}
trap cleanup EXIT

echo "==> starting postgres ($IMAGE)"
docker run --name "$NAME" -e POSTGRES_PASSWORD=postgres \
  -p "127.0.0.1:$PORT:5432" -d "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> installing pgTAP from source"
docker exec "$NAME" apk add --no-cache build-base git perl >/dev/null 2>&1
docker exec "$NAME" sh -c \
  "cd /tmp && rm -rf pgtap && git clone --depth 1 https://github.com/theory/pgtap.git >/dev/null 2>&1 && cd pgtap && make >/dev/null 2>&1 && make install" >/dev/null

PSQL="docker exec $NAME psql -U postgres"
$PSQL -c "CREATE DATABASE taptest;" >/dev/null

echo "==> copying migrations/tests/seed"
docker cp "$ROOT/supabase/migrations" "$NAME:/tmp/migs"
docker cp "$ROOT/supabase/tests" "$NAME:/tmp/tests"
docker cp "$ROOT/supabase/seed" "$NAME:/tmp/seed"

echo "==> bootstrap + migrations in natural order"
docker exec "$NAME" sh -c "cd /tmp && psql -U postgres -d taptest -v ON_ERROR_STOP=1 -q -f tests/bootstrap_auth_stub.sql"
# shellcheck disable=SC2016
docker exec "$NAME" sh -c 'cd /tmp && for f in migs/*.sql; do psql -U postgres -d taptest -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>/tmp/err.txt || { echo "FAIL: $f"; cat /tmp/err.txt; exit 1; }; done'
echo "MIGRATIONS_OK"

echo "==> seed"
docker exec "$NAME" sh -c "cd /tmp && psql -U postgres -d taptest -v ON_ERROR_STOP=1 -q -f seed/dev.sql -f seed/flags.sql" 2>&1 | tail -1

if [[ -z "$TESTS" ]]; then
  FILES=()
  for path in "$ROOT"/supabase/tests/m*.sql; do
    FILES+=("$(basename "$path")")
  done
else
  FILES=()
  for t in $TESTS; do FILES+=("$t.sql"); done
fi

FAIL=0
for f in "${FILES[@]}"; do
  OUT=$(docker exec "$NAME" sh -c "cd /tmp && psql -U postgres -d taptest -v ON_ERROR_STOP=1 -f tests/$f 2>&1" || true)
  OK=$(echo "$OUT" | grep -cE ' ok [0-9]+' || true)
  BAD=$(echo "$OUT" | grep -E 'not ok|ERROR' | tr '\n' '|' || true)
  echo "== $f: $OK ok ${BAD:+FAILURES: $BAD}"
  if [[ -n "$BAD" ]]; then FAIL=1; fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "PGTAP_FAILURES_PRESENT"
  exit 1
fi
echo "ALL_GREEN"
