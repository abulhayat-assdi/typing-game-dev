#!/usr/bin/env bash
# M18: secret-leak scan over source + build artifacts.
# Fails on probable secret assignments (not on documented env names).
# Usage: ./scripts/scan-secrets.sh [--artifacts]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERN='(sk_live|sk_test|AKIA|aws_secret|BEGIN [A-Z ]*PRIVATE KEY|xox[bap]-|ghp_|gho_|AIza|supabase.*service_role.{0,5}key\s*[:=]\s*["'\'']eyJ|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})'

echo "==> source scan"
if grep -rEnI --exclude-dir=node_modules --exclude-dir=.git \
  --exclude='*.test.*' --exclude-dir=.open-next --exclude-dir=.next \
  --exclude='scan-secrets.sh' --exclude='validate-workers-config.ts' \
  "$PATTERN" "$ROOT" | head -20; then
  echo "SECRET_SCAN_HITS_SOURCE (review above)"
  exit 1
fi
echo "source clean"

if [[ "${1:-}" == "--artifacts" ]]; then
  echo "==> build artifact scan (.open-next)"
  if [[ -d "$ROOT/apps/web/.open-next" ]]; then
    # Value-shaped secrets only (bundled SDK field names like
    # secretAccessKey are identifiers, not leaks).
    ART_PATTERN='(AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]+|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|["'\'']xox[bap]-[A-Za-z0-9-]+["'\''])'
    if grep -rEnI "$ART_PATTERN" "$ROOT/apps/web/.open-next" | head -10; then
      echo "SECRET_SCAN_HITS_ARTIFACTS (review above)"
      exit 1
    fi
    echo "artifacts clean"
  else
    echo "no .open-next directory (run build:worker first)"
  fi
fi

# service_role must only appear in server-only contexts
echo "==> service-role surface check"
if grep -rEn "service_role|SERVICE_ROLE" "$ROOT/apps/web" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude='*.test.*' \
  | grep -v "lib/server" | grep -vi "not used\|NOT used" | head -10; then
  echo "SERVICE_ROLE_OUTSIDE_SERVER (review above)"
  exit 1
fi
echo "service-role surface OK"
echo "SECRET_SCAN_OK"
