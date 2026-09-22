# Production Configuration

## Environment separation

| Variable class | Development | Staging | Production |
|----------------|-------------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `COOKIE_SECURE` | false | true | true |
| `STORAGE_DRIVER` | local | s3 | s3 |
| `REDIS_URL` | optional | required | required |
| `MALWARE_SCAN_COMMAND` | optional | recommended | required |
| `ADMIN_MFA_BOOTSTRAP` | true (once) | false | false |
| Seed script | allowed | allowed | **blocked** |

## Production must disable

- Demo accounts (`assertNotDemoAccountInProduction` blocks `@guesthouse.local` emails when `NODE_ENV=production`)
- Database seed (`assertSeedAllowed`)
- Dev password-reset token logging (`ALLOW_DEV_RESET_TOKEN_LOG` must be unset/false)
- Verbose Prisma query logging (only errors in production client)

## Required production secrets (placeholders in `.env.example` only)

- `SESSION_SECRET`, `CSRF_SECRET`, `MFA_ENCRYPTION_KEY` (recommended separate from session secret)
- Database URL with least-privilege role
- S3 credentials via IAM role or secrets manager (never in repo)

## TLS

Terminate HTTPS at load balancer; ensure `x-forwarded-proto=https` for redirect middleware.

## Horizontal scaling

Use `REDIS_URL` so rate limits are shared across instances.

## Admin MFA bootstrap

1. Deploy with `ADMIN_MFA_BOOTSTRAP=true` temporarily.
2. Admin signs in, enrolls MFA via `PUT /api/v1/auth/mfa` (`enroll` → `confirm`).
3. Set `ADMIN_MFA_BOOTSTRAP=false` and redeploy.

Without MFA enabled, production admin sign-in is rejected (except during bootstrap).
