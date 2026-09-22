import { prisma } from "@/server/db/prisma";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createUser } from "@/server/modules/auth/auth.service";
import { createUserSchema } from "@/server/http/schemas";
import { ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import { revokeAllUserSessions } from "@/server/modules/auth/session.service";

export const GET = withAuth(PERMISSIONS.USERS_VIEW, async ({ correlationId }) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      canViewFinancials: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ users }, correlationId);
});

export const POST = withAuth(PERMISSIONS.USERS_MANAGE, async ({ req, user, correlationId, meta }) => {
  const body = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const created = await createUser({ ...parsed.data, createdById: user.id });
  await writeAuditLog({
    userId: user.id,
    action: "user.created",
    resourceType: "user",
    resourceId: created.id,
    result: "SUCCESS",
    correlationId,
    ipAddress: meta.ipAddress,
  });
  return jsonOk({ id: created.id }, correlationId);
});

export const DELETE = withAuth(PERMISSIONS.SESSIONS_REVOKE, async ({ req, user, correlationId, meta }) => {
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) throw new ValidationError("userId is required.");
  const count = await revokeAllUserSessions(targetUserId);
  await writeAuditLog({
    userId: user.id,
    action: "sessions.revoked",
    resourceType: "user",
    resourceId: targetUserId,
    result: "SUCCESS",
    metadata: { count },
    correlationId,
    ipAddress: meta.ipAddress,
  });
  return jsonOk({ revoked: count }, correlationId);
});
