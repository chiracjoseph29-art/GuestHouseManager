import { z } from "zod";
import { hashPassword } from "@/server/lib/crypto";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/lib/errors";

const bootstrapInputSchema = z.object({
  ADMIN_MFA_BOOTSTRAP: z.literal("true"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(200),
});

type BootstrapTransaction = {
  user: {
    count(args: { where: { role: "ADMIN" } }): Promise<number>;
    create(args: { data: {
      email: string;
      name: string;
      passwordHash: string;
      role: "ADMIN";
      status: "ACTIVE";
      canViewFinancials: boolean;
      mfaEnabled: boolean;
      passwordChangedAt: Date;
    }; select: { id: true } }): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: { data: {
      userId: null;
      action: string;
      resourceType: string;
      resourceId: string;
      result: "SUCCESS";
      metadata: object;
    } }): Promise<unknown>;
  };
};

export type BootstrapDatabase = {
  $transaction<T>(
    fn: (transaction: BootstrapTransaction) => Promise<T>,
    options?: { isolationLevel?: "Serializable" },
  ): Promise<T>;
};

export type BootstrapEnvironment = {
  ADMIN_MFA_BOOTSTRAP?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
};

export async function bootstrapAdmin(
  environment: BootstrapEnvironment,
  database: BootstrapDatabase,
): Promise<{ id: string; email: string }> {
  if (environment.ADMIN_MFA_BOOTSTRAP !== "true") {
    throw new ForbiddenError("Admin bootstrap is disabled.");
  }

  const parsed = bootstrapInputSchema.safeParse(environment);
  if (!parsed.success) {
    throw new ValidationError("Bootstrap admin credentials are invalid.");
  }

  const email = parsed.data.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.BOOTSTRAP_ADMIN_PASSWORD);

  return database.$transaction(
    async (transaction) => {
      const adminCount = await transaction.user.count({ where: { role: "ADMIN" } });
      if (adminCount > 0) {
        throw new ConflictError("An ADMIN user already exists.");
      }

      const user = await transaction.user.create({
        data: {
          email,
          name: "System Administrator",
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE",
          canViewFinancials: false,
          mfaEnabled: false,
          passwordChangedAt: new Date(),
        },
        select: { id: true },
      });

      await transaction.auditLog.create({
        data: {
          userId: null,
          action: "auth.bootstrap_admin.created",
          resourceType: "user",
          resourceId: user.id,
          result: "SUCCESS",
          metadata: { source: "bootstrap-cli" },
        },
      });

      return { id: user.id, email };
    },
    { isolationLevel: "Serializable" },
  );
}