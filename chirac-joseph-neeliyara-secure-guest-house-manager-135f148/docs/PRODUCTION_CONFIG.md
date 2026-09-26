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
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | local bootstrap only | unset | set temporarily through secret manager |
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

The first production administrator is created by a server-side, one-time CLI. It is not an HTTP endpoint and never sends the bootstrap password to the browser.

1. Generate a unique administrator email and password. Store both as deployment secrets named `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; do not place them in shell history, source control, logs, or the browser.
2. Temporarily deploy the application with `ADMIN_MFA_BOOTSTRAP=true` and both bootstrap secrets present.
3. From the deployed application release directory, run exactly once:

	```bash
	npm run db:bootstrap-admin
	```

	The command refuses to run unless `ADMIN_MFA_BOOTSTRAP` is exactly `true`, refuses invalid credentials, and refuses to run if any `ADMIN` already exists. It creates only the administrator and its audit event; it does not run or modify the Prisma seed.

4. Sign in with the bootstrap administrator and enroll MFA through the existing `PUT /api/v1/auth/mfa` flow (`enroll`, then `confirm`). Keep the returned recovery codes in the approved password manager.
5. Immediately remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the deployment secrets, set `ADMIN_MFA_BOOTSTRAP=false`, and redeploy/restart every application instance.

The CLI remains unable to create another administrator while an `ADMIN` exists, and production administrator sign-in is rejected when MFA is not enabled after the flag is disabled. Never run `npm run db:seed` against production; production seeding is blocked and the seed also contains demo data.

Without MFA enabled, production admin sign-in is rejected (except during bootstrap).
