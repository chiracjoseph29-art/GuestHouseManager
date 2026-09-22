import { prisma } from "@/server/db/prisma";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";

export const GET = withAuth(PERMISSIONS.AUDIT_VIEW, async ({ req, correlationId }) => {
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      resourceType: true,
      resourceId: true,
      result: true,
      correlationId: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });
  return jsonOk({ logs }, correlationId);
});
