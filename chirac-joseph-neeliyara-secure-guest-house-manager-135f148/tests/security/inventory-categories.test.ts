import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { INVENTORY_CATEGORY_SEED } from "@/server/rbac/inventory-categories";

describe("inventory categories", () => {
  it("includes all six standard categories", async () => {
    const names = INVENTORY_CATEGORY_SEED.map((c) => c.name);
    const rows = await prisma.inventoryCategory.findMany({
      where: { name: { in: names } },
      orderBy: { name: "asc" },
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.name)).toEqual([...names].sort());
  });

  it("keeps housekeeping items on the Housekeeping category", async () => {
    const housekeeping = await prisma.inventoryCategory.findUnique({ where: { name: "Housekeeping" } });
    expect(housekeeping).toBeTruthy();
    const towels = await prisma.inventoryItem.findFirst({ where: { name: "Towels" } });
    if (towels) {
      expect(towels.categoryId).toBe(housekeeping!.id);
    }
  });
});
