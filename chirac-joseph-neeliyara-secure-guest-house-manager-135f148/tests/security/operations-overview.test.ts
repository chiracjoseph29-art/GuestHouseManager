import "dotenv/config";
import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { getOperationsOverview } from "@/server/modules/operations/overview.service";
import type { SessionUser } from "@/server/modules/auth/session.service";

function sessionFromUser(u: {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CLEANER";
  canViewFinancials?: boolean;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: "ACTIVE",
    canViewFinancials: u.canViewFinancials ?? false,
    mfaEnabled: false,
  };
}

describe("operations overview", () => {
  it("admin receives booking, cleaning, finance, and inventory aggregates from the database", async () => {
    const adminRow = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!adminRow) return;
    const admin = sessionFromUser({ ...adminRow, role: "ADMIN", canViewFinancials: true });
    const overview = await getOperationsOverview(admin);

    expect(overview.role).toBe("ADMIN");
    expect(overview.bookings).toBeDefined();
    const bookings = overview.bookings as {
      todayCount: number;
      checkInsToday: number;
      occupiedRooms: number;
      availableRooms: number;
    };
    expect(bookings.todayCount).toBeGreaterThanOrEqual(0);
    expect(bookings.checkInsToday).toBeGreaterThanOrEqual(0);
    expect(bookings.occupiedRooms).toBeGreaterThanOrEqual(0);
    expect(bookings.availableRooms).toBeGreaterThanOrEqual(0);

    expect(overview.cleaning).toBeDefined();
    const cleaning = overview.cleaning as { awaitingVerification: number; completedToday: number };
    expect(cleaning.awaitingVerification).toBeGreaterThanOrEqual(0);
    expect(cleaning.completedToday).toBeGreaterThanOrEqual(0);

    expect(overview.finance).toBeDefined();
    const finance = overview.finance as { monthRevenue: number; netCashFlowMonth: number };
    expect(finance.monthRevenue).toBeGreaterThanOrEqual(0);
    expect(typeof finance.netCashFlowMonth).toBe("number");

    expect(overview.inventory).toBeDefined();
  });

  it("cleaner does not receive finance section", async () => {
    const cleanerRow = await prisma.user.findUnique({ where: { email: "cleaner@guesthouse.local" } });
    if (!cleanerRow) return;
    const cleaner = sessionFromUser({ ...cleanerRow, role: "CLEANER" });
    const overview = await getOperationsOverview(cleaner);
    expect(overview.finance).toBeUndefined();
    expect(overview.cleaning).toBeDefined();
  });

  it("manager without financials does not receive finance section", async () => {
    const mgrRow = await prisma.user.findFirst({ where: { role: "MANAGER" } });
    if (!mgrRow) return;
    const manager = sessionFromUser({ ...mgrRow, role: "MANAGER", canViewFinancials: false });
    const overview = await getOperationsOverview(manager);
    expect(overview.finance).toBeUndefined();
  });
});
