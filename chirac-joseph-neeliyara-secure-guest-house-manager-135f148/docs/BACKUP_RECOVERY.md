# Backup & Recovery

## Objectives

| Metric | Target (configure per ops policy) |
|--------|-----------------------------------|
| RPO | ≤ 24 hours (daily encrypted backup) |
| RTO | ≤ 4 hours for full DB restore |

## Automated backup

Use `scripts/backup-db.sh` with:

- `DATABASE_URL`
- `BACKUP_ENCRYPTION_KEY`

Store artifacts off-site (object storage with versioning).

## Restore procedure

1. Provision empty PostgreSQL instance.
2. Set `DATABASE_URL` to target.
3. Run `scripts/restore-db.sh <backup-file>`.
4. Run application smoke tests (login, booking read, audit read).
5. Document incident and verification in ops log.

## Testing

A backup is not valid until restore is tested. Schedule quarterly restore tests to a non-production database.

## Application data classes

| Class | Backup | Retention config |
|-------|--------|------------------|
| Operational | Daily | `retention_policies` table |
| Financial | Daily, long hold | `financial_records` |
| Audit | Daily, append-only | `audit_logs` |
| Cleaning photos | Storage + DB metadata | `cleaning_photos` / file expiry |
