import { describe, it, expect } from "vitest";
import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { attachCleaningPhoto, getCleaningTask } from "@/server/modules/cleaning/cleaning.service";
import { ForbiddenError } from "@/server/lib/errors";
import { processAndStoreImage, readStoredFile } from "@/server/modules/files/file.service";
import { createUser } from "@/server/modules/auth/auth.service";
import { listBookings } from "@/server/modules/bookings/booking.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { minimalJpegBuffer } from "../helpers/minimal-jpeg";

describe("IDOR / BOLA", () => {
  it("cleaner cannot access another cleaner's task", async () => {
    const cleanerA = await prisma.user.findUniqueOrThrow({ where: { email: "cleaner@guesthouse.local" } });
    const taskForA = await prisma.cleaningTask.findFirstOrThrow({ where: { assignedToId: cleanerA.id } });

    const cleanerBEmail = "cleaner2@guesthouse.local";
    let cleanerB = await prisma.user.findUnique({ where: { email: cleanerBEmail } });
    if (!cleanerB) {
      await createUser({
        email: cleanerBEmail,
        name: "Cleaner Two",
        password: "Cleaner123!Secure",
        role: "CLEANER",
        createdById: cleanerA.id,
      });
      cleanerB = await prisma.user.findUniqueOrThrow({ where: { email: cleanerBEmail } });
    }

    await expect(getCleaningTask(taskForA.id, cleanerB)).rejects.toThrow(ForbiddenError);
  });

  it("cleaner cannot attach another user's uploaded file to their task", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const cleaner = await prisma.user.findUniqueOrThrow({ where: { email: "cleaner@guesthouse.local" } });
    const task = await prisma.cleaningTask.findFirstOrThrow({ where: { assignedToId: cleaner.id } });

    const jpeg = await minimalJpegBuffer();
    const adminFile = await processAndStoreImage(jpeg, "CLEANING_PHOTO", admin);
    await expect(attachCleaningPhoto(task.id, adminFile.fileId, cleaner)).rejects.toThrow(ForbiddenError);
  });

  it("cleaner cannot download unrelated admin file", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@guesthouse.local" } });
    const cleaner = await prisma.user.findUniqueOrThrow({ where: { email: "cleaner@guesthouse.local" } });
    const jpeg = await minimalJpegBuffer();
    const adminFile = await processAndStoreImage(jpeg, "OTHER", admin);
    await expect(readStoredFile(adminFile.fileId, cleaner)).rejects.toThrow(ForbiddenError);
  });

  it("cleaner cannot list bookings via service layer", async () => {
    const cleaner = await prisma.user.findUniqueOrThrow({ where: { email: "cleaner@guesthouse.local" } });
    await expect(listBookings(cleaner)).rejects.toThrow(ForbiddenError);
  });

  it("cleaner cannot access finance permission", () => {
    expect(() =>
      assertPermission({ role: "CLEANER", canViewFinancials: false }, PERMISSIONS.FINANCE_VIEW),
    ).toThrow(ForbiddenError);
  });
});
