/**
 * Clear operational demo/test data while preserving users and configuration.
 *
 * Usage:
 *   npx tsx scripts/clear-operational-demo-data.ts           # dry-run (default)
 *   npx tsx scripts/clear-operational-demo-data.ts --confirm CLEAR-OPERATIONAL-DATA
 *
 * Or: npm run db:clear-ops
 *     npm run db:clear-ops -- --confirm CLEAR-OPERATIONAL-DATA
 *
 * PRESERVES: users, sessions, MFA, permissions, role permissions,
 * user inventory permissions, room types, inventory categories,
 * system settings, retention policies, privacy notices, audit logs,
 * schema/migrations.
 *
 * REMOVES: rooms, guests, bookings, payments, expenses, cleaning,
 * inventory items (+ room assignments / txs / verifications),
 * maintenance issues, notifications, data-subject requests,
 * and associated uploaded files (DB + local disk when safe).
 */
import "dotenv/config";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "../src/server/db/prisma";
import { getEnv, isProduction } from "../src/server/config/env";

const CONFIRM_PHRASE = "CLEAR-OPERATIONAL-DATA";

type Counts = {
  rooms: number;
  guests: number;
  bookings: number;
  bookingRooms: number;
  payments: number;
  expenses: number;
  cleaningTasks: number;
  cleaningPhotos: number;
  inventoryItems: number;
  roomInventories: number;
  inventoryTransactions: number;
  inventoryVerifications: number;
  maintenanceIssues: number;
  maintenancePhotos: number;
  storedFiles: number;
  notifications: number;
  dataSubjectRequests: number;
  // preserved (shown for verification)
  users: number;
  permissions: number;
  rolePermissions: number;
  roomTypes: number;
  inventoryCategories: number;
  userInventoryPermissions: number;
  systemSettings: number;
  retentionPolicies: number;
  privacyNotices: number;
  auditLogs: number;
};

async function snapshot(): Promise<Counts> {
  const [
    rooms,
    guests,
    bookings,
    bookingRooms,
    payments,
    expenses,
    cleaningTasks,
    cleaningPhotos,
    inventoryItems,
    roomInventories,
    inventoryTransactions,
    inventoryVerifications,
    maintenanceIssues,
    maintenancePhotos,
    storedFiles,
    notifications,
    dataSubjectRequests,
    users,
    permissions,
    rolePermissions,
    roomTypes,
    inventoryCategories,
    userInventoryPermissions,
    systemSettings,
    retentionPolicies,
    privacyNotices,
    auditLogs,
  ] = await Promise.all([
    prisma.room.count(),
    prisma.guest.count(),
    prisma.booking.count(),
    prisma.bookingRoom.count(),
    prisma.payment.count(),
    prisma.expense.count(),
    prisma.cleaningTask.count(),
    prisma.cleaningPhoto.count(),
    prisma.inventoryItem.count(),
    prisma.roomInventory.count(),
    prisma.inventoryTransaction.count(),
    prisma.inventoryVerification.count(),
    prisma.maintenanceIssue.count(),
    prisma.maintenancePhoto.count(),
    prisma.storedFile.count(),
    prisma.notification.count(),
    prisma.dataSubjectRequest.count(),
    prisma.user.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    prisma.roomType.count(),
    prisma.inventoryCategory.count(),
    prisma.userInventoryPermission.count(),
    prisma.systemSetting.count(),
    prisma.retentionPolicy.count(),
    prisma.privacyNotice.count(),
    prisma.auditLog.count(),
  ]);

  return {
    rooms,
    guests,
    bookings,
    bookingRooms,
    payments,
    expenses,
    cleaningTasks,
    cleaningPhotos,
    inventoryItems,
    roomInventories,
    inventoryTransactions,
    inventoryVerifications,
    maintenanceIssues,
    maintenancePhotos,
    storedFiles,
    notifications,
    dataSubjectRequests,
    users,
    permissions,
    rolePermissions,
    roomTypes,
    inventoryCategories,
    userInventoryPermissions,
    systemSettings,
    retentionPolicies,
    privacyNotices,
    auditLogs,
  };
}

