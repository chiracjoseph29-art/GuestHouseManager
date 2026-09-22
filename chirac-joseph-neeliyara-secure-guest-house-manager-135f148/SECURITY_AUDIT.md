# Security Audit Report — GHMS

**Audit date:** 2026-09-10  
**Scope:** Full application (Next.js API, auth, RBAC, bookings, cleaning, inventory, files, audit, CI, backups)  
**Method:** Code review, control tracing (browser → API → authorization → DB/storage), automated security tests, dependency scan, backup/restore drill  

---

## 1. Executive summary

The first implementation established many correct **patterns** (Argon2id, HttpOnly sessions, CSRF on authenticated mutations, deny-by-default RBAC, booking transactions, mandatory cleaning photos). This audit **found real gaps** between documented intent and behavior—especially **file/task IDOR**, **in-memory rate limits**, **missing admin MFA enforcement**, and **production storage/scanning**.

A hardening pass **fixed several exploitable or high-risk issues** (photo attach authorization, CSRF comparison, manager file over-access, production demo login block, Redis-ready rate limiting, S3 driver, MFA TOTP for admins, expanded tests). The system remains **not fully production-ready** until operations configure Redis, S3, malware scanning, MFA bootstrap, resolve dependency advisories, and complete staging validation.

---

## 2. Critical findings

_None identified as remotely exploitable without credentials after this hardening pass._

Previously critical-class **design gaps** (admin without MFA in production, arbitrary file attach to cleaning tasks) were treated as **high** and remediated; see §7.

---

## 3. High findings

### H-1: Cleaning photo attach IDOR (FIXED)

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Description** | Cleaners could attach **another user's** `fileId` to an assigned task if they knew/guessed the UUID. |
| **Attack scenario** | Cleaner B uploads photo; Cleaner A attaches B's `fileId` to A's task and completes cleaning. |
| **Component** | `cleaning.service.ts` / `attachCleaningPhoto` |
| **Evidence** | No ownership/purpose check before `cleaningPhoto.create`. |
| **Fix** | `assertFileOwnedForPurpose()` — uploader, purpose, not already linked. |
| **Verification** | `tests/security/idor.test.ts` |
| **Residual risk** | UUID guessing still possible for upload IDs; mitigated by ownership check. |

### H-2: Admin MFA not enforced (FIXED — conditional on config)

| Field | Detail |
|-------|--------|
| **Severity** | High (production admin accounts) |
| **Description** | Admin could sign in with password only; MFA fields unused. |
| **Fix** | TOTP enrollment (`PUT /api/v1/auth/mfa`), login challenge (`POST /api/v1/auth/mfa`), production block without MFA (`blockAdminWithoutMfaInProduction`), bootstrap flag. |
| **Verification** | Manual + `docs/PRODUCTION_CONFIG.md` |
| **Residual risk** | Bootstrap window if `ADMIN_MFA_BOOTSTRAP=true` left enabled. |

### H-3: Production object storage not used by default (OPEN)

| Field | Detail |
|-------|--------|
| **Severity** | High for production deployment |
| **Description** | Local disk storage in default config; no encryption at rest / lifecycle controls. |
| **Fix (partial)** | S3 driver + signed URL redirect implemented; requires ops config. |
| **Verification** | Configure `STORAGE_DRIVER=s3` in staging and test upload/download. |
| **Residual risk** | Misconfiguration exposes uploads on app server disk. |

### H-4: npm transitive vulnerabilities (OPEN)

| Field | Detail |
|-------|--------|
| **Severity** | High (tooling/transitive) |
| **Package path** | `prisma` → `@prisma/config` → `deepmerge-ts` (<8.0.0); `prisma` → `mysql2` (not used at runtime for PostgreSQL) |
| **Production impact** | **Low runtime impact** (dev/CLI/migrate tooling); not bundled in Next.js server for PG queries |
| **Exploitability** | Low in this deployment (Postgres-only app server) |
| **Upgrade path** | Monitor Prisma releases; avoid `npm audit fix --force` without regression testing |
| **Verification** | `npm audit` in CI |

---

## 4. Medium findings

### M-1: In-memory rate limiting (MITIGATED, ops required)

Shared-nothing rate limits do not synchronize across instances. **Fix:** `REDIS_URL` enables `RateLimiterRedis` (`src/server/lib/rate-limit.ts`). **Residual:** Without Redis, horizontal scale weakens throttling.

### M-2: Manager unrestricted file download (FIXED)

Managers previously passed `userCanAccessFile` for all files. **Fix:** Managers limited to housekeeping/maintenance purposes.

### M-3: CSP `style-src 'unsafe-inline'` (OPEN)

Required by current Tailwind/shadcn inline patterns. **Mitigation:** nonce-based styles in future; document exception.

### M-4: Login/password-reset without CSRF (ACCEPTED)

Public auth endpoints intentionally skip CSRF; **residual** login CSRF risk—mitigate with SameSite cookies (Lax) and monitoring.

### M-5: No DB exclusion constraint for bookings (OPEN)

Overlap prevention is transactional application logic + row locks, not PostgreSQL EXCLUDE constraint. **Residual:** application bug could regress; recommend future migration adding exclusion via `btree_gist`.

### M-6: Malware scanning optional in dev (BY DESIGN)

Production can set `MALWARE_SCAN_REQUIRED=true` to fail closed. See `docs/MALWARE_SCAN_PIPELINE.md`.

---

## 5. Low findings

- **L-1:** Password reset token logged only if `ALLOW_DEV_RESET_TOKEN_LOG=true` (was unconditional in dev).
- **L-2:** Audit logs readable by managers may include guest-related metadata in `metadata` JSON—minimize in future changes.
- **L-3:** `GET /api/v1/files` uses redirect to signed URL—ensure CDN/bucket not public.
- **L-4:** Inventory concurrent test shows ledger consistency; no DB constraint preventing negative stock (blocked in service layer).

