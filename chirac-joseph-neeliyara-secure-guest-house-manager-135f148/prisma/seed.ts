import "dotenv/config";
import { assertSeedAllowed } from "@/server/lib/demo-guard";
import { prisma } from "@/server/db/prisma";
import { PERMISSION_DEFINITIONS } from "@/server/rbac/permissions";
import { ROLE_PERMISSIONS } from "@/server/rbac/permissions";
import { createUser } from "@/server/modules/auth/auth.service";
import { getEnv } from "@/server/config/env";

async function main() {
  assertSeedAllowed();
  for (const def of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: def.code },
      create: def,
      update: { description: def.description },
    });
  }

  const allPerms = await prisma.permission.findMany();
  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      const perm = allPerms.find((p) => p.code === code);
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as "ADMIN" | "MANAGER" | "CLEANER", permissionId: perm.id } },
        create: { role: role as "ADMIN" | "MANAGER" | "CLEANER", permissionId: perm.id },
        update: {},
      });
    }
  }

  const env = getEnv();
  if (env.SEED_ADMIN_EMAIL && env.SEED_ADMIN_PASSWORD) {
    const existing = await prisma.user.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } });
    if (!existing) {
      await createUser({
        email: env.SEED_ADMIN_EMAIL,
        name: "System Administrator",
        password: env.SEED_ADMIN_PASSWORD,
        role: "ADMIN",
        createdById: "00000000-0000-0000-0000-000000000001",
      });
    }
  }

  const cleanerEmail = "cleaner@guesthouse.local";
  if (!(await prisma.user.findUnique({ where: { email: cleanerEmail } }))) {
    const cleaner = await createUser({
      email: cleanerEmail,
      name: "Default Cleaner",
      password: "Cleaner123!Secure",
      role: "CLEANER",
      createdById: "00000000-0000-0000-0000-000000000001",
    });
    await prisma.userInventoryPermission.create({
      data: { userId: cleaner.id, canView: true, canConsume: true, canAdjust: false },
    });
  }

  const managerEmail = "manager@guesthouse.local";
  if (!(await prisma.user.findUnique({ where: { email: managerEmail } }))) {
    await createUser({
      email: managerEmail,
      name: "House Manager",
      password: "Manager123!Secure",
      role: "MANAGER",
      canViewFinancials: true,
      createdById: "00000000-0000-0000-0000-000000000001",
    });
  }

  const category = await prisma.inventoryCategory.upsert({
    where: { name: "Housekeeping" },
    create: { name: "Housekeeping", description: "Linens and supplies" },
    update: {},
  });

  await prisma.inventoryItem.upsert({
    where: { name_categoryId: { name: "Towels", categoryId: category.id } },
    create: {
      name: "Towels",
      categoryId: category.id,
      quantity: 50,
      minimumThreshold: 10,
      unit: "pieces",
      location: "Linen closet",
    },
    update: {},
  });

  const roomType = await prisma.roomType.upsert({
    where: { name: "Standard Double" },
    create: { name: "Standard Double", maxGuests: 2, baseRate: 2500 },
    update: {},
  });

  for (const name of ["Rose Room", "Lotus Room", "Garden Suite"]) {
    await prisma.room.upsert({
      where: { name },
      create: { name, roomTypeId: roomType.id, floor: "1" },
      update: {},
    });
  }

  const rooms = await prisma.room.findMany();
  for (const room of rooms) {
    const existingTask = await prisma.cleaningTask.findFirst({
      where: { roomId: room.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    if (!existingTask) {
      await prisma.cleaningTask.create({
        data: { roomId: room.id, status: "PENDING", dueAt: new Date() },
      });
    }
  }

  const policies = [
    { dataCategory: "cleaning_photos", retentionDays: 365 },
    { dataCategory: "guest_contact", retentionDays: 1095 },
    { dataCategory: "audit_logs", retentionDays: 2555 },
    { dataCategory: "financial_records", retentionDays: 2555 },
  ];
  for (const p of policies) {
    await prisma.retentionPolicy.upsert({
      where: { dataCategory: p.dataCategory },
      create: p,
      update: { retentionDays: p.retentionDays },
    });
  }

  const cleaner = await prisma.user.findUnique({ where: { email: cleanerEmail } });
  if (cleaner) {
    const openTasks = await prisma.cleaningTask.findMany({ where: { assignedToId: null }, take: 3 });
    for (const t of openTasks) {
      await prisma.cleaningTask.update({ where: { id: t.id }, data: { assignedToId: cleaner.id } });
    }
    await prisma.userInventoryPermission.upsert({
      where: { userId: cleaner.id },
      create: { userId: cleaner.id, canView: true, canConsume: true, canAdjust: false },
      update: { canView: true, canConsume: true },
    });
  }

  await prisma.privacyNotice.upsert({
    where: { version: "1.0" },
    create: {
      version: "1.0",
      active: true,
      content:
        "We collect guest name and contact details solely to manage reservations and housekeeping. Data is retained per configurable policies and may be anonymized upon request where applicable under Indian law.",
    },
    update: { active: true },
  });

  await prisma.systemSetting.upsert({
    where: { key: "privacy.purpose_limitation" },
    create: { key: "privacy.purpose_limitation", value: { enabled: true } },
    update: {},
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
