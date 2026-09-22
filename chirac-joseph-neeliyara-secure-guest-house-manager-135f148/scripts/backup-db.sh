#!/usr/bin/env bash
set -euo pipefail
# Example encrypted backup — configure BACKUP_ENCRYPTION_KEY and DATABASE_URL in ops environment.
: "${DATABASE_URL:?DATABASE_URL required}"
DB_URL="${DATABASE_URL%%\?*}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY required}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="ghms-backup-${STAMP}.sql.gz.enc"
pg_dump "$DB_URL" | gzip | openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_KEY" -out "$FILE"
echo "Backup written to $FILE"
