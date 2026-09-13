#!/usr/bin/env bash
# M18: restore an encrypted backup into a TARGET database + integrity check.
# Usage:
#   DATABASE_URL=postgres://.../targetdb BACKUP_PASSPHRASE='...' \
#     ./scripts/restore-db.sh /var/backups/tap/tap-20260101-000000.dump.gz.enc
#
# Refuses database names containing 'prod' unless --i-am-sure is passed.
# There is NO automatic destructive rollback: restoring over production
# is a deliberate, manual, logged operator action.
set -euo pipefail

if [[ "${1:-}" == "--i-am-sure" ]]; then
  I_AM_SURE=1
  FILE="${2:-}"
else
  I_AM_SURE=0
  FILE="${1:-}"
fi
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "usage: restore-db.sh [--i-am-sure] <backup-file>"; exit 2
fi

DBNAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"
if [[ "$DBNAME" == *prod* && "$I_AM_SURE" -ne 1 ]]; then
  echo "REFUSING to restore over '$DBNAME' without --i-am-sure"
  exit 1
fi

echo "==> decrypt + restore into $DBNAME"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$FILE" -pass env:BACKUP_PASSPHRASE \
  | gunzip \
  | pg_restore --dbname="$DATABASE_URL" --no-owner --clean --if-exists

echo "==> post-restore integrity check"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/db-integrity.sql"

echo "RESTORE_OK $DBNAME"
