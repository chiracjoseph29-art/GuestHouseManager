/** Permission codes — enforced on every protected API route. */
export const PERMISSIONS = {
  USERS_MANAGE: "users.manage",
  USERS_VIEW: "users.view",
  ROOMS_MANAGE: "rooms.manage",
  ROOMS_VIEW: "rooms.view",
  BOOKINGS_MANAGE: "bookings.manage",
  BOOKINGS_VIEW: "bookings.view",
  CLEANING_MANAGE: "cleaning.manage",
  CLEANING_VIEW: "cleaning.view",
  CLEANING_EXECUTE: "cleaning.execute",
  INVENTORY_MANAGE: "inventory.manage",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_VERIFY: "inventory.verify",
  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",
  AUDIT_VIEW: "audit.view",
  SETTINGS_MANAGE: "settings.manage",
  REPORTS_VIEW: "reports.view",
  MAINTENANCE_REPORT: "maintenance.report",
  MAINTENANCE_MANAGE: "maintenance.manage",
  PRIVACY_MANAGE: "privacy.manage",
  SESSIONS_REVOKE: "sessions.revoke",
  BOOKINGS_DELETE_PERMANENT: "bookings.delete_permanent",
  ROOMS_DELETE_PERMANENT: "rooms.delete_permanent",
  CLEANING_DELETE_PERMANENT: "cleaning.delete_permanent",
  EXPENSES_DELETE_PERMANENT: "expenses.delete_permanent",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  ADMIN: Object.values(PERMISSIONS),
  MANAGER: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.ROOMS_VIEW,
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.CLEANING_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.MAINTENANCE_MANAGE,
  ],
  CLEANER: [
    PERMISSIONS.CLEANING_EXECUTE,
    PERMISSIONS.MAINTENANCE_REPORT,
    PERMISSIONS.INVENTORY_VERIFY,
  ],
};

export const PERMISSION_DEFINITIONS: { code: PermissionCode; description: string }[] =
  Object.entries(PERMISSIONS).map(([key, code]) => ({
    code,
    description: key.replace(/_/g, " ").toLowerCase(),
  }));
