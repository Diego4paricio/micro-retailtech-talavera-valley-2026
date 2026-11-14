#!/bin/bash
# Applies the Supabase stubs and every migration in order to a fresh local
# database, to test a migration before applying it on kardo-dev.
# Usage: scripts/dev/local-postgres/apply-all.sh [port] (default 55435)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PORT="${1:-55435}"
ERR="$(mktemp)"
P=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -c "drop database if exists kardo" >/dev/null 2>&1
"${P[@]}" -c "create database kardo" || exit 1
"${P[@]}" -d kardo -f "$HERE/stubs.sql" >/dev/null 2>&1
for f in "$ROOT"/supabase/migrations/*.sql; do
  # pg_cron and pg_net are not in Homebrew's Postgres: the stubs fake cron.* and net.*.
  if ! sed -E '/create extension if not exists (pg_cron|pg_net)/Id' "$f" | "${P[@]}" -d kardo >/dev/null 2>"$ERR"; then
    echo "FALLA $(basename "$f")"; head -8 "$ERR"; exit 1
  fi
  # Supabase's auth.sessions appears with the customer second factor.
  if [ "$(basename "$f")" = "20261003140000_customer_second_factor.sql" ]; then
    "${P[@]}" -d kardo -f "$HERE/stubs-sessions.sql" >/dev/null 2>&1
  fi
done
rm -f "$ERR"
echo "todas aplicadas"
