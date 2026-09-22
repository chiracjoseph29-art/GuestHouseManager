import type { User } from "@/generated/prisma/client";
import { ForbiddenError } from "@/server/lib/errors";
import { PERMISSIONS, ROLE_PERMISSIONS, type PermissionCode } from "@/server/rbac/permissions";

export function roleHasPermission(role: User["role"], permission: PermissionCode): boolean {
  const list = ROLE_PERMISSIONS[role] ?? [];
  return list.includes(permission);
}

export function assertPermission(
  user: Pick<User, "role" | "canViewFinancials">,
  permission: PermissionCode,
): void {
  if (permission === PERMISSIONS.FINANCE_VIEW || permission === PERMISSIONS.FINANCE_MANAGE) {
    if (user.role === "MANAGER" && !user.canViewFinancials) {
      throw new ForbiddenError();
    }
  }
  if (!roleHasPermission(user.role, permission)) {
    throw new ForbiddenError();
  }
}

export function assertAnyPermission(
  user: Pick<User, "role" | "canViewFinancials">,
  permissions: PermissionCode[],
): void {
  const allowed = permissions.some((p) => {
    try {
      assertPermission(user, p);
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) throw new ForbiddenError();
}
