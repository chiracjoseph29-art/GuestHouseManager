import { jsonOk, withAuth } from "@/server/http/api-handler";
import { getOperationsOverview } from "@/server/modules/operations/overview.service";
import { PERMISSIONS } from "@/server/rbac/permissions";

export const GET = withAuth(
  [
    PERMISSIONS.BOOKINGS_VIEW,
    PERMISSIONS.CLEANING_VIEW,
    PERMISSIONS.CLEANING_EXECUTE,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
  ],
  async ({ user, correlationId }) => {
    const overview = await getOperationsOverview(user);
    return jsonOk(overview, correlationId);
  },
  { anyOf: true },
);