function printPlan(before: Counts): void {
  console.log(`
════════════════════════════════════════════════════════════
 Clear operational demo/test data (Guest House Manager)
════════════════════════════════════════════════════════════

WILL REMOVE (current counts):
  rooms                          ${before.rooms}
  guests                         ${before.guests}
  bookings                       ${before.bookings}
  booking_rooms                  ${before.bookingRooms}
  payments                       ${before.payments}
  expenses                       ${before.expenses}
  cleaning_tasks                 ${before.cleaningTasks}
  cleaning_photos                ${before.cleaningPhotos}
  inventory_items                ${before.inventoryItems}
  room_inventory                 ${before.roomInventories}
  inventory_transactions         ${before.inventoryTransactions}
  inventory_verifications        ${before.inventoryVerifications}
  maintenance_issues             ${before.maintenanceIssues}
  maintenance_photos             ${before.maintenancePhotos}
  stored_files (+ local disks)   ${before.storedFiles}
  notifications                  ${before.notifications}
  data_subject_requests          ${before.dataSubjectRequests}

WILL PRESERVE:
  users                          ${before.users}
  permissions                    ${before.permissions}
  role_permissions               ${before.rolePermissions}
  user_inventory_permissions     ${before.userInventoryPermissions}
  room_types                     ${before.roomTypes}
  inventory_categories           ${before.inventoryCategories}
  system_settings                ${before.systemSettings}
  retention_policies             ${before.retentionPolicies}
  privacy_notices                ${before.privacyNotices}
  audit_logs                     ${before.auditLogs}
  schema / migrations / app code (unchanged)

NOTES:
  • This clears ALL current operational records (seed demo rooms,
    vitest race rooms, bookings, guests, finance txs, inventory items).
  • Intended as a one-time clean slate before entering real property data.
  • Does NOT drop/recreate the PostgreSQL database.
  • Does NOT delete users (Admin / Manager / Cleaner) or auth config.
`);
}

async function deleteLocalFileIfSafe(storageKey: string): Promise<boolean> {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "local") return false;
  const base = path.resolve(env.STORAGE_LOCAL_PATH);
  const resolved = path.resolve(base, storageKey);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    console.warn(`  skip unsafe path for storage key`);
    return false;
  }
  try {
    await unlink(resolved);
    return true;
  } catch {
    return false;
  }
}

async function clearOperationalData(): Promise<{ deletedFiles: number; unlinkedFiles: number }> {
  // Collect file keys before tearing down relations.
  const files = await prisma.storedFile.findMany({ select: { id: true, storageKey: true } });

  await prisma.$transaction(async (tx) => {
    // Break optional FKs that point at StoredFile before deleting files.
    await tx.cleaningTask.updateMany({ data: { completionPhotoId: null } });
    await tx.inventoryItem.updateMany({ data: { referencePhotoId: null } });

    // Leaf / join tables first.
    await tx.cleaningPhoto.deleteMany();
    await tx.maintenancePhoto.deleteMany();
    await tx.inventoryVerification.deleteMany();
    await tx.inventoryTransaction.deleteMany();
    await tx.roomInventory.deleteMany();

    await tx.payment.deleteMany();
    await tx.cleaningTask.deleteMany();
    await tx.bookingRoom.deleteMany();
    await tx.booking.deleteMany();
    await tx.guest.deleteMany();
    await tx.expense.deleteMany();

    await tx.maintenanceIssue.deleteMany();
    await tx.inventoryItem.deleteMany();
    await tx.room.deleteMany();

    await tx.notification.deleteMany();
    await tx.dataSubjectRequest.deleteMany();

    // Files last (no remaining FKs into stored_files).
    await tx.storedFile.deleteMany();
  });

  let unlinked = 0;
  for (const f of files) {
    if (await deleteLocalFileIfSafe(f.storageKey)) unlinked += 1;
  }

  return { deletedFiles: files.length, unlinkedFiles: unlinked };
}

