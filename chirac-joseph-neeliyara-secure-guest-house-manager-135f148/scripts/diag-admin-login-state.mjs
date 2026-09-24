import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "";
let dbHost = "unknown";
try {
  dbHost = new URL(url.replace(/^postgresql:/, "http:")).hostname;
} catch {
  /* ignore */
}

const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const admin = await prisma.user.findUnique({
  where: { email: "admin@guesthouse.local" },
  select: {
    id: true,
    email: true,
    status: true,
    failedLoginAttempts: true,
    lockedUntil: true,
    mfaEnabled: true,
    role: true,
  },
});

const recent = await prisma.auditLog.findMany({
  where: { action: { startsWith: "auth.login" } },
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    action: true,
    result: true,
    createdAt: true,
    ipAddress: true,
    userAgent: true,
  },
});

console.log(
  JSON.stringify(
    {
      dbHost,
      nodeEnv: process.env.NODE_ENV,
      admin: admin
        ? {
            found: true,
            status: admin.status,
            failedLoginAttempts: admin.failedLoginAttempts,
            locked: !!(admin.lockedUntil && admin.lockedUntil > new Date()),
            mfaEnabled: admin.mfaEnabled,
            role: admin.role,
          }
        : { found: false },
      recent,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
await pool.end();
