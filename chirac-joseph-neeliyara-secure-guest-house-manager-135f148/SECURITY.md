# Security Policy

## Architecture

- **Authentication:** Argon2id password hashing; sessions in PostgreSQL; HttpOnly cookies; optional MFA fields on `users`.
- **Authorization:** Deny-by-default RBAC + resource checks (cleaning assignment, file access).
- **Input validation:** Zod schemas at API boundary.
- **Database:** Prisma parameterized queries; transactions + row locks for bookings/inventory.
- **Uploads:** Size limits, magic-byte validation, Sharp re-encode, random storage keys, private storage.
- **Transport:** HSTS/CSP/clickjacking headers via middleware; secure cookies in production.
- **CSRF:** Required on state-changing authenticated requests.
- **Rate limiting:** Login and password reset (in-memory; use Redis in multi-instance production).
- **Logging:** Structured logs with redaction; separate audit trail.
- **Errors:** Generic client messages; correlation IDs for operators.

## Vulnerability reporting

Email your security contact (configure for your organization). Do not disclose issues publicly before coordinated fix.

## Dependency management

Run `npm audit` in CI; review high/critical findings before release. Pin lockfile; update monthly.

## Incident response (summary)

1. Contain (revoke sessions, rotate secrets)
2. Assess audit logs and application logs
3. Notify per legal/privacy policy (see PRIVACY.md)
4. Post-incident review and control updates

## File upload malware scanning

Architecture supports plugging a scanner worker after `processAndStoreImage` quarantine step (not enabled in default dev build).

## Secret rotation

Rotate `SESSION_SECRET`, `CSRF_SECRET`, DB credentials, and storage keys if exposure is suspected. Force global session revocation via admin API.
