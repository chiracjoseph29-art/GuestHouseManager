import { NextRequest } from "next/server";
import {
  assignCleaningTask,
  attachCleaningPhoto,
  completeCleaningTask,
  listCleaningTasksForUser,
  startCleaningTask,
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

export const PATCH = withAuth(PERMISSIONS.CLEANING_EXECUTE, async ({ req, user, correlationId }) => {
  const body = await req.json().catch(() => null);
  const action = body?.action as string;
  const taskId = body?.taskId as string;
  if (!taskId || !action) throw new ValidationError();

  if (action === "start") {
    const task = await startCleaningTask(taskId, user);
    return jsonOk({ task }, correlationId);
  }
  if (action === "complete") {
    const task = await completeCleaningTask(taskId, user);
    return jsonOk({ task }, correlationId);
  }
  if (action === "attach_photo") {
    const fileId = body.fileId as string;
    if (!fileId) throw new ValidationError();
    await attachCleaningPhoto(taskId, fileId, user);
    return jsonOk({ ok: true }, correlationId);
  }
  throw new ValidationError("Unknown action.");
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
