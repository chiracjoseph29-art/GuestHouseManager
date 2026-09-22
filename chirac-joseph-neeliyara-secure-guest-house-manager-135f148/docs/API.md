# API Reference (v1)

All protected routes require a valid session unless noted. Mutations require CSRF header.

Base path: `/api/v1`

## Auth

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/csrf` | Public | — | Issue CSRF token cookie |
| POST | `/auth/login` | Public | — | Sign in (generic errors) |
| GET | `/auth/me` | Public | — | Current user or null |
| POST | `/auth/logout` | Session | — | Revoke current session |
| POST | `/auth/password-reset` | Public | — | Request reset (always 200-style response) |
| PATCH | `/auth/password-reset` | Public | — | Complete reset with single-use token |

## Bookings

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/bookings` | bookings.view | List bookings |
| GET | `/bookings?availability=1&checkIn&checkOut` | bookings.view | Room availability |
| POST | `/bookings` | bookings.manage | Create booking |
| DELETE | `/bookings?id=` | bookings.manage | Cancel booking |

## Cleaning

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/cleaning/tasks` | cleaning.view **or** cleaning.execute | List tasks (scoped for cleaners) |
| PATCH | `/cleaning/tasks` | cleaning.execute | `start`, `attach_photo`, `complete` |
| POST | `/cleaning/tasks` | cleaning.manage | Assign cleaner |

## Inventory

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/inventory` | inventory.view/adjust | List items |
| POST | `/inventory` | inventory.manage | Create item |
| PATCH | `/inventory?id=` | inventory.adjust/manage | Apply stock change |

## Rooms, users, audit, reports, files

| Method | Path | Permission |
|--------|------|------------|
| GET | `/rooms` | rooms.view |
| GET/POST/DELETE | `/users` | users.view/manage, sessions.revoke |
| GET | `/audit` | audit.view |
| GET | `/reports/summary` | reports.view + finance.view |
| POST/GET | `/files` | cleaning.execute or maintenance.report / session |

Errors return `{ error: { code, message }, correlationId }` without stack traces.
