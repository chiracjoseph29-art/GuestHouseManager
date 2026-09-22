# Guest House Management System (GHMS)

Production-oriented, security-first web application and PWA for small guest house operations: bookings, availability, whole-house reservations, housekeeping with mandatory photo verification, inventory, RBAC, audit logging, and configurable privacy controls aligned with India-focused requirements (DPDP Act 2023 readiness).

## Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, PWA manifest
- **API:** REST under `/api/v1/*` with server-side RBAC on every route
- **Database:** PostgreSQL + Prisma migrations
- **Auth:** Argon2id password hashing, HttpOnly session cookies, CSRF for cookie-authenticated mutations
- **Files:** Local storage (dev) with magic-byte validation, re-encoding via Sharp; S3-compatible driver hook for production

## Quick start

1. Copy environment template:

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL and apply migrations + seed:

   ```bash
   npm install --legacy-peer-deps
   npx prisma migrate deploy
   npm run db:seed
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3847`

### Demo accounts (change before production)

| Role    | Email                     | Password              |
|---------|---------------------------|-----------------------|
| Admin   | admin@guesthouse.local    | value of `SEED_ADMIN_PASSWORD` in `.env` |
| Manager | manager@guesthouse.local  | Manager123!Secure     |
| Cleaner | cleaner@guesthouse.local  | Cleaner123!Secure     |

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, request flow, logging |
| [docs/API.md](docs/API.md) | REST endpoint list |
| [docs/RBAC.md](docs/RBAC.md) | Permission matrix |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Staging/production hardening |
| [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) | RPO/RTO, scripts, restore testing |
| [SECURITY.md](SECURITY.md) | Security architecture & reporting |
| [PRIVACY.md](PRIVACY.md) | Data use, retention, subject requests |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Threats, mitigations, residual risk |
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | Pre-release verification |

## Tests

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

## Known limitations

- S3 storage driver is stubbed; production should configure `STORAGE_DRIVER=s3` and implement deployment credentials via secrets manager.
- MFA/TOTP fields exist on users but UI enrollment is not yet exposed (architecture-ready).
- Malware scanning hook for uploads is documented in `SECURITY.md` but not wired to an external scanner.
- Online guest self-service booking portal is not included (API/schema support partial via booking sources).

## Secret rotation

If a secret is committed accidentally: rotate `SESSION_SECRET`, `CSRF_SECRET`, database passwords, and `SEED_ADMIN_PASSWORD`, revoke all sessions via admin API, and force password resets.
