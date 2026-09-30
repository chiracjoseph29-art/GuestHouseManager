# SUMMER HOUSE MANAGEMENT

Summer House Management is a secure operations application for guest-house teams. It brings reservations, room availability, guest records, housekeeping, inventory, payments, reporting, and audit history into one staff workspace.

## Application

- Reservation and room management, including whole-house bookings and availability checks
- Guest records, payment tracking, expenses, and operational reports
- Housekeeping tasks with photo-based completion and verification
- Inventory stock, room assignments, reference photos, and verification history
- Role-based access for administrators, managers, and cleaners
- Audit logging, privacy workflows, and configurable data retention
- Responsive web application with an installable PWA manifest

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with Prisma migrations
- Versioned REST API under `/api/v1`
- Argon2id password hashing, server-side sessions, CSRF protection, MFA support, and rate limiting
- Private local file storage for development or S3-compatible object storage for deployment
- Image validation and re-encoding, with a configurable malware-scanner integration

## Local Development

Requirements: Node.js, npm, and a local PostgreSQL database.

1. Install dependencies and create a local environment file:

   ```bash
   npm ci --legacy-peer-deps
   cp .env.example .env
   ```

2. Set the local `DATABASE_URL` and generate unique local `SESSION_SECRET` and `CSRF_SECRET` values. Keep `.env` out of source control.

3. Apply the local migrations:

   ```bash
   npm run db:migrate
   ```

4. Optionally populate a **disposable local development database** with baseline records and test staff users:

   ```bash
   npm run db:seed
   ```

   The seed creates development fixtures using values defined in `prisma/seed.ts`. These accounts are for local development only; do not use their credentials for deployed environments. The seed command is blocked when `NODE_ENV=production` and must never be run against production data.

5. Start the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3847`.

## Production Deployment

Use separate databases, application URLs, and secrets for staging and production. Configure deployment variables through the hosting platform's protected environment settings; never commit credentials.

1. Configure production secrets and service connections as described in [Production Configuration](docs/PRODUCTION_CONFIG.md). Use HTTPS, secure cookies, a least-privilege PostgreSQL role, private S3-compatible object storage, shared rate limiting where required, and the required malware-scanning integration.
2. Apply reviewed migrations during the release:

   ```bash
   npm run db:deploy
   ```

3. Build and deploy the application using the platform's supported Next.js process. For a Node deployment, the project commands are:

   ```bash
   npm run build
   npm run start
   ```

4. Provision the first production administrator only with the one-time `npm run db:bootstrap-admin` process in [Production Configuration](docs/PRODUCTION_CONFIG.md). Enable administrator MFA and remove the temporary bootstrap settings immediately afterward.
5. Do not run `npm run db:seed` in staging or production. Production staff accounts should be provisioned through the application’s administrator-only staff management workflow.

## Verification

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

Use staging with production-like security settings to validate integrations, access policies, backups, and recovery before release.

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | Modules and request flow |
| [API](docs/API.md) | Versioned API overview |
| [RBAC](docs/RBAC.md) | Roles and permissions |
| [Deployment](docs/DEPLOYMENT.md) | Release and operations guidance |
| [Production Configuration](docs/PRODUCTION_CONFIG.md) | Environment separation and administrator bootstrap |
| [Backup and Recovery](docs/BACKUP_RECOVERY.md) | Backup and restore procedures |
| [Security](SECURITY.md) | Security controls and reporting |
| [Security Checklist](SECURITY_CHECKLIST.md) | Release checks |
| [Privacy](PRIVACY.md) | Data handling and retention |
| [Threat Model](THREAT_MODEL.md) | Threats and mitigations |

## Credential Handling

Production administrator credentials must be unique to the deployment and managed through the approved secret manager and password manager. If a credential or secret is exposed, rotate it, revoke affected sessions where appropriate, and follow the incident process in [Security](SECURITY.md).