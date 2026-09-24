import {
  assignCleaningTask,
  attachCleaningPhoto,
  deleteCleaningTaskPermanent,
  listCleaningTasksForUser,
  reportCleaningVerificationIssue,
  startCleaningTask,
  submitCleaningForVerification,
  verifyCleaningTask,
} from "@/server/modules/cleaning/cleaning.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { assignCleanerSchema } from "@/server/http/schemas";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";

export const GET = withAuth(
  [PERMISSIONS.CLEANING_VIEW, PERMISSIONS.CLEANING_EXECUTE],
  async ({ user, correlationId }) => {
    const tasks = await listCleaningTasksForUser(user);
    return jsonOk({ tasks }, correlationId);
  },
  { anyOf: true },
);

export const PATCH = withAuth(
  [PERMISSIONS.CLEANING_EXECUTE, PERMISSIONS.CLEANING_MANAGE, PERMISSIONS.CLEANING_VERIFY],
  async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const action = body?.action as string;
  const taskId = body?.taskId as string;
  if (!taskId || !action) throw new ValidationError();

  if (action === "start") {
    const task = await startCleaningTask(taskId, user);
    return jsonOk({ task }, correlationId);
  }
  if (action === "complete" || action === "submit_for_verification") {
    const meta = {
      roomCleaned: body?.roomCleaned === true || body?.roomCleaned === undefined,
      inventoryChecked: body?.inventoryChecked === true || body?.inventoryChecked === undefined,
    };
    const task = await submitCleaningForVerification(taskId, user, meta);
    return jsonOk({ task }, correlationId);
  }
  if (action === "verify") {
    const task = await verifyCleaningTask(taskId, user);
    return jsonOk({ task }, correlationId);
  }
  if (action === "report_verification_issue") {
    const reason = String(body?.reason ?? "");
    const task = await reportCleaningVerificationIssue(taskId, user, { reason });
    return jsonOk({ task }, correlationId);
  }
  if (action === "attach_photo") {
    const fileId = body.fileId as string;
    if (!fileId) throw new ValidationError();
    await attachCleaningPhoto(taskId, fileId, user);
    return jsonOk({ ok: true }, correlationId);
  }
  throw new ValidationError("Unknown action.");
  },
  { anyOf: true },
);

export const DELETE = withAuth(PERMISSIONS.CLEANING_DELETE_PERMANENT, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) throw new ValidationError("id is required.");
  if (url.searchParams.get("permanent") !== "1") {
    throw new ValidationError("permanent=1 is required.");
  }
  const result = await deleteCleaningTaskPermanent(user, id);
  return jsonOk(result, correlationId);
});

export const POST = withAuth(PERMISSIONS.CLEANING_MANAGE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const parsed = assignCleanerSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError();
  const taskId = (body as { taskId?: string }).taskId;
  if (!taskId) throw new ValidationError();
  const task = await assignCleaningTask(taskId, parsed.data.cleanerId, user);
  return jsonOk({ task }, correlationId);
});
