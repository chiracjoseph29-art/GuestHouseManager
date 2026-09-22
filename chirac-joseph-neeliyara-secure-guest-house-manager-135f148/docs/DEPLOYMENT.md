# Deployment

## Environments

Use separate `DATABASE_URL`, secrets, and `APP_URL` per development, staging, and production. Never commit `.env`.

## Production checklist

1. Set `NODE_ENV=production`, `COOKIE_SECURE=true`, HTTPS termination at load balancer.
2. Use least-privilege PostgreSQL role (no `SUPERUSER`, no `CREATEDB`).
3. Configure object storage (`STORAGE_DRIVER=s3`) and private bucket with signed URL access.
4. Run `npm run db:deploy` during release.
5. Remove or rotate all seed passwords; create real admin via controlled process.
6. Enable centralized log shipping and alerting (failed logins, authz denials).
7. Schedule encrypted backups (`scripts/backup-db.sh`) and monthly restore drills.

## Process

```bash
npm ci --legacy-peer-deps
npx prisma migrate deploy
npm run build
npm run start
```

## Environment variables

See `.env.example` for the full list. Required in all environments:

- `DATABASE_URL`, `SESSION_SECRET`, `CSRF_SECRET`, `APP_URL`

## CI gate

GitHub Actions workflow runs typecheck, tests, build, `npm audit --audit-level=critical`, and a basic secret pattern scan.
