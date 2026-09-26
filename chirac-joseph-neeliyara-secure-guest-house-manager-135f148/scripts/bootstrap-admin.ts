import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { bootstrapAdmin } from "@/server/modules/auth/admin-bootstrap.service";

async function main(): Promise<void> {
  const admin = await bootstrapAdmin(
    {
      ADMIN_MFA_BOOTSTRAP: process.env.ADMIN_MFA_BOOTSTRAP,
      BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
      BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    },
    prisma,
  );
  console.log(`Bootstrap admin created: ${admin.email}`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Admin bootstrap failed.");
  }
  process.exitCode = 1;
});