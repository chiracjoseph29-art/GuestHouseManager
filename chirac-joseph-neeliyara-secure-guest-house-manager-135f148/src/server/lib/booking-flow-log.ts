import type { NextRequest } from "next/server";
import { isDevelopment } from "@/server/config/env";
import { logger } from "@/server/lib/logger";
import type { SessionUser } from "@/server/modules/auth/session.service";

export function isBookingFlowDebug(): boolean {
  return isDevelopment() && process.env.BOOKING_FLOW_DEBUG === "true";
}

function debugEnabled(): boolean {
  return isBookingFlowDebug();
}

export function logBookingFlow(
  step: string,
  req: Pick<NextRequest, "method">,
  user: SessionUser,
  extra?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!debugEnabled()) return;
  logger.info(
    {
      bookingFlow: step,
      method: req.method,
      userId: user.id,
      userRole: user.role,
      ...extra,
    },
    "booking.flow",
  );
}
