# RBAC Matrix

Permissions are enforced in `src/server/rbac/permissions.ts` and checked in every API handler via `withAuth`.

| Permission | ADMIN | MANAGER | CLEANER |
|------------|:-----:|:-------:|:-------:|
| users.manage | ✓ | | |
| users.view | ✓ | ✓ | |
| rooms.manage | ✓ | | |
| rooms.view | ✓ | ✓ | |
| bookings.manage | ✓ | | |
| bookings.view | ✓ | ✓ | |
| cleaning.manage | ✓ | | |
| cleaning.view | ✓ | ✓ | |
| cleaning.execute | ✓ | | ✓ |
| inventory.manage | ✓ | | |
| inventory.view | ✓ | ✓ | ✓* |
| inventory.adjust | ✓ | | ✓* |
| finance.view | ✓ | ✓** | |
| finance.manage | ✓ | | |
| audit.view | ✓ | ✓ | |
| settings.manage | ✓ | | |
| reports.view | ✓ | ✓ | |
| maintenance.report | ✓ | ✓ | ✓ |
| maintenance.manage | ✓ | ✓ | |
| privacy.manage | ✓ | | |
| sessions.revoke | ✓ | | |

\* Cleaner inventory access requires row in `user_inventory_permissions` (seed grants view + consume).

\** Manager finance requires `canViewFinancials=true`.

## Resource-level rules

- Cleaners only see cleaning tasks where `assignedToId` matches their user id.
- Cleaners cannot call booking, audit, user, or financial endpoints (403).
- File downloads authorized per linked cleaning/maintenance record or uploader.