---

## 6. Informational

- Next.js middleware deprecation notice (`middleware` → `proxy`)—track framework migration.
- Prisma agent skill files in repo clutter—remove from production branches.
- DPDP legal compliance requires operational/legal configuration (see §15).

---

## 7. Fixed vulnerabilities (this pass)

1. Cleaning photo attach IDOR — file ownership + purpose validation  
2. Maintenance photo IDOR — same validation on issue reports  
3. CSRF token compare — timing-safe comparison  
4. Booking/inventory `FOR UPDATE` — parameterized `Prisma.sql` per ID  
5. Manager file access — purpose-scoped  
6. Demo account login in production — blocked  
7. Seed in production — throws  
8. Upload rate limit — per-user hourly cap  
9. File UUID validation on download query param  
10. Admin MFA (TOTP + recovery codes + login challenge)  
11. S3 storage adapter + short-lived signed URLs  
12. Redis-backed rate limiter option  
13. Backup scripts — strip `?schema=` for `pg_dump` compatibility  
14. Expanded security tests (16 tests across IDOR, CSRF, concurrency, RBAC, booking)  

---

## 8. Remaining vulnerabilities / gaps

- Production depends on correct **S3**, **Redis**, **MFA bootstrap**, and **malware scanner** configuration.  
- Transitive **npm audit** highs in Prisma toolchain.  
- No third-party **penetration test** performed.  
- Booking overlap not enforced by DB constraint.  
- CSP inline styles.  
- Session fixation: new session on login; old sessions not globally revoked on login (only password reset revokes all).  

---

## 9. Dependency findings

See §3 H-4. Run `npm audit` and `npm outdated` in CI. Do not claim zero vulnerabilities.

---

## 10. Authentication review

| Control | Status | Evidence |
|---------|--------|----------|
| Argon2id | OK | `crypto.ts` type argon2id |
| Password length ≥12 | OK | auth.service, reset |
| Generic login errors | OK | `Invalid email or password` |
| Reset enumeration | OK | silent return POST reset |
| Reset token single-use/expiry | OK | `password_reset_tokens.usedAt` |
| Session HttpOnly/SameSite | OK | session.service |
| Secure cookie prod | Config | `COOKIE_SECURE` |
| Logout revokes server session | OK | `revokeSessionByToken` |
| Lockout + rate limit | OK | loginLimiter + Redis option |
| Admin MFA | OK (when enabled) | mfa.service + routes |
| Session fixation | Partial | new session on login; consider revoke-other-sessions for admin |

---

## 11. Authorization review

RBAC enforced in `withAuth` on all protected routes. Resource checks for cleaning tasks and files. Full matrix: `docs/ENDPOINT_SECURITY_MATRIX.md`. Automated IDOR/RBAC tests in `tests/security/idor.test.ts`.

**Verified cleaner cannot:** access bookings list, finance permissions, audit API (no permission), admin users API, attach others' files (fixed).

---

## 12. File-upload review

Magic-byte validation, size limits, Sharp re-encode, quarantine + optional scan command, random keys, path traversal checks on local read. Upload rate limited. Attach requires owned `CLEANING_PHOTO` file.

---

## 13. Database review

Prisma ORM for all queries; raw SQL only `Prisma.sql` tagged templates for `FOR UPDATE`. FKs and indexes in schema. Least-privilege DB user **must be configured in production** (not verified in CI). Migrations applied in CI.

---

## 14. Privacy review

| Item | Status |
|------|--------|
| Privacy notice table | IMPLEMENTED (seed) |
| Retention policies | IMPLEMENTED (configurable) |
| Data subject requests | IMPLEMENTED (schema) |
| Legal compliance | REQUIRES OPERATIONAL/LEGAL CONFIGURATION |
| Guest minimization | IMPLEMENTED (limited fields) |
| Cleaner isolation from guest bookings | IMPLEMENTED (service + RBAC) |

---

## 15. Backup/recovery review

| Step | Result |
|------|--------|
| Encrypted backup script | OK after URI fix |
| Restore to `ghms_restore` | **Tested** — 4 users restored |
| Restore warnings | `permission denied to change default privileges` on restore — review role grants |
| File blob restore | Not included in SQL backup — requires separate object storage backup |

Document RPO/RTO in `docs/BACKUP_RECOVERY.md`. **Do not claim DR readiness** without off-site object storage backups.

---

## 16. Production-readiness assessment

**PRODUCTION READINESS: CONDITIONAL**

### Blockers before declaring READY

1. Configure **STORAGE_DRIVER=s3**, private bucket, IAM, lifecycle/retention.  
2. Configure **REDIS_URL** for multi-instance rate limiting.  
3. Complete **admin MFA enrollment**; disable `ADMIN_MFA_BOOTSTRAP`.  
4. Enable **MALWARE_SCAN_COMMAND** + `MALWARE_SCAN_REQUIRED=true`.  
5. Rotate all **seed/demo credentials**; verify demo emails blocked in production.  
6. Run staging **smoke + security tests** on production-like config.  
7. Document/accept **npm audit** transitive findings or upgrade Prisma when safe.  
8. Successful **restore drill** including object storage (not only Postgres).  
9. External **security review/pen test** recommended for go-live.

Security is an ongoing process, not a one-time certification. The system is not "100% secure" or "unhackable."

---

## Test results (post-hardening)

```
npm run test  → 16 passed (4 files: security, idor, csrf, concurrency)
npm run typecheck → pass
npm run build → pass (run in CI)
```

Backup drill: `ghms-backup-*.sql.gz.enc` restored to `ghms_restore`, `users` count = 4.
