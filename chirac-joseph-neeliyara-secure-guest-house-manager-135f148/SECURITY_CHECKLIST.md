# Security Release Checklist

Verify each item before production (do not mark complete without evidence).

- [x] Authentication secured — Argon2id, sessions, lockout (`auth.service.ts`, tests)
- [x] Authorization enforced server-side — `withAuth` on routes
- [x] IDOR/BOLA tested — cleaning assignment + file access checks; automated RBAC tests
- [x] SQL injection tested — Prisma-only data access in modules
- [x] XSS mitigations — CSP middleware, React defaults
- [x] CSRF protection verified — cookie + header on mutations
- [x] File uploads secured — Sharp pipeline, allowlist
- [x] Secrets removed from repository — `.env` gitignored, `.env.example` placeholders only
- [x] Security headers configured — `src/middleware.ts`
- [ ] HTTPS enforced — requires production TLS termination (middleware redirect when `x-forwarded-proto=http`)
- [x] Rate limiting enabled — login/reset limiters
- [x] Audit logging enabled — `audit_logs` + auth/booking/inventory events
- [x] Backups configured — scripts documented
- [ ] Backup restoration tested — operator must run drill
- [ ] Dependency vulnerabilities reviewed — run `npm audit` before release
- [x] Production errors sanitized — `jsonError` handler
- [ ] Database permissions minimized — configure per environment
- [x] Admin permissions tested — RBAC matrix
- [x] Cleaner permissions tested — RBAC + task scope
- [x] Booking race conditions tested — overlap integration test
- [ ] Inventory race conditions tested — partial (transactional updates; add load test)
- [x] Privacy controls documented — PRIVACY.md + retention policies
- [x] Data retention configured — seed policies
- [x] Threat model completed — THREAT_MODEL.md

## Remaining security risks

- In-memory rate limiter not shared across instances
- S3 driver not fully implemented
- MFA not exposed in UI
- No external malware scanner on uploads
- Restore testing not automated in CI

## Recommended next steps

1. Wire S3-compatible storage and short-lived signed URLs for all photo access.
2. Enable MFA for ADMIN accounts.
3. Add Redis-backed rate limiting and session cache for horizontal scale.
4. Integrate ClamAV or cloud AV scanning post-upload.
5. Penetration test focused on IDOR and booking concurrency under load.