function assertPreserved(before: Counts, after: Counts): void {
  const checks: Array<[keyof Counts, string]> = [
    ["users", "users"],
    ["permissions", "permissions"],
    ["rolePermissions", "role_permissions"],
    ["userInventoryPermissions", "user_inventory_permissions"],
    ["roomTypes", "room_types"],
    ["inventoryCategories", "inventory_categories"],
    ["systemSettings", "system_settings"],
    ["retentionPolicies", "retention_policies"],
    ["privacyNotices", "privacy_notices"],
    ["auditLogs", "audit_logs"],
  ];
  const failures: string[] = [];
  for (const [key, label] of checks) {
    if (after[key] !== before[key]) {
      failures.push(`${label}: before=${before[key]} after=${after[key]}`);
    }
  }
  if (failures.length) {
    throw new Error(`Preservation check failed:\n  ${failures.join("\n  ")}`);
  }
}

function assertCleared(after: Counts): void {
  const ops: Array<[keyof Counts, string]> = [
    ["rooms", "rooms"],
    ["guests", "guests"],
    ["bookings", "bookings"],
    ["bookingRooms", "booking_rooms"],
    ["payments", "payments"],
    ["expenses", "expenses"],
    ["cleaningTasks", "cleaning_tasks"],
    ["cleaningPhotos", "cleaning_photos"],
    ["inventoryItems", "inventory_items"],
    ["roomInventories", "room_inventory"],
    ["inventoryTransactions", "inventory_transactions"],
    ["inventoryVerifications", "inventory_verifications"],
    ["maintenanceIssues", "maintenance_issues"],
    ["maintenancePhotos", "maintenance_photos"],
    ["storedFiles", "stored_files"],
    ["notifications", "notifications"],
    ["dataSubjectRequests", "data_subject_requests"],
  ];
  const remaining = ops.filter(([key]) => after[key] > 0);
  if (remaining.length) {
    throw new Error(
      `Operational data still present:\n  ${remaining.map(([k, l]) => `${l}=${after[k]}`).join("\n  ")}`,
    );
  }
}

async function main(): Promise<void> {
  if (isProduction() && process.env.ALLOW_PROD_CLEAR_OPS !== "true") {
    console.error("Refusing to run in production. Set ALLOW_PROD_CLEAR_OPS=true only if you intend this.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const confirmIdx = args.indexOf("--confirm");
  const confirmArg = confirmIdx >= 0 ? args[confirmIdx + 1] : undefined;
  const dryRun = confirmArg !== CONFIRM_PHRASE;

  const before = await snapshot();
  printPlan(before);

  if (dryRun) {
    console.log(`DRY RUN — no rows deleted.
To execute, re-run with:
  npm run db:clear-ops -- --confirm ${CONFIRM_PHRASE}
`);
    return;
  }

  console.log("Executing cleanup in a single transaction…");
  const { deletedFiles, unlinkedFiles } = await clearOperationalData();
  const after = await snapshot();

  assertPreserved(before, after);
  assertCleared(after);

  console.log(`
════════════════════════════════════════════════════════════
 Cleanup complete
════════════════════════════════════════════════════════════
  stored_file rows removed: ${deletedFiles}
  local disk files unlinked: ${unlinkedFiles}
  (S3 objects are not deleted automatically if STORAGE_DRIVER=s3)

PRESERVED (unchanged):
  users=${after.users}  room_types=${after.roomTypes}  inventory_categories=${after.inventoryCategories}
  permissions=${after.permissions}  role_permissions=${after.rolePermissions}
  audit_logs=${after.auditLogs}

CLEARED:
  rooms=${after.rooms}  guests=${after.guests}  bookings=${after.bookings}
  payments=${after.payments}  expenses=${after.expenses}
  cleaning_tasks=${after.cleaningTasks}  inventory_items=${after.inventoryItems}
  stored_files=${after.storedFiles}

You can now create real rooms, guests, bookings, and inventory.
Room types and inventory categories are ready for use.
`);
}

main()
  .catch(async (err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
