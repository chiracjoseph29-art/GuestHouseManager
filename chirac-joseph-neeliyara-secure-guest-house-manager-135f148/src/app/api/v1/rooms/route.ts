import { prisma } from "@/server/db/prisma";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";

export const GET = withAuth(PERMISSIONS.ROOMS_VIEW, async ({ correlationId }) => {
  const rooms = await prisma.room.findMany({
    where: { isActive: true },
    include: { roomType: true },
    orderBy: { name: "asc" },
  });
  return jsonOk({ rooms }, correlationId);
});
