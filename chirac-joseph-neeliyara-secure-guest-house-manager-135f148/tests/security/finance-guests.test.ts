import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { listInventory } from "@/server/modules/inventory/inventory.service";
import { createExpense, updateExpense } from "@/server/modules/finance/expense.service";
import { getFinancialOverview } from "@/server/modules/finance/finance.service";
import { listCustomers, getCustomerProfile } from "@/server/modules/guests/guest.service";
import { ForbiddenError, ValidationError } from "@/server/lib/errors";

async function adminUser() {
  const user = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  expect(user).toBeTruthy();
  return {
    id: user!.id,
    email: user!.email,
    name: user!.name,
    role: "ADMIN" as const,
    status: "ACTIVE" as const,
    canViewFinancials: true,
    mfaEnabled: false,
  };
}

const cleaner = {
  id: "00000000-0000-0000-0000-000000000002",
  email: "cleaner@guesthouse.local",
  name: "Cleaner",
  role: "CLEANER" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: false,
};

describe("inventory API data", () => {
  it("serializes items with optional relations", async () => {
    const admin = await adminUser();
    const result = await listInventory(admin);
    expect(JSON.stringify(result)).toBeTruthy();
  });
});

describe("expenses", () => {
  it("creates and updates an expense", async () => {
    const admin = await adminUser();
    const created = await createExpense(admin, {
      date: new Date(),
      category: "Other",
      description: "Test expense",
      amount: 100,
      paymentMethod: "CASH",
    });
    expect(created.amount).toBe(100);
    const updated = await updateExpense(admin, created.id, { amount: 150, description: "Updated" });
    expect(updated.amount).toBe(150);
  });

  it("rejects non-positive amount", async () => {
    const admin = await adminUser();
    await expect(
      createExpense(admin, {
        date: new Date(),
        category: "Other",
        description: "Bad",
        amount: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects cleaner mutations", async () => {
    await expect(
      createExpense(cleaner, {
        date: new Date(),
        category: "Other",
        description: "Nope",
        amount: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("finance overview", () => {
  it("returns income, expenses, and net for month", async () => {
    const admin = await adminUser();
    const overview = await getFinancialOverview(admin, "month");
    expect(overview.summary.income).toBeGreaterThanOrEqual(0);
    expect(overview.summary.expenses).toBeGreaterThanOrEqual(0);
    expect(overview.summary.net).toBe(overview.summary.income - overview.summary.expenses);
  });
});

describe("customers", () => {
  it("lists customers with aggregates", async () => {
    const admin = await adminUser();
    const customers = await listCustomers(admin);
    expect(Array.isArray(customers)).toBe(true);
    if (customers[0]) {
      const profile = await getCustomerProfile(admin, customers[0].id);
      expect(profile.stats.stayCount).toBeGreaterThanOrEqual(0);
      expect(profile.stats.totalPaid).toBeGreaterThanOrEqual(0);
    }
  });

  it("blocks cleaner from customer list", async () => {
    await expect(listCustomers(cleaner)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
