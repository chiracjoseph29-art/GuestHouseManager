#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY required}"
FILE="${1:?Usage: restore-db.sh backup-file.sql.gz.enc}"
TARGET_URL="${2:-$DATABASE_URL}"
DB_URL="${TARGET_URL%%\?*}"
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_KEY" -in "$FILE" | gunzip | psql "$DB_URL"
