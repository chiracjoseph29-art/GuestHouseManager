import "dotenv/config";
import { describe, expect, it } from "vitest";
import { listInventory } from "@/server/modules/inventory/inventory.service";
import { prisma } from "@/server/db/prisma";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ForbiddenError } from "@/server/lib/errors";

const admin = {
  id: "",
  email: "admin@guesthouse.local",
  name: "Admin",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  canViewFinancials: true,
  mfaEnabled: false,
};

describe("inventory list", () => {
  it("cleaner role cannot pass inventory.view RBAC on API", () => {
    expect(() =>
      assertPermission({ role: "CLEANER", canViewFinancials: false }, PERMISSIONS.INVENTORY_VIEW),
    ).toThrow(ForbiddenError);
  });

  it("loads items with optional reference photo and categories", async () => {
    const user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    expect(user).toBeTruthy();
    const result = await listInventory({ ...admin, id: user!.id });
    expect(Array.isArray(result.items)).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
    for (const item of result.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("assignedQuantity");
      expect(JSON.stringify(item)).toBeTruthy();
    }
  });
});
