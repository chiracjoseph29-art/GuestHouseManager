import { verifyCleaningTask } from "@/server/modules/cleaning/cleaning.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";

export const POST = withAuth(PERMISSIONS.CLEANING_VERIFY, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => ({}));
  const taskId = (body as { taskId?: string }).taskId ?? new URL(req.url).searchParams.get("id");
  if (!taskId) throw new ValidationError("taskId is required.");
  const task = await verifyCleaningTask(taskId, user);
  return jsonOk({ task }, correlationId);
});
