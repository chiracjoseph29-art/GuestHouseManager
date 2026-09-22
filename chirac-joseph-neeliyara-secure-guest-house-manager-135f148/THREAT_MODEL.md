# Threat Model

For each threat: attack surface, risk, mitigation, residual risk.

## Stolen credentials

| | |
|---|---|
| **Surface** | Login, session cookie |
| **Risk** | Account takeover |
| **Mitigation** | Argon2id, lockout, rate limits, HttpOnly cookies, session revocation, audit |
| **Residual** | Reused passwords on other sites |

## Malicious cleaner account

| | |
|---|---|
| **Surface** | Cleaning/inventory APIs |
| **Risk** | IDOR, data leakage |
| **Mitigation** | Server RBAC, assignment checks, no financial routes |
| **Residual** | Insider photos of room conditions |

## Compromised admin

| | |
|---|---|
| **Surface** | Full API |
| **Risk** | Data exfiltration, fraud |
| **Mitigation** | Audit logs, MFA-ready fields, session revoke, least privilege DB user |
| **Residual** | Full admin is high trust |

## IDOR / BOLA

| | |
|---|---|
| **Surface** | UUID resource IDs |
| **Mitigation** | Resource-level checks (cleaning tasks, files) |
| **Residual** | New endpoints must repeat pattern |

## SQL injection

| | |
|---|---|
| **Mitigation** | Prisma parameter binding, no string SQL concat |
| **Residual** | Raw queries must use tagged templates |

## XSS

| | |
|---|---|
| **Mitigation** | CSP, React escaping, no dangerouslySetInnerHTML |
| **Residual** | Future rich text features need sanitization |

## CSRF

| | |
|---|---|
| **Mitigation** | Double-submit CSRF on mutations |
| **Residual** | Public login remains CSRF-exempt by design |

## Malicious uploads

| | |
|---|---|
| **Mitigation** | Magic bytes, allowlist, re-encode, private storage |
| **Residual** | No AV scanner in default build |

## Database compromise

| | |
|---|---|
| **Mitigation** | Least privilege DB user, encrypted backups, network isolation |
| **Residual** | Application DB user can read app data |

## Session theft

| | |
|---|---|
| **Mitigation** | HttpOnly, Secure, SameSite, rotation on password reset |
| **Residual** | Malware on client device |

## Double booking

| | |
|---|---|
| **Mitigation** | Transaction + `FOR UPDATE` locks, overlap queries, whole-house rules |
| **Residual** | Requires DB availability during booking |

## Inventory manipulation

| | |
|---|---|
| **Mitigation** | Transactional updates, audit trail, non-negative stock default |
| **Residual** | Colluding staff |

## Ransomware / backup compromise

| | |
|---|---|
| **Mitigation** | Off-site encrypted backups, restore testing |
| **Residual** | Operator discipline |
