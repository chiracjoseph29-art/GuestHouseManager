import { NextResponse } from "next/server";
import { processAndStoreImage, readStoredFile } from "@/server/modules/files/file.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import { getRateLimiter, consumeRateLimit } from "@/server/lib/rate-limit";
import type { FilePurpose } from "@/generated/prisma/client";

export const POST = withAuth(
  [PERMISSIONS.CLEANING_EXECUTE, PERMISSIONS.MAINTENANCE_REPORT],
  async ({ req, user, correlationId, meta }) => {
    const uploadLimiter = await getRateLimiter("file_upload", 30, 3600);
    await consumeRateLimit(`${user.id}`, uploadLimiter);

    const form = await req.formData();
    const file = form.get("file");
    const purpose = form.get("purpose") as FilePurpose;
    if (!(file instanceof File)) throw new ValidationError("file is required.");
    if (!purpose || !["CLEANING_PHOTO", "MAINTENANCE_PHOTO"].includes(purpose)) {
      throw new ValidationError("Invalid purpose.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileId } = await processAndStoreImage(buffer, purpose, user);
    await writeAuditLog({
      userId: user.id,
      action: "file.uploaded",
      resourceType: "stored_file",
      resourceId: fileId,
      result: "SUCCESS",
      correlationId,
      ipAddress: meta.ipAddress,
    });
    return jsonOk({ fileId }, correlationId);
  },
  { anyOf: true },
);

export const GET = withAuth(null, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("id");
  if (!fileId) throw new ValidationError("id is required.");
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new ValidationError("id is required.");
  const { buffer, mimeType, signedUrl } = await readStoredFile(fileId, user);
  if (signedUrl) {
    return NextResponse.redirect(signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, no-store",
      "X-Correlation-Id": correlationId,
    },
  });
});
