# API Endpoint Security Matrix

| Endpoint | Method | Auth | Permission(s) | Resource restriction | ADMIN | MANAGER | CLEANER |
|----------|--------|------|---------------|----------------------|:-----:|:-------:|:-------:|
| `/api/v1/csrf` | GET | No | — | — | ✓ | ✓ | ✓ |
| `/api/v1/auth/login` | POST | No | — | Rate limit | ✓ | ✓ | ✓ |
| `/api/v1/auth/me` | GET | Optional | — | — | ✓ | ✓ | ✓ |
| `/api/v1/auth/logout` | POST | Session | — | CSRF | ✓ | ✓ | ✓ |
| `/api/v1/auth/password-reset` | POST/PATCH | No | — | Rate limit | ✓ | ✓ | ✓ |
| `/api/v1/auth/mfa` | POST | No | — | MFA challenge verify | ✓* | — | — |
| `/api/v1/auth/mfa` | PUT | Session | — | Admin MFA enroll | ✓ | — | — |
| `/api/v1/bookings` | GET | Session | bookings.view | No bookings for cleaner | ✓ | ✓ | ✗ |
| `/api/v1/bookings` | POST | Session | bookings.manage | — | ✓ | ✗ | ✗ |
| `/api/v1/bookings` | DELETE | Session | bookings.manage | — | ✓ | ✗ | ✗ |
| `/api/v1/cleaning/tasks` | GET | Session | cleaning.view **or** cleaning.execute | Cleaner: assigned tasks only | ✓ | ✓ | ✓† |
| `/api/v1/cleaning/tasks` | PATCH | Session | cleaning.execute | Task assignment check | ✓ | ✓‡ | ✓† |
| `/api/v1/cleaning/tasks` | POST | Session | cleaning.manage | — | ✓ | ✗ | ✗ |
| `/api/v1/inventory` | GET | Session | inventory.view/adjust | Cleaner: permission row | ✓ | ✓ | ✓§ |
| `/api/v1/inventory` | POST | Session | inventory.manage | — | ✓ | ✗ | ✗ |
| `/api/v1/inventory` | PATCH | Session | inventory.adjust/manage | Transaction + audit | ✓ | ✓ | ✓§ |
| `/api/v1/rooms` | GET | Session | rooms.view | — | ✓ | ✓ | ✗ |
| `/api/v1/users` | GET | Session | users.view | — | ✓ | ✓ | ✗ |
| `/api/v1/users` | POST | Session | users.manage | — | ✓ | ✗ | ✗ |
| `/api/v1/users` | DELETE | Session | sessions.revoke | — | ✓ | ✗ | ✗ |
| `/api/v1/audit` | GET | Session | audit.view | — | ✓ | ✓ | ✗ |
| `/api/v1/reports/summary` | GET | Session | reports.view + finance.view | Manager needs flag | ✓ | ✓¶ | ✗ |
| `/api/v1/files` | POST | Session | cleaning.execute or maintenance.report | Upload rate limit | ✓ | ✓ | ✓ |
| `/api/v1/files` | GET | Session | Session + file ACL | Per-file authorization | ✓ | ✓# | ✓** |

Legend:

- † Cleaner only assigned cleaning tasks; photo attach requires owned file (`CLEANING_PHOTO`).
- ‡ Manager has `cleaning.execute` in matrix but typically uses view/manage operationally.
- § Cleaner inventory requires `user_inventory_permissions` (consume/view flags).
- ¶ Manager finance requires `canViewFinancials=true`.
- # Manager file GET limited to housekeeping/maintenance purposes (not `OTHER`).
- \* MFA POST is pre-session challenge completion.
- ** Cleaner file access: assigned task photos, own uploads, own maintenance photos.

Automated coverage: `tests/security/idor.test.ts`, `tests/security/security.test.ts`, `tests/security/csrf.test.ts`, `tests/security/concurrency.test.ts`.
