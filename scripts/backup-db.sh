#!/usr/bin/env bash
# M18: encrypted PostgreSQL backup with retention + verification.
# Usage:
#   DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/tap \
#   BACKUP_PASSPHRASE='...' ./scripts/backup-db.sh
#   RETENTION_DAYS=14 ./scripts/backup-db.sh   # optional (default 14)
#
# Output: $BACKUP_DIR/tap-YYYYmmdd-HHMMSS.dump.gz.enc + .sha256 manifest.
# The passphrase NEVER lands in source control (env only). Off-VPS copy:
# set OFFSITE_CMD, e.g. OFFSITE_CMD="rclone copy {file} remote:tap-backups".
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BASE="tap-$STAMP"
DUMP="$BACKUP_DIR/$BASE.dump"
GZ="$DUMP.gz"
ENC="$GZ.enc"

echo "==> pg_dump (custom format)"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --file="$DUMP"

echo "==> compress + encrypt (AES-256-CBC, PBKDF2)"
gzip -9 "$DUMP"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$GZ" -out "$ENC" -pass env:BACKUP_PASSPHRASE
rm -f "$GZ"

echo "==> manifest + verify"
sha256sum "$ENC" > "$ENC.sha256"
TMP_VERIFY="$(mktemp -u).dump"
if openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "$ENC" -pass env:BACKUP_PASSPHRASE 2>/dev/null \
    | gunzip -c > "$TMP_VERIFY" \
  && pg_restore --list "$TMP_VERIFY" >/dev/null; then
  echo "verify: decrypt + gzip + TOC all OK"
else
  rm -f "$TMP_VERIFY"
  echo "BACKUP_VERIFY_FAILED"
  exit 1
fi
rm -f "$TMP_VERIFY"

if [[ -n "${OFFSITE_CMD:-}" ]]; then
  echo "==> offsite copy"
  # shellcheck disable=SC2086
  file="$ENC" sha="$ENC.sha256" bash -c "$OFFSITE_CMD"
fi

echo "==> retention ($RETENTION_DAYS days, local only)"
find "$BACKUP_DIR" -maxdepth 1 -name 'tap-*.dump.gz.enc' -mtime "+$RETENTION_DAYS" -delete || true
find "$BACKUP_DIR" -maxdepth 1 -name 'tap-*.dump.gz.enc.sha256' -mtime "+$RETENTION_DAYS" -delete || true

echo "BACKUP_OK $ENC"
