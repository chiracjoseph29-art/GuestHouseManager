import "dotenv/config";
import { describe, expect, it } from "vitest";
import { assertAnyPermission, assertPermission, roleHasPermission } from "@/server/rbac/authorize";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/server/rbac/permissions";
import { ForbiddenError } from "@/server/lib/errors";

const admin = { role: "ADMIN" as const, canViewFinancials: false };

describe("ADMIN RBAC override", () => {
  it("passes every manager and cleaner permission via assertPermission", () => {
    const codes = [...new Set([...ROLE_PERMISSIONS.MANAGER, ...ROLE_PERMISSIONS.CLEANER])];
    for (const code of codes) {
      expect(() => assertPermission(admin, code)).not.toThrow();
    }
  });

  it("passes cleaner-only operational permissions", () => {
    expect(() => assertPermission(admin, PERMISSIONS.CLEANING_EXECUTE)).not.toThrow();
    expect(() => assertPermission(admin, PERMISSIONS.INVENTORY_VERIFY)).not.toThrow();
    expect(() => assertPermission(admin, PERMISSIONS.MAINTENANCE_REPORT)).not.toThrow();
  });

  it("passes manager finance without canViewFinancials flag", () => {
    expect(() => assertPermission(admin, PERMISSIONS.FINANCE_VIEW)).not.toThrow();
    expect(() => assertPermission(admin, PERMISSIONS.FINANCE_MANAGE)).not.toThrow();
  });

  it("passes anyOf routes used by cleaning and room inventory", () => {
    expect(() =>
      assertAnyPermission(admin, [PERMISSIONS.CLEANING_VIEW, PERMISSIONS.CLEANING_EXECUTE]),
    ).not.toThrow();
    expect(() =>
      assertAnyPermission(admin, [PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.INVENTORY_VERIFY]),
    ).not.toThrow();
    expect(() =>
      assertAnyPermission(admin, [PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_VERIFY]),
    ).not.toThrow();
  });

  it("roleHasPermission is true for admin on all defined permissions", () => {
    for (const code of Object.values(PERMISSIONS)) {
      expect(roleHasPermission("ADMIN", code)).toBe(true);
    }
  });

  it("cleaner remains blocked from finance", () => {
    expect(() =>
      assertPermission({ role: "CLEANER", canViewFinancials: false }, PERMISSIONS.FINANCE_VIEW),
    ).toThrow(ForbiddenError);
  });

  it("manager lacks permanent-delete permissions", () => {
    const manager = { role: "MANAGER" as const, canViewFinancials: true };
    for (const code of [
      PERMISSIONS.BOOKINGS_DELETE_PERMANENT,
      PERMISSIONS.ROOMS_DELETE_PERMANENT,
      PERMISSIONS.CLEANING_DELETE_PERMANENT,
      PERMISSIONS.EXPENSES_DELETE_PERMANENT,
    ]) {
      expect(() => assertPermission(manager, code)).toThrow(ForbiddenError);
    }
  });
});
