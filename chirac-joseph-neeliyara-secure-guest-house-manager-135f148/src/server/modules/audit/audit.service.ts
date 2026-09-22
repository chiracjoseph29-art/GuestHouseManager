import type { AuditResult } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/server/lib/logger";

export type AuditInput = {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  result: AuditResult;
  correlationId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        result: input.result,
        correlationId: input.correlationId,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ? (input.metadata as object) : undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, "Failed to write audit log");
  }
}
