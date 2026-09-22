# Privacy

This document describes data practices for GHMS. It does **not** constitute legal advice or a claim of automatic compliance with the Digital Personal Data Protection Act, 2023 or other laws.

## Data collected

| Data | Purpose | Legal basis (configure) |
|------|---------|-------------------------|
| Guest name, phone, email | Reservations, contact | Legitimate business / consent notice |
| Staff accounts | Authentication, RBAC | Employment/contract |
| Cleaning photos | Verify housekeeping | Legitimate business |
| Audit logs | Security, accountability | Legitimate interest |
| Financial amounts | Operations (no card data) | Legal obligation / business |

We do **not** store payment card numbers, CVV, or government ID images in the default configuration.

## Minimization & access

Role-based access limits guest PII exposure. Cleaners do not receive booking lists or payment data.

## Retention

Configurable via `retention_policies` (seed defaults):

- Cleaning photos: 365 days (example)
- Guest contact: 1095 days (example)
- Audit/financial: longer holds for legal/business needs

## Data subject requests

`data_subject_requests` table supports ACCESS, CORRECTION, DELETION, EXPORT workflows. Admin processes requests outside automatic deletion for legal holds.

## Privacy notice

Versioned records in `privacy_notices`; activate appropriate version for your property.

## Processors

Document third-party processors (hosting, email, backup storage) in your operator agreement. Architecture allows jurisdiction-specific extensions without schema rewrite.

## Breach response

Follow SECURITY.md incident process; notify affected individuals and authorities as required by applicable law.

## Deletion / anonymization

Guests support `anonymizedAt`; implement business rules before hard deletion of linked bookings required for tax records.
